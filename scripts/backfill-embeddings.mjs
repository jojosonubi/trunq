/**
 * backfill-embeddings.mjs — Embeds the archive into photo_embeddings.
 *
 * For every live image row with embedding_status IN ('pending','failed')
 * (org recess): download the display derivative (full frame — NOT the 600x600
 * attention-crop thumb, which can discard subjects at frame edges), normalise
 * EXACTLY like prepareImageForEmbedding() in src/lib/aws/bedrock.ts (rotate →
 * 768px inside fit → JPEG q80 → base64), call Bedrock Titan Multimodal G1
 * (us-east-1, sync InvokeModel — no batch API exists), upsert photo_embeddings,
 * and flip embedding_status to complete.
 *
 * Requires migration 042 applied, Bedrock model access enabled for
 * amazon.titan-embed-image-v1 in us-east-1, and live AWS creds in .env.local.
 *
 * Idempotent + re-runnable: only picks up pending/failed; upsert is keyed on
 * media_file_id, so a crash or per-row failure just means re-run.
 *
 * Cost: ~$0.00006/image → ~$1.55 for the full ~25.4k archive.
 *
 * SAFETY: dry run by default. Downloads/API calls/writes ONLY with `--go`.
 *   node scripts/backfill-embeddings.mjs               # dry run — plan only
 *   node scripts/backfill-embeddings.mjs --go          # live: embed + write
 *   node scripts/backfill-embeddings.mjs --limit 50 --go   # pilot slice
 */

import dotenv from 'dotenv'
import sharp from 'sharp'
import { createClient } from '@supabase/supabase-js'
import { BedrockRuntimeClient, InvokeModelCommand } from '@aws-sdk/client-bedrock-runtime'

dotenv.config({ path: '.env.local' })

const GO           = process.argv.includes('--go')
const LIMIT        = Number((process.argv.find((a) => a === '--limit') && process.argv[process.argv.indexOf('--limit') + 1]) ?? 0)
const ORG          = '2b557660-6bb3-4d41-9b49-71e860681b9c'   // recess
const MEDIA_BUCKET = 'media'
const CONCURRENCY  = Number(process.env.BACKFILL_CONCURRENCY ?? 8)   // Bedrock is sync-only; 8 workers ≈ 10-15 rps
const MODEL_ID     = 'amazon.titan-embed-image-v1'
const EMBED_DIM    = 1024
const EMBED_PX     = 768

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!SUPABASE_URL || !SERVICE_KEY) { console.error('Missing Supabase env'); process.exit(1) }
if (!process.env.AWS_ACCESS_KEY_ID || !process.env.AWS_SECRET_ACCESS_KEY) { console.error('Missing AWS env'); process.exit(1) }

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } })
// us-east-1 pinned: Titan Multimodal is not in eu-west-2 (see src/lib/aws/bedrock.ts)
const bedrock  = new BedrockRuntimeClient({
  region:      'us-east-1',
  credentials: { accessKeyId: process.env.AWS_ACCESS_KEY_ID, secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY },
  maxAttempts: 5,
  retryMode:   'adaptive',
})
const ts = () => new Date().toISOString().slice(11, 19)

// Mirrors embedImage() in src/lib/aws/bedrock.ts.
async function embedImage(base64Jpeg) {
  const res = await bedrock.send(new InvokeModelCommand({
    modelId: MODEL_ID, contentType: 'application/json', accept: 'application/json',
    body: JSON.stringify({ inputImage: base64Jpeg, embeddingConfig: { outputEmbeddingLength: EMBED_DIM } }),
  }))
  const parsed = JSON.parse(new TextDecoder().decode(res.body))
  if (!parsed.embedding || parsed.embedding.length !== EMBED_DIM) {
    throw new Error(`bad embedding response: ${parsed.message ?? 'missing embedding'}`)
  }
  return parsed.embedding
}

async function fetchPending() {
  const rows = []
  const PAGE = 1000
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from('media_files')
      .select('id, storage_path, display_path')
      .in('embedding_status', ['pending', 'failed'])
      .eq('file_type', 'image')
      .is('deleted_at', null)
      .eq('organisation_id', ORG)
      .order('created_at', { ascending: true })
      .range(from, from + PAGE - 1)
    if (error) throw new Error(`fetch failed: ${error.message}`)
    rows.push(...(data ?? []))
    if (!data || data.length < PAGE) break
  }
  return LIMIT > 0 ? rows.slice(0, LIMIT) : rows
}

async function processRow(row) {
  const path = row.display_path ?? row.storage_path
  const { data: fileData, error: dlErr } = await supabase.storage.from(MEDIA_BUCKET).download(path)
  if (dlErr || !fileData) return { id: row.id, error: `download: ${dlErr?.message ?? 'empty response'}` }

  let embedding
  try {
    const b64 = (await sharp(Buffer.from(await fileData.arrayBuffer()))
      .rotate()
      .resize({ width: EMBED_PX, height: EMBED_PX, fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 80 })
      .toBuffer()).toString('base64')
    embedding = await embedImage(b64)
  } catch (err) {
    return { id: row.id, error: `embed: ${err instanceof Error ? err.message : String(err)}` }
  }

  const { error: upErr } = await supabase.from('photo_embeddings')
    .upsert({ media_file_id: row.id, organisation_id: ORG, embedding: JSON.stringify(embedding) })
  if (upErr) return { id: row.id, error: `upsert: ${upErr.message}` }

  const { error: dbErr } = await supabase.from('media_files')
    .update({ embedding_status: 'complete', embedding_claimed_at: null })
    .eq('id', row.id)
  if (dbErr) return { id: row.id, error: `db: ${dbErr.message}` }

  return { id: row.id }
}

async function markFailed(id) {
  await supabase.from('media_files').update({ embedding_status: 'failed' }).eq('id', id)
}

async function main() {
  console.log(GO ? '*** LIVE RUN (--go): calling Bedrock (billable), writing embeddings ***'
                 : '--- DRY RUN: no downloads, no API calls, no DB writes. Re-run with --go. ---')

  const rows = await fetchPending()
  console.log(`Rows pending embedding (recess, live images): ${rows.length}${LIMIT > 0 ? ` (capped by --limit ${LIMIT})` : ''}`)
  console.log(`  estimated cost: ~$${(rows.length * 0.00006).toFixed(2)} · concurrency: ${CONCURRENCY}`)
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
      if (res.error) {
        failures.push(res)
        await markFailed(res.id)
        console.error(`  [${ts()}] FAIL ${res.id}: ${res.error}`)
      } else ok++
      if (done % 200 === 0) console.log(`  [${ts()}] progress ${done}/${rows.length} — ok=${ok} failed=${failures.length}`)
    }
  })
  await Promise.all(workers)

  console.log(`\nDONE. ok=${ok} failed=${failures.length} of ${rows.length}.`)
  if (failures.length) console.log('Failed rows are embedding_status=failed — re-run to retry.')
}

main().catch((err) => { console.error('FATAL:', err); process.exit(1) })
