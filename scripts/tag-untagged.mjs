/**
 * tag-untagged.mjs — one-off bulk tagging submitter (THROTTLED, self-ingesting)
 *
 * Tags untagged/failed images via the Anthropic Message Batches API (Sonnet 4.6,
 * 50% off). Mirrors /api/tag/batch-submit + /api/tag/batch-status, but runs them
 * inline so we can throttle and report per batch.
 *
 * WHY THROTTLED: images are sent as signed URLs, so each request triggers an
 * Anthropic "URL Content Fetching" call — a separate org limit of 2,000/min.
 * Submitting many batches at once blows past it (a 2026-06-16 run lost ~81% to
 * rate_limit_error). Fix: keep only ONE batch in flight at a time, sized under
 * the limit, and wait for it to finish (no more URL fetches) before the next.
 *
 * Per batch of <=BATCH_SIZE images:
 *   1. sign display_path (or storage_path) — plain 48h signed URL, bucket "media"
 *   2. submit one Anthropic batch
 *   3. poll until processing_status === "ended"
 *   4. ingest results inline: write tags, flip media_files complete/failed
 *   5. record a tag_batches audit row (status=complete) — never left "submitted",
 *      so the batch-status cron never double-processes these
 *
 * Scoring is never touched (no score_status / quality_score writes).
 * Idempotent + re-runnable: only ever picks up tagging_status IN (untagged, failed);
 * ingestion deletes stale tags per media_file_id before inserting.
 *
 * SAFETY: dry run by default. Submits/writes ONLY with `--go`.
 *   node scripts/tag-untagged.mjs           # dry run — plan only, spends nothing
 *   node scripts/tag-untagged.mjs --go      # live: submit + ingest (billable)
 */

import dotenv from 'dotenv'
import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@supabase/supabase-js'

dotenv.config({ path: '.env.local' })

const GO           = process.argv.includes('--go')
const MEDIA_BUCKET = 'media'
const BATCH_SIZE   = 1500              // <2000/min URL-fetch limit, one batch in flight
const SIGN_CHUNK   = 1000              // Supabase createSignedUrls cap
const DB_CHUNK     = 500              // Supabase write chunk
const SIGN_TTL     = 48 * 60 * 60      // 48h — margin over Anthropic's 24h batch limit
const POLL_MS      = 20_000            // how often to check if a batch has ended
const POLL_MAX     = 360               // give up after ~2h per batch (360 * 20s)

const SUPABASE_URL  = process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_KEY   = process.env.SUPABASE_SERVICE_ROLE_KEY
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY
if (!SUPABASE_URL || !SERVICE_KEY) { console.error('Missing Supabase env'); process.exit(1) }
if (GO && !ANTHROPIC_KEY)          { console.error('Missing ANTHROPIC_API_KEY'); process.exit(1) }

const supabase  = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } })
const anthropic = ANTHROPIC_KEY ? new Anthropic({ apiKey: ANTHROPIC_KEY }) : null
const sleep = (ms) => new Promise(r => setTimeout(r, ms))
const ts    = () => new Date().toISOString().slice(11, 19)

