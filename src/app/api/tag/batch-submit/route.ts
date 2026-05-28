/**
 * POST /api/tag/batch-submit?event_id=<uuid>
 *
 * Submits untagged images to the Anthropic Message Batches API (50% cost
 * discount, async). Tags only — does not touch score_status or quality_score.
 * Uses display_path (≤20 MB derivative) as image input when available.
 *
 * Auth: owner role only.
 * Idempotent: only picks up tagging_status IN ('untagged', 'failed').
 * Capped at 2 000 rows per call; re-run for remainder.
 */

import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { requireApiUserWithOrg } from '@/lib/api-auth'
import { createServiceClient } from '@/lib/supabase/service'
import { signStoragePaths } from '@/lib/supabase/storage'

const MAX_ROWS = 2000
const SIGN_TTL = 48 * 60 * 60  // 48 h — safe margin over Anthropic's 24 h limit

// Tags-only tool schema — quality_score, description, dominant_colours
// are intentionally omitted; scoring remains a separate concern.
// cache_control marks the whole tool block for prompt caching across all
// requests in the batch, cutting input-token costs by up to 90 %.
const TAG_IMAGE_TOOL: Anthropic.Messages.Tool = {
  name: 'tag_image',
  description: 'Analyse a Recess archive event photo and return structured tags.',
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  cache_control: { type: 'ephemeral' } as any,
  input_schema: {
    type: 'object',
    properties: {
      scene_tags: {
        type: 'array', items: { type: 'string' },
        description: 'Scene descriptors (max 4). Pick from: indoor, outdoor, street, venue, garden, flash, low-light, golden-hour, daylight, dark, coloured-lighting, dance-floor, bar, stage, dj-booth, entrance, bathroom, green-room, crowd, day, night, late-night. ONLY use values from this list. Empty array is acceptable.',
      },
      mood_tags: {
        type: 'array', items: { type: 'string' },
        description: 'Mood and atmosphere (max 2). Pick from: high-energy, mellow, intimate, chaotic, joyful, playful, serious, sultry, tender, vulnerable, confident, silly, cinematic, film-grain, gritty, polished, lo-fi, editorial. ONLY use values from this list. Empty array is acceptable.',
      },
      subject_tags: {
        type: 'array', items: { type: 'string' },
        description: 'Main subjects and actions (max 4). Pick from: solo, duo, trio, group, crowd, selfie, posed-portrait, candid, wide-crowd-shot, close-up, back-of-head, over-shoulder, dancing, posing, talking, kissing, laughing, drinking, smoking, walking, sitting, performing, djing, crowd-surfing, phone-out. ONLY use values from this list. Empty array is acceptable.',
      },
      gesture_tags: {
        type: 'array', items: { type: 'string' },
        description: 'Distinctive hand gestures or poses visible in the photo (max 2). Pick from: gun-fingers, peace-sign, heart-hands, middle-finger, finger-point, thumbs-up, rock-on, prayer-hands, fist-pump, salute, blowing-kiss, hand-on-face, arms-up, hands-in-air. ONLY use values from this list. Empty array is acceptable.',
      },
      fashion_tags: {
        type: 'object',
        description: 'Fashion and styling details broken into four sub-categories. Only tag what is clearly visible.',
        properties: {
          hair: {
            type: 'array', items: { type: 'string' },
            description: 'Hair style or head covering (max 2). Pick from: buzz-cut, short, bob, medium, long, bald, braids, box-braids, cornrows, locs, twists, afro, curls, straight, wavy, bun, ponytail, updo, dyed, blonde, bleached, headwrap, bandana, hat, cap, durag, beanie. ONLY use values from this list. Empty array is acceptable.',
          },
          garment: {
            type: 'array', items: { type: 'string' },
            description: 'Clothing and fabric (max 3). Pick from: t-shirt, tank-top, crop-top, bodysuit, corset, button-up, jersey, hoodie, blazer, leather-jacket, denim-jacket, puffer, jeans, cargo-pants, trousers, mini-skirt, mini-dress, slip-dress, track-pants, leather, denim, mesh, lace, sequins, all-black, all-white, print, floral, y2k, vintage, streetwear. ONLY use values from this list. Empty array is acceptable.',
          },
          cultural_dress: {
            type: 'array', items: { type: 'string' },
            description: 'Cultural or traditional dress (max 2). Pick from: agbada, boubou, dashiki, kaftan, iro-buba, gele, sari, lehenga, kurta, kimono, hanbok, cheongsam, qipao, abaya, hijab, keffiyeh, kente-cloth, ankara-print, traditional-dress. ONLY use values from this list. Empty array is acceptable.',
          },
          accessory: {
            type: 'array', items: { type: 'string' },
            description: 'Accessories (max 3). Pick from: sunglasses, oversized-sunglasses, tinted-glasses, hoops, chains, chunky-jewellery, nameplate, nose-ring, septum-ring, body-chain, mini-bag, tote, crossbody, trainers, boots, heels, gloves, scarf, belt, tights, fishnets. ONLY use values from this list. Empty array is acceptable.',
          },
        },
        required: ['hair', 'garment', 'cultural_dress', 'accessory'],
      },
    },
    required: ['scene_tags', 'mood_tags', 'subject_tags', 'gesture_tags', 'fashion_tags'],
  },
}

