/**
 * GET|POST /api/foto-lab/index  (internal — do not call from client directly)
 *
 * Claims the next batch of media_files with rekognition_indexing_status='queued'
 * and indexes their faces into Rekognition. Invoked every minute by Vercel Cron
 * (GET) or manually via curl (POST).
 *
 * Auth: x-task-secret header (manual) OR Authorization: Bearer <CRON_SECRET> (cron).
 *
 * Safety:
 *   NEXT_PUBLIC_FOTO_LAB_TEST_MODE=true  → process at most 1 photo per call (default when unset)
 *   NEXT_PUBLIC_FOTO_LAB_TEST_MODE=false → process up to BATCH_SIZE photos per call
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { indexFaceForMediaFile, persistRekognitionError } from '@/lib/aws/rekognition'

const BATCH_SIZE = 30

// Default to test-mode ON so a missing env var never accidentally runs wide
const TEST_MODE = process.env.NEXT_PUBLIC_FOTO_LAB_TEST_MODE !== 'false'

function isAuthorized(request: NextRequest): boolean {
  const taskSecret = process.env.TASK_SECRET
  const cronSecret = process.env.CRON_SECRET

  // Fail closed: with no secrets configured this endpoint must not be public
  if (!taskSecret && !cronSecret) {
    console.error('[foto-lab/index] config error: neither TASK_SECRET nor CRON_SECRET is set — rejecting all requests')
    return false
  }
  if (taskSecret && request.headers.get('x-task-secret') === taskSecret) return true
  if (cronSecret && request.headers.get('authorization') === `Bearer ${cronSecret}`) return true
  return false
}

type Result = {
  id:      string
  status:  'complete' | 'no_faces' | 'failed'
  faceIds?: string[]
  error?:  string
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
  const limit   = TEST_MODE ? 1 : BATCH_SIZE

  // ── Recovery: re-queue rows orphaned by timed-out invocations ────────────
  // Based on claim time (rekognition_claimed_at, set when a batch claims rows).
  // 10-minute threshold safely exceeds maxDuration (300s) — active batches finish in ~50s.
  // NULL claimed_at also recovers: covers rows claimed before migration 037.
  const recoveryThreshold = new Date(Date.now() - 10 * 60 * 1000).toISOString()
  const { count: recoveredCount } = await service
    .from('media_files')
    .update({ rekognition_indexing_status: 'queued', rekognition_claimed_at: null }, { count: 'exact' })
    .eq('rekognition_indexing_status', 'processing')
    .or(`rekognition_claimed_at.lt.${recoveryThreshold},rekognition_claimed_at.is.null`)
  if (recoveredCount && recoveredCount > 0) {
    console.log(`[foto-lab/index] re-queued ${recoveredCount} stuck rows`)
  }

  // ── Claim next batch atomically ───────────────────────────────────────────
  const { data: candidates } = await service
    .from('media_files')
    .select('id')
    .eq('rekognition_indexing_status', 'queued')
    .eq('file_type', 'image')
    .is('deleted_at', null)
    .order('created_at', { ascending: true })
    .limit(limit)

  if (!candidates || candidates.length === 0) {
    return NextResponse.json({ processed: 0, remaining: 0, results: [] })
  }

  const candidateIds = candidates.map((r: { id: string }) => r.id)

  // Atomic claim — update with a status guard and .select() back the rows we won.
  // A concurrent invocation that selected the same candidates will only have its
  // update match rows still 'queued', so each row is processed by exactly one caller.
  // rekognition_claimed_at stamps the claim time for stuck-row recovery.
  const { data: claimed } = await service
    .from('media_files')
    .update({
      rekognition_indexing_status: 'processing',
      rekognition_claimed_at:      new Date().toISOString(),
    })
    .in('id', candidateIds)
    .eq('rekognition_indexing_status', 'queued')
    .select('id')

  const ids = (claimed ?? []).map((r: { id: string }) => r.id)
  if (ids.length === 0) {
    return NextResponse.json({ processed: 0, remaining: 0, results: [] })
  }

  // ── Process batch with capped concurrency (avoid Rekognition TPS limit) ───
  const results = await runWithConcurrency<string, Result>(ids, 3, async (id) => {
    try {
      const { faceIds } = await indexFaceForMediaFile(id)

      const finalStatus = faceIds.length > 0 ? 'complete' : 'no_faces'

      await service
        .from('media_files')
        .update({
          rekognition_indexing_status: finalStatus,
          rekognition_face_ids:        faceIds,
          rekognition_indexed_at:      new Date().toISOString(),
        })
        .eq('id', id)

      return { id, status: finalStatus, faceIds }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      console.error('[foto-lab/index] failed:', id, message)

      await service
        .from('media_files')
        .update({ rekognition_indexing_status: 'failed' })
        .eq('id', id)

      // Best-effort — column may not exist yet if migration 035 hasn't run
      await persistRekognitionError(id, message).catch(() => {})

      return { id, status: 'failed' as const, error: message }
    }
  })

  // ── Remaining count ───────────────────────────────────────────────────────
  const { count: remaining } = await service
    .from('media_files')
    .select('id', { count: 'exact', head: true })
    .eq('rekognition_indexing_status', 'queued')
    .eq('file_type', 'image')
    .is('deleted_at', null)

  const processed = results.filter(r => r.status !== 'failed').length

  return NextResponse.json({
    processed,
    remaining: remaining ?? 0,
    testMode:  TEST_MODE,
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
