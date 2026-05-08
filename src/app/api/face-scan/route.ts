/**
 * POST /api/face-scan
 *
 * Scans a single media file against all performers in the event that have a
 * reference photo. Uses Claude Vision: sends all reference portraits + the
 * candidate photo in one request so cost scales with photos, not performers.
 *
 * Body: { event_id: string; media_file_id: string }
 *
 * Returns: { results: { performer_id, name, found, confidence }[]; tags_created: number }
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
  /** 0-based index into the performers array sent to Claude */
  performer_index: number
  /** 0–1 confidence that this performer appears in the event photo */
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

    // Fetch performers with reference photos
    const { data: performers, error: pErr } = await supabase
      .from('performers')
      .select('id, name, role, reference_storage_path')
      .eq('event_id', event_id)
      .not('reference_storage_path', 'is', null)

    if (pErr) return NextResponse.json({ error: pErr.message }, { status: 500 })

    // Fetch the candidate media file
    const { data: mediaFile, error: mErr } = await supabase
      .from('media_files')
      .select('id, storage_path, file_type')
      .eq('id', media_file_id)
      .single()

    if (mErr || !mediaFile) {
      return NextResponse.json({ error: 'Media file not found' }, { status: 404 })
    }

    // Generate signed URLs for all paths in one batch
    const pathsToSign = [
      mediaFile.storage_path,
      ...((performers ?? []).map((p) => p.reference_storage_path as string)),
    ]
    const signedUrls = await signStoragePaths(pathsToSign, 3600)
    const mediaSignedUrl = signedUrls.get(mediaFile.storage_path) ?? ''

    // Mark as scanned regardless of outcome — avoids re-scanning on every refresh
    await supabase
      .from('media_files')
      .update({ face_scanned: true })
      .eq('id', media_file_id)

    // Non-images or events with no reference photos → nothing to do
    if (mediaFile.file_type !== 'image' || !performers?.length) {
      return NextResponse.json({ results: [], tags_created: 0 })
    }

    // ── Build the Claude Vision prompt ────────────────────────────────────────
    // One call regardless of performer count: send all reference portraits + the
    // candidate photo and ask Claude which performers (if any) appear.

    type MessageContent = Anthropic.Messages.MessageParam['content']
    const content: MessageContent = [
      {
        type: 'text',
        text: `You will see ${performers.length} reference portrait(s) of named performer(s), then one event photo. For EACH performer, determine whether they appear in the event photo.`,
      },
    ]

    for (const [i, p] of performers.entries()) {
      content.push({ type: 'text', text: `Performer ${i + 1}: ${p.name}${p.role ? ` (${p.role})` : ''}` })
      const refUrl = signedUrls.get(p.reference_storage_path as string) ?? ''
      content.push({ type: 'image', source: { type: 'url', url: refUrl } })
    }

    content.push({ type: 'text', text: 'Event photo to scan:' })
    content.push({ type: 'image', source: { type: 'url', url: mediaSignedUrl } })

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 512,
      tools: [
        {
          name: 'report_matches',
          description: 'Report which performers (if any) appear in the event photo.',
          input_schema: {
            type: 'object' as const,
            properties: {
              matches: {
                type: 'array',
                description: 'One entry per performer who appears in the event photo. Omit performers who are NOT present.',
                items: {
                  type: 'object',
                  properties: {
                    performer_index: {
                      type: 'number',
                      description: '0-based index of the performer (0 = Performer 1, 1 = Performer 2, …)',
                    },
                    confidence: {
                      type: 'number',
                      description: 'Confidence 0–1 that this performer appears in the event photo. Only report if > 0.5.',
                    },
                  },
                  required: ['performer_index', 'confidence'],
                },
              },
            },
            required: ['matches'],
          },
        },
      ],
      tool_choice: { type: 'tool', name: 'report_matches' },
      messages: [{ role: 'user', content }],
    })

    const toolBlock = response.content.find((b) => b.type === 'tool_use')
    const scanOutput = toolBlock && toolBlock.type === 'tool_use'
      ? (toolBlock.input as ScanOutput)
      : { matches: [] }

    // ── Persist matched performer_tags ────────────────────────────────────────

    let tagsCreated = 0
    const results: { performer_id: string; name: string; found: boolean; confidence: number }[] = []

    for (const [i, performer] of performers.entries()) {
      const match = scanOutput.matches.find((m) => m.performer_index === i)
      const found      = !!match && match.confidence >= CONFIDENCE_THRESHOLD
      const confidence = match?.confidence ?? 0

      results.push({ performer_id: performer.id, name: performer.name, found, confidence })

      if (found) {
        const { error: tagErr } = await supabase
          .from('performer_tags')
          .upsert(
            { media_file_id, performer_id: performer.id, confidence },
            { onConflict: 'media_file_id,performer_id' }
          )

        if (!tagErr) tagsCreated++
        else console.error('[face-scan] performer_tag upsert error:', tagErr)
      }
    }

    return NextResponse.json({ results, tags_created: tagsCreated })
  } catch (err) {
    console.error('[face-scan] error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