export async function POST(req: NextRequest) {
  // ── Auth: owner role only ────────────────────────────────────────────────
  const auth = await requireApiUserWithOrg()
  if (auth.response) return auth.response
  if (auth.organisationRole !== 'owner') {
    return NextResponse.json({ error: 'Owner role required' }, { status: 403 })
  }

  const eventId = req.nextUrl.searchParams.get('event_id') ?? null
  const supabase = createServiceClient()

  // ── Fetch rows that need tagging ─────────────────────────────────────────
  let q = supabase
    .from('media_files')
    .select('id, storage_path, display_path')
    .in('tagging_status', ['untagged', 'failed'])
    .eq('file_type', 'image')
    .is('deleted_at', null)
    .eq('organisation_id', auth.organisationId)
    .order('created_at', { ascending: true })
    .limit(MAX_ROWS)

  if (eventId) q = q.eq('event_id', eventId)

  const { data: rows, error: fetchErr } = await q
  if (fetchErr) {
    console.error('[tag/batch-submit] fetch error:', fetchErr.message)
    return NextResponse.json({ error: 'Failed to fetch rows' }, { status: 500 })
  }

  const pending = rows ?? []
  console.log(`[tag/batch-submit] ${pending.length} rows to submit${eventId ? ` (event ${eventId})` : ''}`)

  if (pending.length === 0) {
    return NextResponse.json({ submitted: 0, batch_id: null })
  }

  // ── Sign display paths in batch (48h TTL, plain signed URL — no transform) ─
  const displayPaths = pending.map(r => r.display_path ?? r.storage_path)
  const urlMap = await signStoragePaths(displayPaths, SIGN_TTL)

  // ── Build Anthropic batch requests ───────────────────────────────────────
  const requests: Anthropic.Messages.BatchCreateParams.Request[] = pending.map(row => {
    const signedUrl = urlMap.get(row.display_path ?? row.storage_path) ?? ''
    return {
      custom_id: row.id,
      params: {
        model: 'claude-sonnet-4-6' as const,
        max_tokens: 512,
        tools: [TAG_IMAGE_TOOL],
        tool_choice: { type: 'tool' as const, name: 'tag_image' },
        messages: [
          {
            role: 'user' as const,
            content: [
              { type: 'image' as const, source: { type: 'url' as const, url: signedUrl } },
              {
                type: 'text' as const,
                text: 'Analyse this nightlife/event photo. Use ONLY values from the allowed lists. Empty arrays are preferable to invented tags.',
              },
            ],
          },
        ],
      },
    }
  })

  // ── Submit to Anthropic Batch API ────────────────────────────────────────
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })
  let batch: Anthropic.Messages.MessageBatch
  try {
    batch = await anthropic.messages.batches.create({ requests })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[tag/batch-submit] Anthropic API error:', msg)
    return NextResponse.json({ error: `Anthropic API error: ${msg}` }, { status: 502 })
  }

  console.log(`[tag/batch-submit] submitted batch ${batch.id} (${pending.length} requests)`)

  // ── Record batch ─────────────────────────────────────────────────────────
  const { error: insertErr } = await supabase.from('tag_batches').insert({
    anthropic_batch_id: batch.id,
    organisation_id:    auth.organisationId,
    event_id:           eventId,
    total_count:        pending.length,
  })
  if (insertErr) {
    // Batch was submitted — don't fail the request, just log
    console.error('[tag/batch-submit] DB insert error:', insertErr.message)
  }

  // ── Mark rows processing (tagging_status only — never touch score_status) ─
  const ids = pending.map(r => r.id)
  for (let i = 0; i < ids.length; i += 500) {
    await supabase
      .from('media_files')
      .update({ tagging_status: 'processing' })
      .in('id', ids.slice(i, i + 500))
  }

  return NextResponse.json({ batch_id: batch.id, submitted: pending.length })
}
