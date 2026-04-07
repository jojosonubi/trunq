import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@supabase/supabase-js'
import { signStoragePath } from '@/lib/supabase/storage'

const COLOUR_PALETTE = [
  'red', 'orange', 'yellow', 'green', 'teal', 'blue',
  'purple', 'pink', 'white', 'black', 'grey', 'brown',
] as const

interface TagResult {
  scene_tags:       string[]
  mood_tags:        string[]
  subject_tags:     string[]
  quality_score:    number
  description:      string
  dominant_colours: string[]
}

export interface ScoringResult {
  quality_score:    number
  description:      string
  dominant_colours: string[]
  tags_written:     number
}

function getServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  )
}

/**
 * Runs Claude vision scoring on a single image file, writes tags + score to DB.
 * Throws on failure — callers are responsible for retry/error handling.
 */
export async function scoreMediaFile(mediaFileId: string): Promise<ScoringResult> {
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })
  const supabase  = getServiceClient()

  const { data: mediaFile, error: fetchErr } = await supabase
    .from('media_files')
    .select('storage_path')
    .eq('id', mediaFileId)
    .single()

  if (fetchErr || !mediaFile) {
    throw new Error(`Media file not found: ${mediaFileId}`)
  }

  const imageUrl = await signStoragePath(mediaFile.storage_path, 3600)

  const response = await anthropic.messages.create({
    model:      'claude-opus-4-6',
    max_tokens: 1024,
    tools: [
      {
        name:        'tag_image',
        description: 'Analyse an event photo and return structured tags and a quality assessment.',
        input_schema: {
          type: 'object' as const,
          properties: {
            scene_tags: {
              type: 'array', items: { type: 'string' },
              description: 'Scene descriptors (max 4). Examples: crowd, stage, outdoor, indoor, night, golden hour, backstage, dance floor.',
            },
            mood_tags: {
              type: 'array', items: { type: 'string' },
              description: 'Mood and atmosphere (max 3). Examples: energetic, intimate, euphoric, dark, vibrant, calm, chaotic, cinematic.',
            },
            subject_tags: {
              type: 'array', items: { type: 'string' },
              description: 'Main subjects (max 4). Examples: dancing, DJ, group shot, portrait, performance, audience, crowd surf, band.',
            },
            quality_score: {
              type: 'number',
              description: 'Overall image quality 0–100. Consider sharpness, exposure, composition, framing. 90+ = excellent; 75–89 = strong; 50–74 = average; below 50 = blurry/poorly framed.',
            },
            description: {
              type: 'string',
              description: 'One concise sentence (max 15 words) describing the key moment captured.',
            },
            dominant_colours: {
              type: 'array',
              items: { type: 'string', enum: [...COLOUR_PALETTE] },
              description: 'The 1–3 most visually dominant colours, chosen strictly from the allowed enum.',
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
          { type: 'image', source: { type: 'url', url: imageUrl } },
          { type: 'text',  text: 'Analyse this event photo. Be honest with quality scores — most photos score 50–80; only truly exceptional shots exceed 90.' },
        ],
      },
    ],
  })

  const toolBlock = response.content.find((b) => b.type === 'tool_use')
  if (!toolBlock || toolBlock.type !== 'tool_use') {
    throw new Error('No structured response from Claude')
  }

  const result         = toolBlock.input as TagResult
  const qualityScore   = Math.min(100, Math.max(0, Math.round(result.quality_score)))
  const dominantColours = (result.dominant_colours ?? [])
    .filter((c) => (COLOUR_PALETTE as readonly string[]).includes(c))
    .slice(0, 3)

  // ── Write tags ──────────────────────────────────────────────────────────────
  const tagRows = [
    ...result.scene_tags.slice(0, 4).map((v) => ({
      media_file_id: mediaFileId, tag_type: 'scene',   value: v.toLowerCase(), confidence: 0.9,
    })),
    ...result.mood_tags.slice(0, 3).map((v) => ({
      media_file_id: mediaFileId, tag_type: 'mood',    value: v.toLowerCase(), confidence: 0.85,
    })),
    ...result.subject_tags.slice(0, 4).map((v) => ({
      media_file_id: mediaFileId, tag_type: 'subject', value: v.toLowerCase(), confidence: 0.9,
    })),
  ]

  await supabase.from('tags').delete().eq('media_file_id', mediaFileId)

  let tagsWritten = 0
  if (tagRows.length > 0) {
    const { data, error: tagError } = await supabase.from('tags').insert(tagRows).select()
    if (tagError) throw new Error(`Tag insert failed: ${tagError.message}`)
    tagsWritten = data?.length ?? 0
  }

  // ── Write score + description to media_files ────────────────────────────────
  const { error: updateError } = await supabase
    .from('media_files')
    .update({ quality_score: qualityScore, description: result.description, dominant_colours: dominantColours })
    .eq('id', mediaFileId)

  if (updateError) throw new Error(`Score update failed: ${updateError.message}`)

  return { quality_score: qualityScore, description: result.description, dominant_colours: dominantColours, tags_written: tagsWritten }
}
