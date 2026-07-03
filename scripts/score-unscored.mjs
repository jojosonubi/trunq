/**
 * score-unscored.mjs — Batches scorer for the unscored backlog.
 *
 * Scores ONLY images that need it (score_status IN ('unscored','failed')) via the
 * Anthropic Message Batches API (Sonnet 4.6, 50% off), using a TRIMMED tool that
 * asks for only quality_score + description + dominant_colours (no tag vocabulary —
 * scoring discards tags, so we don't pay for output tokens we'd throw away).
 *
 * Image is sent as a signed URL (full-res; Anthropic fetches + downscales) — no
 * local download, no Supabase egress. Submission is throttled SEQUENTIALLY (one
 * batch in flight, ~1,500 each, wait for `ended` before the next) to stay under
 * the 2,000/min URL-content-fetching limit.
 *
 * Ingest is inline (like scripts/tag-untagged.mjs): on `ended`, write quality_score
 * (1–10 → 0–100), description, dominant_colours and set score_status. TAGS AND
 * tagging_status ARE NEVER TOUCHED.
 *
 * Idempotent + re-runnable: only ever picks up unscored/failed; a crash just means
 * a re-run re-submits the un-ingested rows.
 *
 * SAFETY: dry run by default. Submits/writes ONLY with `--go`.
 *   node scripts/score-unscored.mjs        # dry run — plan only, spends nothing
 *   node scripts/score-unscored.mjs --go   # live: submit + ingest (billable, ~$107)
 */

import dotenv from 'dotenv'
import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@supabase/supabase-js'

dotenv.config({ path: '.env.local' })

const GO           = process.argv.includes('--go')
const ORG          = '2b557660-6bb3-4d41-9b49-71e860681b9c'   // recess
const MEDIA_BUCKET = 'media'
const BATCH_SIZE   = 1500              // one batch in flight; <2000/min URL-fetch limit
const SIGN_CHUNK   = 1000              // Supabase createSignedUrls cap
const SIGN_TTL     = 48 * 60 * 60      // 48h — margin over Anthropic's 24h batch limit
const DB_CONC      = 20                // concurrent per-row score updates
const POLL_MS      = 20_000
const POLL_MAX     = 360               // ~2h per batch

const SUPABASE_URL  = process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_KEY   = process.env.SUPABASE_SERVICE_ROLE_KEY
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY
if (!SUPABASE_URL || !SERVICE_KEY) { console.error('Missing Supabase env'); process.exit(1) }
if (GO && !ANTHROPIC_KEY)          { console.error('Missing ANTHROPIC_API_KEY'); process.exit(1) }

const supabase  = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } })
const anthropic = ANTHROPIC_KEY ? new Anthropic({ apiKey: ANTHROPIC_KEY }) : null
const sleep = (ms) => new Promise(r => setTimeout(r, ms))
const ts    = () => new Date().toISOString().slice(11, 19)

const COLOUR_PALETTE = ['red','orange','yellow','green','teal','blue','purple','pink','white','black','grey','brown']

