/**
 * POST /api/brand-scan
 *
 * Scans a single media file for visible brand logos against all brands in the
 * event that have a reference logo uploaded. Sends all reference logos and the
 * candidate photo in one Claude Vision call.
 *
 * Body: { event_id: string; media_file_id: string }
 *
 * Returns: { results: { brand_id, name, found, confidence }[]; tags_created: number }
 */

import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@supabase/supabase-js'
import { signStoragePaths } from '@/lib/supabase/storage'
import { requireApiUser } from '@/lib/api-auth'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })

const CONFIDENCE_THRESHOLD = 0.6

function getServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  )
}

interface MatchResult {
  brand_index: number
  confidence: number
}

interface ScanOutput {
  matches: MatchResult[]
}

export async function POST(request: NextRequest) {
  const auth = await requireApiUser()
  if (auth.response) return auth.response

  try {
    const body = await request.json() as { event_id?: string; media_file_id?: string }
    const { event_id, media_file_id } = body

    if (!event_id || !media_file_id) {
      return NextResponse.json({ error: 'Missing event_id or media_file_id' }, { status: 400 })
    }

    const supabase = getServiceClient()

    const [brandsResult, mediaResult] = await Promise.all([
      supabase
        .from('brands')
        .select('id, name, reference_storage_path')
        .eq('event_id', event_id)
        .not('reference_storage_path', 'is', null),
      supabase
        .from('media_files')
        .select('id, storage_path, file_type, organisation_id')
        .eq('id', media_file_id)
        .single(),
    ])

    if (mediaResult.error || !mediaResult.data) {
      return NextResponse.json({ error: 'Media file not found' }, { status: 404 })
    }

    const brands    = brandsResult.data ?? []
    const mediaFile = mediaResult.data

    // Always mark as scanned so we don't re-process on every refresh
    await supabase
      .from('media_files')
      .update({ brand_scanned: true })
      .eq('id', media_file_id)

    if (mediaFile.file_type !== 'image' || !brands.length) {
      return NextResponse.json({ results: [], tags_created: 0 })
    }

    // Generate signed URLs for the media file and all brand reference logos in one batch
    const pathsToSign = [
      mediaFile.storage_path,
      ...brands.map((b) => b.reference_storage_path as string),
    ]
    const signedUrls   = await signStoragePaths(pathsToSign, 3600)
    const mediaSignedUrl = signedUrls.get(mediaFile.storage_path) ?? ''

    // ── One Claude Vision call for all brands ─────────────────────────────────

    type MessageContent = Anthropic.Messages.MessageParam['content']
    const content: MessageContent = [
      {
        type: 'text',
        text: `You will see ${brands.length} brand logo(s), then an event photo. For each brand, determine whether its logo or branding is clearly visible in the event photo. Only report a match if the logo is genuinely visible and recognisable — not just because the brand could plausibly be present.`,
      },
    ]

    for (const [i, brand] of brands.entries()) {
      content.push({ type: 'text', text: `Brand ${i + 1}: ${brand.name}` })
      const refUrl = signedUrls.get(brand.reference_storage_path as string) ?? ''
      content.push({ type: 'image', source: { type: 'url', url: refUrl } })
    }

    content.push({ type: 'text', text: 'Event photo to scan for visible logos/branding:' })
    content.push({ type: 'image', source: { type: 'url', url: mediaSignedUrl } })

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 512,
      tools: [
        {
          name: 'report_brand_matches',
          description: 'Report which brand logos are clearly visible in the event photo.',
          input_schema: {
            type: 'object' as const,
            properties: {
              matches: {
                type: 'array',
                description: 'One entry per brand whose logo is visibly present. Omit brands not clearly visible.',
                items: {
                  type: 'object',
                  properties: {
                    brand_index: {
                      type: 'number',
                      description: '0-based index of the brand (0 = Brand 1, 1 = Brand 2, …)',
                    },
                    confidence: {
                      type: 'number',
                      description: 'Confidence 0–1 that this brand\'s logo is visible. Only report if > 0.5.',
                    },
                  },
                  required: ['brand_index', 'confidence'],
                },
              },
            },
            required: ['matches'],
          },
        },
      ],
      tool_choice: { type: 'tool', name: 'report_brand_matches' },
      messages: [{ role: 'user', content }],
    })

    const toolBlock  = response.content.find((b) => b.type === 'tool_use')
    const scanOutput = toolBlock && toolBlock.type === 'tool_use'
      ? (toolBlock.input as ScanOutput)
      : { matches: [] }

    let tagsCreated = 0
    const results: { brand_id: string; name: string; found: boolean; confidence: number }[] = []

    for (const [i, brand] of brands.entries()) {
      const match      = scanOutput.matches.find((m) => m.brand_index === i)
      const found      = !!match && match.confidence >= CONFIDENCE_THRESHOLD
      const confidence = match?.confidence ?? 0

      results.push({ brand_id: brand.id, name: brand.name, found, confidence })

      if (found) {
        const { error: tagErr } = await supabase
          .from('brand_tags')
          .upsert(
            { media_file_id, brand_id: brand.id, confidence, organisation_id: mediaResult.data.organisation_id },
            { onConflict: 'media_file_id,brand_id' }
          )
        if (!tagErr) tagsCreated++
        else console.error('[brand-scan] brand_tag upsert error:', tagErr)
      }
    }

    return NextResponse.json({ results, tags_created: tagsCreated })
  } catch (err) {
    console.error('[brand-scan] error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
