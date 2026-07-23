/**
 * GET|POST /api/embed/process  (internal — do not call from client directly)
 *
 * Claims the next batch of media_files with embedding_status = 'pending'
 * ('pending' is the column default new uploads land in, so fresh rows are
 * claimable with no upload-route change) and embeds them into photo_embeddings
 * via Bedrock Titan Multimodal. Invoked every minute by Vercel Cron (GET) or
 * manually via curl (POST).
 *
 * Auth: x-task-secret header (manual) OR Authorization: Bearer <CRON_SECRET> (cron).
 *
 * The initial ~25.4k-row backfill is scripts/backfill-embeddings.mjs — at
 * BATCH_SIZE per minute this cron is steady-state only (new uploads + retries).
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { embedImage, prepareImageForEmbedding } from '@/lib/aws/bedrock'

const BATCH_SIZE   = 30
const CONCURRENCY  = 8
const MEDIA_BUCKET = 'media'

function isAuthorized(request: NextRequest): boolean {
  const taskSecret = process.env.TASK_SECRET
  const cronSecret = process.env.CRON_SECRET

  // Fail closed: with no secrets configured this endpoint must not be public
  if (!taskSecret && !cronSecret) {
    console.error('[embed/process] config error: neither TASK_SECRET nor CRON_SECRET is set — rejecting all requests')
    return false
  }
  if (taskSecret && request.headers.get('x-task-secret') === taskSecret) return true
  if (cronSecret && request.headers.get('authorization') === `Bearer ${cronSecret}`) return true
  return false
}

type Result = {
  id:     string
  status: 'complete' | 'failed'
  error?: string
}

async function runWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<R>
): Promise<R[]> {
  // Worker pool: each worker pulls the next unclaimed item, so at most
  // `concurrency` calls to fn are in flight at any moment.
  const results: R[] = new Array(items.length)
  let next = 0
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (next < items.length) {
      const i = next++
      results[i] = await fn(items[i])
    }
  })
  await Promise.all(workers)
  return results
}

async function handle(_request: NextRequest): Promise<NextResponse> {
  const service = createServiceClient()

  // ── Recovery: re-queue rows orphaned by timed-out invocations ────────────
  // 10-minute threshold safely exceeds maxDuration (300s).
  const recoveryThreshold = new Date(Date.now() - 10 * 60 * 1000).toISOString()
  const { count: recoveredCount } = await service
    .from('media_files')
    .update({ embedding_status: 'pending', embedding_claimed_at: null }, { count: 'exact' })
    .eq('embedding_status', 'processing')
    .or(`embedding_claimed_at.lt.${recoveryThreshold},embedding_claimed_at.is.null`)
  if (recoveredCount && recoveredCount > 0) {
    console.log(`[embed/process] re-queued ${recoveredCount} stuck rows`)
  }

  // ── Claim next batch atomically ───────────────────────────────────────────
  const { data: candidates } = await service
    .from('media_files')
    .select('id')
    .eq('embedding_status', 'pending')
    .eq('file_type', 'image')
    .is('deleted_at', null)
    .order('created_at', { ascending: true })
    .limit(BATCH_SIZE)

  if (!candidates || candidates.length === 0) {
    return NextResponse.json({ processed: 0, remaining: 0, results: [] })
  }

  const candidateIds = candidates.map((r: { id: string }) => r.id)

  // Atomic claim — update with a status guard and .select() back the rows we won.
  const { data: claimed } = await service
    .from('media_files')
    .update({
      embedding_status:     'processing',
      embedding_claimed_at: new Date().toISOString(),
    })
    .in('id', candidateIds)
    .eq('embedding_status', 'pending')
    .select('id')

  const ids = (claimed ?? []).map((r: { id: string }) => r.id)
  if (ids.length === 0) {
    return NextResponse.json({ processed: 0, remaining: 0, results: [] })
  }

  // ── Process batch with capped concurrency ─────────────────────────────────
  const results = await runWithConcurrency<string, Result>(ids, CONCURRENCY, async (id) => {
    try {
      const { data: row, error: rowErr } = await service
        .from('media_files')
        .select('storage_path, display_path, organisation_id')
        .eq('id', id)
        .single()
      if (rowErr || !row) throw new Error(`row fetch: ${rowErr?.message ?? 'not found'}`)

      // Full-frame display derivative preferred (see prepareImageForEmbedding)
      const path = row.display_path ?? row.storage_path
      const { data: fileData, error: dlErr } = await service.storage.from(MEDIA_BUCKET).download(path)
      if (dlErr || !fileData) throw new Error(`download: ${dlErr?.message ?? 'empty response'}`)

      const b64       = await prepareImageForEmbedding(Buffer.from(await fileData.arrayBuffer()))
      const embedding = await embedImage(b64)

      const { error: upErr } = await service
        .from('photo_embeddings')
        .upsert({ media_file_id: id, organisation_id: row.organisation_id, embedding: JSON.stringify(embedding) })
      if (upErr) throw new Error(`upsert: ${upErr.message}`)

      await service
        .from('media_files')
        .update({ embedding_status: 'complete', embedding_claimed_at: null })
        .eq('id', id)

      return { id, status: 'complete' as const }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      console.error('[embed/process] failed:', id, message)

      await service
        .from('media_files')
        .update({ embedding_status: 'failed' })
        .eq('id', id)

      return { id, status: 'failed' as const, error: message }
    }
  })

  // ── Remaining count ───────────────────────────────────────────────────────
  const { count: remaining } = await service
    .from('media_files')
    .select('id', { count: 'exact', head: true })
    .eq('embedding_status', 'pending')
    .eq('file_type', 'image')
    .is('deleted_at', null)

  const processed = results.filter(r => r.status === 'complete').length

  return NextResponse.json({
    processed,
    remaining: remaining ?? 0,
    results,
  })
}

export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  return handle(request)
}

export async function POST(request: NextRequest) {
  if (!isAuthorized(request)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  return handle(request)
}
