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
import { indexFaceForMediaFile } from '@/lib/aws/rekognition'

const BATCH_SIZE = 3

// Default to test-mode ON so a missing env var never accidentally runs wide
const TEST_MODE = process.env.NEXT_PUBLIC_FOTO_LAB_TEST_MODE !== 'false'

function isAuthorized(request: NextRequest): boolean {
  const taskSecret = process.env.TASK_SECRET
  const cronSecret = process.env.CRON_SECRET

  if (taskSecret && request.headers.get('x-task-secret') === taskSecret) return true
  if (cronSecret && request.headers.get('authorization') === `Bearer ${cronSecret}`) return true
  if (!taskSecret && !cronSecret) return true
  return false
}

type Result = {
  id:      string
  status:  'complete' | 'no_faces' | 'failed'
  faceIds?: string[]
  error?:  string
}

async function handle(_request: NextRequest): Promise<NextResponse> {
  const service = createServiceClient()
  const limit   = TEST_MODE ? 1 : BATCH_SIZE

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

  const ids = candidates.map((r: { id: string }) => r.id)

  // Optimistic lock — only claim rows still in 'queued' state
  await service
    .from('media_files')
    .update({ rekognition_indexing_status: 'processing' })
    .in('id', ids)
    .eq('rekognition_indexing_status', 'queued')

  // ── Process batch concurrently ────────────────────────────────────────────
  const results: Result[] = []

  await Promise.all(ids.map(async (id: string) => {
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

      results.push({ id, status: finalStatus, faceIds })
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      console.error('[foto-lab/index] failed:', id, message)

      await service
        .from('media_files')
        .update({ rekognition_indexing_status: 'failed' })
        .eq('id', id)

      results.push({ id, status: 'failed', error: message })
    }
  }))

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
