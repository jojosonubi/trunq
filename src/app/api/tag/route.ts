import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@supabase/supabase-js'
import { signStoragePath } from '@/lib/supabase/storage'
import { requireApiUser } from '@/lib/api-auth'

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY!,
})

function getServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  )
}

// Canonical palette — the same names are used in the gallery colour swatches
const COLOUR_PALETTE = ['red', 'orange', 'yellow', 'green', 'teal', 'blue', 'purple', 'pink', 'white', 'black', 'grey', 'brown'] as const

interface TagResult {
  scene_tags: string[]
  mood_tags: string[]
  subject_tags: string[]
  quality_score: number
  description: string
  dominant_colours: string[]
}

export async function POST(request: NextRequest) {
  const auth = await requireApiUser()
  if (auth.response) return auth.response

  try {
    const body = await request.json()
    const { media_file_id } = body as { media_file_id: string }

    if (!media_file_id) {
      return NextResponse.json(
        { error: 'Missing media_file_id' },
        { status: 400 }
      )
    }

    // Fetch the storage_path and generate a signed URL so Claude can access
    // the file even when the storage bucket is private.
    const supabase = getServiceClient()
    const { data: mediaFile, error: fetchErr } = await supabase
      .from('media_files')
      .select('storage_path')
      .eq('id', media_file_id)
      .single()

    if (fetchErr || !mediaFile) {
      return NextResponse.json({ error: 'Media file not found' }, { status: 404 })
    }

    const imageUrl = await signStoragePath(mediaFile.storage_path, 3600)

    const response = await anthropic.messages.create({
      model: 'claude-opus-4-6',
      max_tokens: 1024,
      tools: [
        {
          name: 'tag_image',
          description:
            'Analyse an event photo and return structured tags and a quality assessment.',
          input_schema: {
            type: 'object' as const,
            properties: {
              scene_tags: {
                type: 'array',
                items: { type: 'string' },
                description:
                  'Scene descriptors (max 4). Examples: crowd, stage, outdoor, indoor, night, golden hour, backstage, dance floor, bar area, lighting rig.',
              },
              mood_tags: {
                type: 'array',
                items: { type: 'string' },
                description:
                  'Mood and atmosphere (max 3). Examples: energetic, intimate, euphoric, dark, vibrant, calm, chaotic, cinematic.',
              },
              subject_tags: {
                type: 'array',
                items: { type: 'string' },
                description:
                  'Main subjects (max 4). Examples: dancing, DJ, group shot, portrait, performance, audience, crowd surf, band, equipment.',
              },
              quality_score: {
                type: 'number',
                description:
                  'Overall image quality 0–100. Consider sharpness, exposure, composition, framing, and visual interest. 90+ = excellent hero shot; 75–89 = strong usable image; 50–74 = average; below 50 = blurry, overexposed or poorly framed.',
              },
              description: {
                type: 'string',
                description:
                  'One concise sentence (max 15 words) describing the key moment captured.',
              },
              dominant_colours: {
                type: 'array',
                items: { type: 'string', enum: ['red', 'orange', 'yellow', 'green', 'teal', 'blue', 'purple', 'pink', 'white', 'black', 'grey', 'brown'] },
                description:
                  'The 1–3 most visually dominant colours in the photo, chosen strictly from the allowed enum values. Judge by area and visual weight, not by small accents.',
              },
            },
            required: ['scene_tags', 'mood_tags', 'subject_tags', 'quality_score', 'description', 'dominant_colours'],
          },
        },
      ],
      tool_choice: { type: 'tool', name: 'tag_image' },
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image',
              source: { type: 'url', url: imageUrl },
            },
            {
              type: 'text',
              text: 'Analyse this event photo. Be honest with quality scores — most photos score 50–80; only truly exceptional shots exceed 90.',
            },
          ],
        },
      ],
    })

    const toolBlock = response.content.find((b) => b.type === 'tool_use')
    if (!toolBlock || toolBlock.type !== 'tool_use') {
      return NextResponse.json({ error: 'No structured response from Claude' }, { status: 500 })
    }

    const result = toolBlock.input as TagResult

    // Log exactly what Claude returned so we can verify the arrays
    console.log('[tag] Claude result:', JSON.stringify(result))

    const tagRows = [
      ...result.scene_tags.slice(0, 4).map((v) => ({
        media_file_id,
        tag_type: 'scene',
        value: v.toLowerCase(),
        confidence: 0.9,
      })),
      ...result.mood_tags.slice(0, 3).map((v) => ({
        media_file_id,
        tag_type: 'mood',
        value: v.toLowerCase(),
        confidence: 0.85,
      })),
      ...result.subject_tags.slice(0, 4).map((v) => ({
        media_file_id,
        tag_type: 'subject',
        value: v.toLowerCase(),
        confidence: 0.9,
      })),
    ]

    console.log(`[tag] built ${tagRows.length} tag rows for media_file_id=${media_file_id}`)

    // Delete existing tags first so re-tagging never accumulates duplicates
    const { error: deleteError } = await supabase
      .from('tags')
      .delete()
      .eq('media_file_id', media_file_id)
    if (deleteError) console.error('[tag] delete error:', deleteError)

    let insertedTags: unknown[] = []
    if (tagRows.length > 0) {
      const { data, error: tagError } = await supabase
        .from('tags')
        .insert(tagRows)
        .select()

      if (tagError) {
        // Surface the full error so it shows up in the API response for debugging
        console.error('[tag] insert error:', JSON.stringify(tagError))
        return NextResponse.json(
          { error: `Tag insert failed: ${tagError.message}`, detail: tagError },
          { status: 500 }
        )
      }

      insertedTags = data ?? []
      console.log(`[tag] inserted ${insertedTags.length} tags`)
    }

    const qualityScore = Math.min(100, Math.max(0, Math.round(result.quality_score)))
    const dominantColours = (result.dominant_colours ?? [])
      .filter((c) => (COLOUR_PALETTE as readonly string[]).includes(c))
      .slice(0, 3)

    const { error: updateError } = await supabase
      .from('media_files')
      .update({ quality_score: qualityScore, description: result.description, dominant_colours: dominantColours })
      .eq('id', media_file_id)

    if (updateError) console.error('[tag] media_files update error:', JSON.stringify(updateError))

    console.log(`[tag] done — media_file_id=${media_file_id} score=${qualityScore} tags=${insertedTags.length}`)

    return NextResponse.json({
      tags: insertedTags,
      quality_score: qualityScore,
      description: result.description,
      dominant_colours: dominantColours,
    })
  } catch (err) {
    console.error('Tagging error:', err)
    return NextResponse.json({ error: 'Tagging failed' }, { status: 500 })
  }
}
