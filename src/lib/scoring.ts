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
  gesture_tags:     string[]
  fashion_tags: {
    hair:           string[]
    garment:        string[]
    cultural_dress: string[]
    accessory:      string[]
  }
  quality_score:    number
  description:      string
  dominant_colours: string[]
}

export interface ScoringResult {
  quality_score:    number
  description:      string
  dominant_colours: string[]
  tags_written:     number
  // gesture_tags and fashion_tags (hair/garment/cultural_dress/accessory) are
  // written as additional rows in the tags table with their respective tag_type values
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
export async function scoreMediaFile(mediaFileId: string, opts?: { skipTags?: boolean }): Promise<ScoringResult> {
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
    model:      'claude-sonnet-4-6',
    max_tokens: 1024,
    tools: [
      {
        name:        'tag_image',
        description: 'Analyse a Recess archive event photo and return structured tags and a quality assessment.',
        input_schema: {
          type: 'object' as const,
          properties: {
            scene_tags: {
              type: 'array', items: { type: 'string' },
              description: 'Scene descriptors (max 4). Pick from: indoor, outdoor, street, venue, garden, flash, low-light, golden-hour, daylight, dark, coloured-lighting, dance-floor, bar, stage, dj-booth, entrance, bathroom, green-room, crowd, day, night, late-night. ONLY use values from this list. If the photo doesn\'t fit, return fewer tags rather than inventing new values. Empty array is acceptable.',
            },
            mood_tags: {
              type: 'array', items: { type: 'string' },
              description: 'Mood and atmosphere (max 2). Pick from: high-energy, mellow, intimate, chaotic, joyful, playful, serious, sultry, tender, vulnerable, confident, silly, cinematic, film-grain, gritty, polished, lo-fi, editorial. ONLY use values from this list. If the photo doesn\'t fit, return fewer tags rather than inventing new values. Empty array is acceptable.',
            },
            subject_tags: {
              type: 'array', items: { type: 'string' },
              description: 'Main subjects and actions (max 4). Pick from: solo, duo, trio, group, crowd, selfie, posed-portrait, candid, wide-crowd-shot, close-up, back-of-head, over-shoulder, dancing, posing, talking, kissing, laughing, drinking, smoking, walking, sitting, performing, djing, crowd-surfing, phone-out. ONLY use values from this list. If the photo doesn\'t fit, return fewer tags rather than inventing new values. Empty array is acceptable.',
            },
            gesture_tags: {
              type: 'array', items: { type: 'string' },
              description: 'Distinctive hand gestures or poses visible in the photo (max 2). Pick from: gun-fingers, peace-sign, heart-hands, middle-finger, finger-point, thumbs-up, rock-on, prayer-hands, fist-pump, salute, blowing-kiss, hand-on-face, arms-up, hands-in-air. ONLY use values from this list. If the photo doesn\'t fit, return fewer tags rather than inventing new values. Empty array is acceptable.',
            },
            fashion_tags: {
              type: 'object',
              description: 'Fashion and styling details broken into four sub-categories. Only tag what is clearly visible.',
              properties: {
                hair: {
                  type: 'array', items: { type: 'string' },
                  description: 'Hair style or head covering (max 2). Pick from: buzz-cut, short, bob, medium, long, bald, braids, box-braids, cornrows, locs, twists, afro, curls, straight, wavy, bun, ponytail, updo, dyed, blonde, bleached, headwrap, bandana, hat, cap, durag, beanie. ONLY use values from this list. If the photo doesn\'t fit, return fewer tags rather than inventing new values. Empty array is acceptable.',
                },
                garment: {
                  type: 'array', items: { type: 'string' },
                  description: 'Clothing and fabric (max 3). Pick from: t-shirt, tank-top, crop-top, bodysuit, corset, button-up, jersey, hoodie, blazer, leather-jacket, denim-jacket, puffer, jeans, cargo-pants, trousers, mini-skirt, mini-dress, slip-dress, track-pants, leather, denim, mesh, lace, sequins, all-black, all-white, print, floral, y2k, vintage, streetwear. ONLY use values from this list. If the photo doesn\'t fit, return fewer tags rather than inventing new values. Empty array is acceptable.',
                },
                cultural_dress: {
                  type: 'array', items: { type: 'string' },
                  description: 'Cultural or traditional dress (max 2). Pick from: agbada, boubou, dashiki, kaftan, iro-buba, gele, sari, lehenga, kurta, kimono, hanbok, cheongsam, qipao, abaya, hijab, keffiyeh, kente-cloth, ankara-print, traditional-dress. ONLY use values from this list. If the photo doesn\'t fit, return fewer tags rather than inventing new values. Empty array is acceptable.',
                },
                accessory: {
                  type: 'array', items: { type: 'string' },
                  description: 'Accessories (max 3). Pick from: sunglasses, oversized-sunglasses, tinted-glasses, hoops, chains, chunky-jewellery, nameplate, nose-ring, septum-ring, body-chain, mini-bag, tote, crossbody, trainers, boots, heels, gloves, scarf, belt, tights, fishnets. ONLY use values from this list. If the photo doesn\'t fit, return fewer tags rather than inventing new values. Empty array is acceptable.',
                },
              },
              required: ['hair', 'garment', 'cultural_dress', 'accessory'],
            },
            quality_score: {
              type: 'number',
              description: `Score 1–10 for nightlife/event photography. HIGH (7–10): clear subject/moment, energy and action (dancing/posing/movement), social cohesion (group sharing a moment, eye contact), expressive faces, good framing, intentional motion blur with energy. LOW (1–4): no focal point, disconnected subjects not interacting, poor framing (important content cut off, purposeless empty space), technically poor AND lacking energy/story. NUANCES: do NOT penalise motion blur if the image has energy and story; do NOT penalise low light if faces/subjects are readable; do NOT apply standard photography rules (sharpness, rule of thirds) as primary criteria — a technically imperfect image with clear energy beats a technically perfect but lifeless one.`,
            },
            description: {
              type: 'string',
              description: 'One concise sentence (max 20 words) describing what is visually present. Lead with the subject(s), then their action/pose, then notable styling or environmental details. Use concrete observations (e.g., \'two women lean into a close-up, one with pink sunglasses propped on her head, the other in red oval glasses\'). AVOID vibe-prose (\'serves energy\', \'captures the moment\', \'embodies the vibe\'). AVOID generic descriptors (\'expressive\', \'vibrant\', \'lively\'). Describe what you literally see.',
            },
            dominant_colours: {
              type: 'array',
              items: { type: 'string', enum: [...COLOUR_PALETTE] },
              description: 'The 1–3 most visually dominant colours, chosen strictly from the allowed enum.',
            },
          },
          required: ['scene_tags', 'mood_tags', 'subject_tags', 'gesture_tags', 'fashion_tags', 'quality_score', 'description', 'dominant_colours'],
        },
      },
    ],
    tool_choice: { type: 'tool', name: 'tag_image' },
    messages: [
      {
        role: 'user',
        content: [
          { type: 'image', source: { type: 'url', url: imageUrl } },
          { type: 'text',  text: 'Analyse this nightlife/event photo. Score on energy, story, and moment — not technical perfection. Most photos score 4–7; reserve 8–10 for shots with genuine energy and a clear moment, and 1–3 for shots with no focal point or story. For tags, use ONLY values from the allowed lists. For description, describe what is concretely visible — avoid generic vibe-prose. Empty arrays are preferable to invented tags.' },
        ],
      },
    ],
  })

  const toolBlock = response.content.find((b) => b.type === 'tool_use')
  if (!toolBlock || toolBlock.type !== 'tool_use') {
    throw new Error('No structured response from Claude')
  }

  const result         = toolBlock.input as TagResult
  // Claude returns 1–10; scale to 0–100 for DB storage
  const qualityScore   = Math.min(100, Math.max(0, Math.round(Math.min(10, Math.max(1, result.quality_score)) * 10)))
  const dominantColours = (result.dominant_colours ?? [])
    .filter((c) => (COLOUR_PALETTE as readonly string[]).includes(c))
    .slice(0, 3)

  // ── Write tags (skip when opts.skipTags is true) ────────────────────────────
  let tagsWritten = 0
  if (!opts?.skipTags) {
    const tagRows = [
      ...result.scene_tags.slice(0, 4).map((v) => ({
        media_file_id: mediaFileId, tag_type: 'scene',   value: v.toLowerCase(), confidence: 0.9,
      })),
      ...result.mood_tags.slice(0, 2).map((v) => ({
        media_file_id: mediaFileId, tag_type: 'mood',    value: v.toLowerCase(), confidence: 0.85,
      })),
      ...result.subject_tags.slice(0, 4).map((v) => ({
        media_file_id: mediaFileId, tag_type: 'subject', value: v.toLowerCase(), confidence: 0.9,
      })),
      ...(result.gesture_tags ?? []).slice(0, 2).map((v) => ({
        media_file_id: mediaFileId, tag_type: 'gesture', value: v.toLowerCase(), confidence: 0.85,
      })),
      ...(result.fashion_tags?.hair ?? []).slice(0, 2).map((v) => ({
        media_file_id: mediaFileId, tag_type: 'hair',    value: v.toLowerCase(), confidence: 0.85,
      })),
      ...(result.fashion_tags?.garment ?? []).slice(0, 3).map((v) => ({
        media_file_id: mediaFileId, tag_type: 'garment', value: v.toLowerCase(), confidence: 0.85,
      })),
      ...(result.fashion_tags?.cultural_dress ?? []).slice(0, 2).map((v) => ({
        media_file_id: mediaFileId, tag_type: 'cultural_dress', value: v.toLowerCase(), confidence: 0.85,
      })),
      ...(result.fashion_tags?.accessory ?? []).slice(0, 3).map((v) => ({
        media_file_id: mediaFileId, tag_type: 'accessory', value: v.toLowerCase(), confidence: 0.85,
      })),
    ]
    await supabase.from('tags').delete().eq('media_file_id', mediaFileId)
    if (tagRows.length > 0) {
      const { data, error: tagError } = await supabase.from('tags').insert(tagRows).select()
      if (tagError) throw new Error(`Tag insert failed: ${tagError.message}`)
      tagsWritten = data?.length ?? 0
    }
  }

  // ── Write score + description to media_files ────────────────────────────────
  const { error: updateError } = await supabase
    .from('media_files')
    .update({ quality_score: qualityScore, description: result.description, dominant_colours: dominantColours })
    .eq('id', mediaFileId)

  if (updateError) throw new Error(`Score update failed: ${updateError.message}`)

  return { quality_score: qualityScore, description: result.description, dominant_colours: dominantColours, tags_written: tagsWritten }
}