// TRIMMED tool — score + description + colours only (no tag vocabulary).
const SCORE_TOOL = {
  name: 'score_image',
  description: 'Assess a Recess archive event photo: a quality score, a one-sentence description, and dominant colours.',
  input_schema: {
    type: 'object',
    properties: {
      quality_score: { type: 'number',
        description: 'Score 1-10 for nightlife/event photography. HIGH (7-10): clear subject/moment, energy and action (dancing/posing/movement), social cohesion (group sharing a moment, eye contact), expressive faces, good framing, intentional motion blur with energy. LOW (1-4): no focal point, disconnected subjects not interacting, poor framing, technically poor AND lacking energy/story. NUANCES: do NOT penalise motion blur if the image has energy and story; do NOT penalise low light if faces/subjects are readable; do NOT apply standard photography rules (sharpness, rule of thirds) as primary criteria — a technically imperfect image with clear energy beats a technically perfect but lifeless one.' },
      description: { type: 'string',
        description: 'One concise sentence (max 20 words) describing what is visually present. Lead with the subject(s), then their action/pose, then notable styling or environmental details. Use concrete observations. AVOID vibe-prose (\'serves energy\', \'captures the moment\'). AVOID generic descriptors (\'expressive\', \'vibrant\'). Describe what you literally see.' },
      dominant_colours: { type: 'array', items: { type: 'string', enum: COLOUR_PALETTE },
        description: 'The 1-3 most visually dominant colours, chosen strictly from the allowed enum.' },
    },
    required: ['quality_score', 'description', 'dominant_colours'],
  },
}
const PROMPT = 'Assess this nightlife/event photo. Score on energy, story, and moment — not technical perfection. Most photos score 4–7; reserve 8–10 for shots with genuine energy and a clear moment, and 1–3 for shots with no focal point or story. Give one concrete sentence describing what is visible (avoid vibe-prose), and the 1–3 dominant colours from the allowed list.'

async function fetchPending() {
  const rows = []
  const PAGE = 1000
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from('media_files')
      .select('id, storage_path, display_path, organisation_id')
      .in('score_status', ['unscored', 'failed'])
      .eq('file_type', 'image')
      .is('deleted_at', null)
      .eq('organisation_id', ORG)
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
    const { data, error } = await supabase.storage.from(MEDIA_BUCKET).createSignedUrls(paths.slice(i, i + SIGN_CHUNK), SIGN_TTL)
    if (error) { console.error('  sign chunk failed:', error.message); continue }
    for (const item of (data ?? [])) if (item.signedUrl && item.path) map.set(item.path, item.signedUrl)
  }
  return map
}

async function waitForEnd(batchId) {
  for (let i = 0; i < POLL_MAX; i++) {
    const b = await anthropic.messages.batches.retrieve(batchId)
    if (b.processing_status === 'ended') return
    if (i % 3 === 0) {
      const c = b.request_counts
      console.log(`    [${ts()}] ${b.processing_status} — processing:${c.processing} succeeded:${c.succeeded} errored:${c.errored}`)
    }
    await sleep(POLL_MS)
  }
  throw new Error(`batch ${batchId} did not end within ~${(POLL_MAX * POLL_MS) / 60000}m`)
}

// Run async fn over items with bounded concurrency.
async function runConc(items, conc, fn) {
  let idx = 0
  const workers = Array.from({ length: Math.min(conc, items.length) }, async () => {
    while (idx < items.length) { const i = idx++; await fn(items[i]) }
  })
  await Promise.all(workers)
}

// Ingest a finished batch — writes ONLY score fields, never tags/tagging_status.
async function ingest(batchId) {
  const updates = [], failedIds = []
  for await (const item of await anthropic.messages.batches.results(batchId)) {
    const id = item.custom_id
    if (item.result.type !== 'succeeded') { failedIds.push(id); continue }
    const toolBlock = item.result.message.content.find(b => b.type === 'tool_use')
    if (!toolBlock) { failedIds.push(id); continue }
    const r = toolBlock.input ?? {}
    // 1–10 → 0–100, clamped (mirrors src/lib/scoring.ts)
    const qualityScore = Math.min(100, Math.max(0, Math.round(Math.min(10, Math.max(1, Number(r.quality_score) || 1)) * 10)))
    const dominantColours = (Array.isArray(r.dominant_colours) ? r.dominant_colours : [])
      .filter(c => COLOUR_PALETTE.includes(c)).slice(0, 3)
    const description = typeof r.description === 'string' ? r.description : null
    updates.push({ id, quality_score: qualityScore, description, dominant_colours: dominantColours })
  }

  let ok = 0, failed = 0
  await runConc(updates, DB_CONC, async (u) => {
    const { error } = await supabase.from('media_files')
      .update({ quality_score: u.quality_score, description: u.description, dominant_colours: u.dominant_colours, score_status: 'complete' })
      .eq('id', u.id)
    if (error) { failed++; console.error(`    update failed ${u.id}: ${error.message}`) } else ok++
  })
  for (let i = 0; i < failedIds.length; i += 500) {
    await supabase.from('media_files').update({ score_status: 'failed' }).in('id', failedIds.slice(i, i + 500))
  }
  return { ok, failed: failed + failedIds.length }
}