// ── tag_image tool schema — copied verbatim from /api/tag/batch-submit ────────
const TAG_IMAGE_TOOL = {
  name: 'tag_image',
  description: 'Analyse a Recess archive event photo and return structured tags.',
  cache_control: { type: 'ephemeral' },
  input_schema: {
    type: 'object',
    properties: {
      scene_tags: { type: 'array', items: { type: 'string' },
        description: 'Scene descriptors (max 4). Pick from: indoor, outdoor, street, venue, garden, flash, low-light, golden-hour, daylight, dark, coloured-lighting, dance-floor, bar, stage, dj-booth, entrance, bathroom, green-room, crowd, day, night, late-night. ONLY use values from this list. Empty array is acceptable.' },
      mood_tags: { type: 'array', items: { type: 'string' },
        description: 'Mood and atmosphere (max 2). Pick from: high-energy, mellow, intimate, chaotic, joyful, playful, serious, sultry, tender, vulnerable, confident, silly, cinematic, film-grain, gritty, polished, lo-fi, editorial. ONLY use values from this list. Empty array is acceptable.' },
      subject_tags: { type: 'array', items: { type: 'string' },
        description: 'Main subjects and actions (max 4). Pick from: solo, duo, trio, group, crowd, selfie, posed-portrait, candid, wide-crowd-shot, close-up, back-of-head, over-shoulder, dancing, posing, talking, kissing, laughing, drinking, smoking, walking, sitting, performing, djing, crowd-surfing, phone-out. ONLY use values from this list. Empty array is acceptable.' },
      gesture_tags: { type: 'array', items: { type: 'string' },
        description: 'Distinctive hand gestures or poses visible in the photo (max 2). Pick from: gun-fingers, peace-sign, heart-hands, middle-finger, finger-point, thumbs-up, rock-on, prayer-hands, fist-pump, salute, blowing-kiss, hand-on-face, arms-up, hands-in-air. ONLY use values from this list. Empty array is acceptable.' },
      fashion_tags: {
        type: 'object',
        description: 'Fashion and styling details broken into four sub-categories. Only tag what is clearly visible.',
        properties: {
          hair: { type: 'array', items: { type: 'string' },
            description: 'Hair style or head covering (max 2). Pick from: buzz-cut, short, bob, medium, long, bald, braids, box-braids, cornrows, locs, twists, afro, curls, straight, wavy, bun, ponytail, updo, dyed, blonde, bleached, headwrap, bandana, hat, cap, durag, beanie. ONLY use values from this list. Empty array is acceptable.' },
          garment: { type: 'array', items: { type: 'string' },
            description: 'Clothing and fabric (max 3). Pick from: t-shirt, tank-top, crop-top, bodysuit, corset, button-up, jersey, hoodie, blazer, leather-jacket, denim-jacket, puffer, jeans, cargo-pants, trousers, mini-skirt, mini-dress, slip-dress, track-pants, leather, denim, mesh, lace, sequins, all-black, all-white, print, floral, y2k, vintage, streetwear. ONLY use values from this list. Empty array is acceptable.' },
          cultural_dress: { type: 'array', items: { type: 'string' },
            description: 'Cultural or traditional dress (max 2). Pick from: agbada, boubou, dashiki, kaftan, iro-buba, gele, sari, lehenga, kurta, kimono, hanbok, cheongsam, qipao, abaya, hijab, keffiyeh, kente-cloth, ankara-print, traditional-dress. ONLY use values from this list. Empty array is acceptable.' },
          accessory: { type: 'array', items: { type: 'string' },
            description: 'Accessories (max 3). Pick from: sunglasses, oversized-sunglasses, tinted-glasses, hoops, chains, chunky-jewellery, nameplate, nose-ring, septum-ring, body-chain, mini-bag, tote, crossbody, trainers, boots, heels, gloves, scarf, belt, tights, fishnets. ONLY use values from this list. Empty array is acceptable.' },
        },
        required: ['hair', 'garment', 'cultural_dress', 'accessory'],
      },
    },
    required: ['scene_tags', 'mood_tags', 'subject_tags', 'gesture_tags', 'fashion_tags'],
  },
}

// ── Fetch ALL untagged/failed image rows (paginate past the 1000-row cap) ────
async function fetchPending() {
  const rows = []
  const PAGE = 1000
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from('media_files')
      .select('id, storage_path, display_path, organisation_id')
      .in('tagging_status', ['untagged', 'failed'])
      .eq('file_type', 'image')
      .is('deleted_at', null)
      .order('created_at', { ascending: true })
      .range(from, from + PAGE - 1)
    if (error) throw new Error(`fetch failed: ${error.message}`)
    rows.push(...(data ?? []))
    if (!data || data.length < PAGE) break
  }
  return rows
}

