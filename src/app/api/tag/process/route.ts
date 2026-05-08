/**
 * GET|POST /api/tag/process  (internal — do not call from client directly)
 *
 * Claims the next batch of queued images and processes them.
 * Invoked every minute by Vercel Cron (GET) or manually via curl (POST).
 *
 * Auth: x-task-secret header (manual) OR Authorization: Bearer <CRON_SECRET> (cron).
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { scoreMediaFile } from '@/lib/scoring'

const BATCH_SIZE = 3

function isAuthorized(request: NextRequest): boolean {
  const taskSecret = process.env.TASK_SECRET
  const cronSecret = process.env.CRON_SECRET

  if (taskSecret && request.headers.get('x-task-secret') === taskSecret) return true
  if (cronSecret && request.headers.get('authorization') === `Bearer ${cronSecret}`) return true
  // If neither secret is configured, allow through (dev/local)
  if (!taskSecret && !cronSecret) return true
  return false
}

async function handle(_request: NextRequest): Promise<NextResponse> {
  const service = createServiceClient()

  // ── Claim next batch atomically ───────────────────────────────────────────
  const { data: candidates } = await service
    .from('media_files')
    .select('id')
    .eq('tagging_status', 'queued')
    .eq('file_type', 'image')
    .is('deleted_at', null)
    .order('created_at', { ascending: true })
    .limit(BATCH_SIZE)

  if (!candidates || candidates.length === 0) {
    return NextResponse.json({ processed: 0, remaining: 0 })
  }

  const ids = candidates.map((r: { id: string }) => r.id)

  await service
    .from('media_files')
    .update({ tagging_status: 'processing', score_status: 'processing' })
    .in('id', ids)
    .eq('tagging_status', 'queued')  // optimistic lock — skip already-claimed rows

  // ── Process batch concurrently ────────────────────────────────────────────
  let processed = 0
  await Promise.all(ids.map(async (id: string) => {
    try {
      await scoreMediaFile(id)
      await service
        .from('media_files')
        .update({ tagging_status: 'complete', score_status: 'complete' })
        .eq('id', id)
      processed++
    } catch (err) {
      console.error('[tag/process] failed:', id, err)
      await service
        .from('media_files')
        .update({ tagging_status: 'failed', score_status: 'failed' })
        .eq('id', id)
    }
  }))

  // ── Check remaining queue ─────────────────────────────────────────────────
  const { count: remaining } = await service
    .from('media_files')
    .select('id', { count: 'exact', head: true })
    .eq('tagging_status', 'queued')
    .eq('file_type', 'image')
    .is('deleted_at', null)

  return NextResponse.json({ processed, remaining: remaining ?? 0 })
}

export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  return handle(request)
}

export async function POST(request: NextRequest) {
  if (!isAuthorized(request)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  return handle(request)
}