async function processBatch(chunk, idx, total) {
  const paths = chunk.map(r => r.display_path ?? r.storage_path)
  const urlMap = await signPaths(paths)
  const requests = chunk.map(row => ({
    custom_id: row.id,
    params: {
      model: 'claude-sonnet-4-6',
      max_tokens: 512,
      tools: [SCORE_TOOL],
      tool_choice: { type: 'tool', name: 'score_image' },
      messages: [{ role: 'user', content: [
        { type: 'image', source: { type: 'url', url: urlMap.get(row.display_path ?? row.storage_path) ?? '' } },
        { type: 'text', text: PROMPT },
      ] }],
    },
  }))
  const missing = requests.filter(r => !r.params.messages[0].content[0].source.url).length
  if (missing) console.warn(`  batch ${idx}/${total}: ${missing}/${chunk.length} rows had no signable URL`)

  const batch = await anthropic.messages.batches.create({ requests })
  console.log(`  batch ${idx}/${total}: [${ts()}] submitted ${batch.id} (${chunk.length} reqs) — waiting…`)
  await waitForEnd(batch.id)
  const { ok, failed } = await ingest(batch.id)
  console.log(`  batch ${idx}/${total}: [${ts()}] ingested — scored=${ok} failed=${failed}`)
  return { ok, failed }
}

async function main() {
  console.log(GO ? '*** LIVE RUN (--go): submit + ingest scores, billable (~$107) ***'
                 : '--- DRY RUN: no submissions, no DB writes. Re-run with --go to execute. ---')
  console.log('Writes ONLY quality_score / description / dominant_colours + score_status. Tags untouched.\n')

  const rows = await fetchPending()
  console.log(`Unscored/failed images (recess): ${rows.length}`)
  if (rows.length === 0) { console.log('Nothing to do.'); return }

  const orgs = [...new Set(rows.map(r => r.organisation_id))]
  if (orgs.length !== 1 || orgs[0] !== ORG) { console.error(`Unexpected org set: ${orgs}. Aborting.`); process.exit(1) }
  const nBatches = Math.ceil(rows.length / BATCH_SIZE)
  const withDisplay = rows.filter(r => r.display_path).length
  console.log(`Org: ${ORG}`)
  console.log(`Have a display derivative: ${withDisplay}/${rows.length} (rest use the full original via URL)`)
  console.log(`Plan: ${nBatches} sequential batch(es) of up to ${BATCH_SIZE}, one in flight at a time.`)

  if (!GO) {
    const probe = rows[0].display_path ?? rows[0].storage_path
    const m = await signPaths([probe])
    console.log(`\nSign probe "${probe}": ${m.get(probe) ? 'OK — ' + m.get(probe).slice(0, 80) + '…' : 'FAILED'}`)
    console.log('\nDry run complete. Nothing submitted, nothing changed.')
    return
  }

  let okTotal = 0, failTotal = 0
  for (let i = 0, idx = 1; i < rows.length; i += BATCH_SIZE, idx++) {
    const { ok, failed } = await processBatch(rows.slice(i, i + BATCH_SIZE), idx, nBatches)
    okTotal += ok; failTotal += failed
  }
  console.log(`\nDONE. scored=${okTotal} failed=${failTotal} across ${nBatches} batch(es).`)
  if (failTotal) console.log('Re-run `node scripts/score-unscored.mjs --go` to retry the failures.')
}

main().catch(err => { console.error('FATAL:', err); process.exit(1) })