async function signPaths(paths) {
  const map = new Map()
  for (let i = 0; i < paths.length; i += SIGN_CHUNK) {
    const chunk = paths.slice(i, i + SIGN_CHUNK)
    const { data, error } = await supabase.storage.from(MEDIA_BUCKET).createSignedUrls(chunk, SIGN_TTL)
    if (error) { console.error('  sign chunk failed:', error.message); continue }
    for (const item of (data ?? [])) if (item.signedUrl && item.path) map.set(item.path, item.signedUrl)
  }
  return map
}

// Poll an Anthropic batch until it has finished processing.
async function waitForEnd(batchId) {
  for (let i = 0; i < POLL_MAX; i++) {
    const b = await anthropic.messages.batches.retrieve(batchId)
    if (b.processing_status === 'ended') return b
    if (i % 3 === 0) {
      const c = b.request_counts
      console.log(`    [${ts()}] ${b.processing_status} — processing:${c.processing} succeeded:${c.succeeded} errored:${c.errored}`)
    }
    await sleep(POLL_MS)
  }
  throw new Error(`batch ${batchId} did not end within ~${(POLL_MAX * POLL_MS) / 60000}m`)
}

// Ingest a finished batch — mirrors /api/tag/batch-status processCompletedBatch.
async function ingest(batchId, orgId) {
  const tagRows = [], successIds = [], failedIds = []
  const mk = (mediaFileId) => (tag_type, value, confidence) =>
    ({ media_file_id: mediaFileId, organisation_id: orgId, tag_type, value: String(value).toLowerCase(), confidence })

  for await (const item of await anthropic.messages.batches.results(batchId)) {
    const id = item.custom_id
    if (item.result.type !== 'succeeded') { failedIds.push(id); continue }
    const toolBlock = item.result.message.content.find(b => b.type === 'tool_use')
    if (!toolBlock) { failedIds.push(id); continue }
    const r = toolBlock.input ?? {}
    const tag = mk(id)
    tagRows.push(
      ...(r.scene_tags ?? []).slice(0, 4).map(v => tag('scene', v, 0.9)),
      ...(r.mood_tags ?? []).slice(0, 2).map(v => tag('mood', v, 0.85)),
      ...(r.subject_tags ?? []).slice(0, 4).map(v => tag('subject', v, 0.9)),
      ...(r.gesture_tags ?? []).slice(0, 2).map(v => tag('gesture', v, 0.85)),
      ...(r.fashion_tags?.hair ?? []).slice(0, 2).map(v => tag('hair', v, 0.85)),
      ...(r.fashion_tags?.garment ?? []).slice(0, 3).map(v => tag('garment', v, 0.85)),
      ...(r.fashion_tags?.cultural_dress ?? []).slice(0, 2).map(v => tag('cultural_dress', v, 0.85)),
      ...(r.fashion_tags?.accessory ?? []).slice(0, 3).map(v => tag('accessory', v, 0.85)),
    )
    successIds.push(id)
  }

  // Replace tags for the succeeded ids, then flip statuses.
  for (let i = 0; i < successIds.length; i += DB_CHUNK)
    await supabase.from('tags').delete().in('media_file_id', successIds.slice(i, i + DB_CHUNK))
  for (let i = 0; i < tagRows.length; i += DB_CHUNK) {
    const { error } = await supabase.from('tags').insert(tagRows.slice(i, i + DB_CHUNK))
    if (error) console.error('    tags insert error:', error.message)
  }
  for (let i = 0; i < successIds.length; i += DB_CHUNK)
    await supabase.from('media_files').update({ tagging_status: 'complete' }).in('id', successIds.slice(i, i + DB_CHUNK))
  for (let i = 0; i < failedIds.length; i += DB_CHUNK)
    await supabase.from('media_files').update({ tagging_status: 'failed' }).in('id', failedIds.slice(i, i + DB_CHUNK))

  return { succeeded: successIds.length, failed: failedIds.length, tags: tagRows.length }
}

