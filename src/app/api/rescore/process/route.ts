/**
 * GET|POST /api/rescore/process  (internal — protected by x-task-secret or CRON_SECRET)
 *
 * Claims the next batch of images with score_status = 'queued' and re-scores
 * them without touching their tags.
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
  // Fail closed: no configured secret means no access (matches foto-lab/index).
  return false
}

async function handle(_request: NextRequest): Promise<NextResponse> {
  const service = createServiceClient()

  // Claim next batch
  const { data: candidates } = await service
    .from('media_files')
    .select('id')
    .eq('score_status', 'queued')
    .eq('file_type', 'image')
    .is('deleted_at', null)
    .order('created_at', { ascending: true })
    .limit(BATCH_SIZE)

  if (!candidates || candidates.length === 0) {
    return NextResponse.json({ processed: 0, remaining: 0 })
  }

  // Optimistic lock: process ONLY rows this invocation actually claimed.
  const { data: claimed } = await service
    .from('media_files')
    .update({ score_status: 'processing' })
    .in('id', candidates.map((r: { id: string }) => r.id))
    .eq('score_status', 'queued')
    .select('id')

  const ids = (claimed ?? []).map((r: { id: string }) => r.id)
  if (ids.length === 0) return NextResponse.json({ processed: 0, remaining: 0 })

  let processed = 0
  await Promise.all(ids.map(async (id: string) => {
    try {
      await scoreMediaFile(id, { skipTags: true })
      await service
        .from('media_files')
        .update({ score_status: 'complete' })
        .eq('id', id)
      processed++
    } catch (err) {
      console.error('[rescore/process] failed:', id, err)
      await service
        .from('media_files')
        .update({ score_status: 'failed' })
        .eq('id', id)
    }
  }))

  // Check remaining
  const { count: remaining } = await service
    .from('media_files')
    .select('id', { count: 'exact', head: true })
    .eq('score_status', 'queued')
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
