/**
 * backfill-derivatives.mjs — Generates missing display derivatives.
 *
 * For every live image row with display_path IS NULL (org recess): download the
 * original from storage, generate the display derivative EXACTLY like
 * src/lib/storage/derivatives.ts (rotate → ≤4000px long edge → JPEG q85,
 * retry q80/q75 if >20MB, `_display` suffix before the extension), upload it
 * (upsert), and set display_path on the row.
 *
 * WHY: rows without a display derivative fail Anthropic URL-fetch scoring
 * (2026-07-03 run: all 1,400 batch-1 failures were display_path NULL rows) and
 * fall back to multi-MB originals in scoring.ts / rekognition.ts.
 *
 * Idempotent + re-runnable: only ever picks up display_path IS NULL; a crash or
 * per-row failure just means the row is picked up on the next run.
 *
 * SAFETY: dry run by default. Downloads/uploads/writes ONLY with `--go`.
 *   node scripts/backfill-derivatives.mjs        # dry run — plan only
 *   node scripts/backfill-derivatives.mjs --go   # live: generate + write
 */

import dotenv from 'dotenv'
import sharp from 'sharp'
import { createClient } from '@supabase/supabase-js'

dotenv.config({ path: '.env.local' })

const GO           = process.argv.includes('--go')
const ORG          = '2b557660-6bb3-4d41-9b49-71e860681b9c'   // recess
const MEDIA_BUCKET = 'media'
const CONCURRENCY  = 5                 // parallel rows (download + sharp + upload)
const MAX_DISPLAY_BYTES = 20 * 1024 * 1024
const LONG_EDGE    = 4000

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!SUPABASE_URL || !SERVICE_KEY) { console.error('Missing Supabase env'); process.exit(1) }

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } })
const ts = () => new Date().toISOString().slice(11, 19)

// Mirrors derivePath() in src/lib/storage/derivatives.ts.
function derivePath(originalPath, suffix) {
  const lastDot = originalPath.lastIndexOf('.')
  if (lastDot === -1) return `${originalPath}${suffix}`
  return `${originalPath.slice(0, lastDot)}${suffix}${originalPath.slice(lastDot)}`
}

// Mirrors generateDisplayDerivative() in src/lib/storage/derivatives.ts.
async function generateDisplay(originalBuffer, originalPath) {
  const path = derivePath(originalPath, '_display')
  for (const quality of [85, 80, 75]) {
    const buffer = await sharp(originalBuffer)
      .rotate()
      .resize({ width: LONG_EDGE, height: LONG_EDGE, fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality })
      .toBuffer()
    if (buffer.length <= MAX_DISPLAY_BYTES || quality === 75) return { buffer, path }
  }
  throw new Error('unreachable')
}

async function fetchPending() {
  const rows = []
  const PAGE = 1000
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from('media_files')
      .select('id, storage_path, file_size, score_status')
      .is('display_path', null)
      .eq('file_type', 'image')
      .is('deleted_at', null)
      .eq('organisation_id', ORG)
      .order('created_at', { ascending: true })
      .range(from, from + PAGE - 1)
    if (error) throw new Error(`fetch failed: ${error.message}`)
    rows.push(...(data ?? []))
    if (!data || data.length < PAGE) break
  }
  // Scoring-blocked rows first (unscored/failed), so a scoring sweep can start
  // as early as possible; created_at order preserved within each group.
  const blocked = (r) => r.score_status === 'unscored' || r.score_status === 'failed'
  return [...rows.filter(blocked), ...rows.filter((r) => !blocked(r))]
}

async function processRow(row) {
  const { data: fileData, error: dlErr } = await supabase.storage.from(MEDIA_BUCKET).download(row.storage_path)
  if (dlErr || !fileData) return { id: row.id, error: `download: ${dlErr?.message ?? 'empty response'}` }

  let derivative
  try {
    derivative = await generateDisplay(Buffer.from(await fileData.arrayBuffer()), row.storage_path)
  } catch (err) {
    return { id: row.id, error: `sharp: ${err instanceof Error ? err.message : String(err)}` }
  }

  const { error: upErr } = await supabase.storage.from(MEDIA_BUCKET)
    .upload(derivative.path, derivative.buffer, { contentType: 'image/jpeg', upsert: true })
  if (upErr) return { id: row.id, error: `upload: ${upErr.message}` }

  const { error: dbErr } = await supabase.from('media_files')
    .update({ display_path: derivative.path })
    .eq('id', row.id)
  if (dbErr) return { id: row.id, error: `db: ${dbErr.message}` }

  return { id: row.id }
}

async function main() {
  console.log(GO ? '*** LIVE RUN (--go): generating + uploading derivatives, writing display_path ***'
                 : '--- DRY RUN: no downloads, no uploads, no DB writes. Re-run with --go. ---')

  const rows = await fetchPending()
  const totalMB = rows.reduce((n, r) => n + (r.file_size ?? 0), 0) / 1048576
  const over5   = rows.filter((r) => (r.file_size ?? 0) > 5 * 1024 * 1024).length
  const pendingScore = rows.filter((r) => r.score_status === 'unscored' || r.score_status === 'failed').length
  console.log(`Rows missing display_path (recess, live images): ${rows.length}`)
  console.log(`  total original bytes to download: ~${Math.round(totalMB)}MB · >5MB originals: ${over5}`)
  console.log(`  of these, pending scoring (unscored/failed): ${pendingScore}`)
  if (rows.length === 0) { console.log('Nothing to do.'); return }

  if (!GO) { console.log('\nDry run complete. Nothing changed.'); return }

  let done = 0, ok = 0
  const failures = []
  let idx = 0
  const workers = Array.from({ length: Math.min(CONCURRENCY, rows.length) }, async () => {
    while (idx < rows.length) {
      const i = idx++
      const res = await processRow(rows[i])
      done++
      if (res.error) { failures.push(res); console.error(`  [${ts()}] FAIL ${res.id}: ${res.error}`) }
      else ok++
      if (done % 100 === 0) console.log(`  [${ts()}] progress ${done}/${rows.length} — ok=${ok} failed=${failures.length}`)
    }
  })
  await Promise.all(workers)

  console.log(`\nDONE. ok=${ok} failed=${failures.length} of ${rows.length}.`)
  if (failures.length) console.log('Failed rows keep display_path NULL — re-run to retry.')
}

main().catch((err) => { console.error('FATAL:', err); process.exit(1) })