async function processBatch(chunk, orgId, idx, total) {
  const displayPaths = chunk.map(r => r.display_path ?? r.storage_path)
  const urlMap = await signPaths(displayPaths)
  const requests = chunk.map(row => {
    const signedUrl = urlMap.get(row.display_path ?? row.storage_path) ?? ''
    return {
      custom_id: row.id,
      params: {
        model: 'claude-sonnet-4-6',
        max_tokens: 512,
        tools: [TAG_IMAGE_TOOL],
        tool_choice: { type: 'tool', name: 'tag_image' },
        messages: [{ role: 'user', content: [
          { type: 'image', source: { type: 'url', url: signedUrl } },
          { type: 'text', text: 'Analyse this nightlife/event photo. Use ONLY values from the allowed lists. Empty arrays are preferable to invented tags.' },
        ] }],
      },
    }
  })
  const missing = requests.filter(r => !r.params.messages[0].content[0].source.url).length
  if (missing) console.warn(`  batch ${idx}/${total}: ${missing}/${chunk.length} rows had no signable URL`)

  const batch = await anthropic.messages.batches.create({ requests })
  console.log(`  batch ${idx}/${total}: [${ts()}] submitted ${batch.id} (${chunk.length} requests) — waiting…`)

  await waitForEnd(batch.id)
  const { succeeded, failed, tags } = await ingest(batch.id, orgId)

  // Audit row recorded as complete → cron never re-processes it.
  await supabase.from('tag_batches').insert({
    anthropic_batch_id: batch.id, organisation_id: orgId, event_id: null,
    status: 'complete', total_count: chunk.length,
    succeeded_count: succeeded, failed_count: failed, completed_at: new Date().toISOString(),
  })
  console.log(`  batch ${idx}/${total}: [${ts()}] ingested — ok=${succeeded} failed=${failed} tags_written=${tags}`)
  return { succeeded, failed }
}

async function main() {
  console.log(GO ? '*** LIVE RUN (--go): submit + ingest, billable ***'
                 : '--- DRY RUN: no submissions, no DB writes. Re-run with --go to execute. ---')

  const rows = await fetchPending()
  console.log(`\nUntagged/failed images: ${rows.length}`)
  if (rows.length === 0) { console.log('Nothing to do.'); return }

  const orgs = [...new Set(rows.map(r => r.organisation_id))]
  if (orgs.length !== 1) { console.error(`Expected 1 org, found ${orgs.length}: ${orgs}. Aborting.`); process.exit(1) }
  const orgId = orgs[0]
  const nBatches = Math.ceil(rows.length / BATCH_SIZE)
  const withDisplay = rows.filter(r => r.display_path).length
  console.log(`Org: ${orgId}`)
  console.log(`Have a display derivative: ${withDisplay}/${rows.length} (rest fall back to the original)`)
  console.log(`Plan: ${nBatches} sequential batch(es) of up to ${BATCH_SIZE}, one in flight at a time.`)

  if (!GO) {
    const probe = rows[0].display_path ?? rows[0].storage_path
    const m = await signPaths([probe])
    console.log(`\nSign probe "${probe}": ${m.get(probe) ? 'OK' : 'FAILED'}`)
    console.log('Dry run complete. Nothing submitted, nothing changed.')
    return
  }

  let okTotal = 0, failTotal = 0
  for (let i = 0, idx = 1; i < rows.length; i += BATCH_SIZE, idx++) {
    const { succeeded, failed } = await processBatch(rows.slice(i, i + BATCH_SIZE), orgId, idx, nBatches)
    okTotal += succeeded; failTotal += failed
  }
  console.log(`\nDONE. tagged ok=${okTotal} failed=${failTotal} across ${nBatches} batch(es).`)
  if (failTotal) console.log(`Re-run \`node scripts/tag-untagged.mjs --go\` to retry the ${failTotal} that still failed.`)
}

main().catch(err => { console.error('FATAL:', err); process.exit(1) })
