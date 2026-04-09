/**
 * POST /api/rescore/process  (internal — protected by x-task-secret)
 *
 * Claims the next batch of images with score_status = 'queued' and re-scores
 * them without touching their tags. Self-chains until the queue is empty.
 */

import { NextRequest, NextResponse } from 'next/server'
import { waitUntil } from '@vercel/functions'
import { createServiceClient } from '@/lib/supabase/service'
import { scoreMediaFile } from '@/lib/scoring'

const BATCH_SIZE = 3

function getBaseUrl(): string {
  if (process.env.NEXT_PUBLIC_APP_URL) return process.env.NEXT_PUBLIC_APP_URL
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`
  return 'http://localhost:3000'
}

export async function POST(request: NextRequest) {
  const secret   = process.env.TASK_SECRET
  const provided = request.headers.get('x-task-secret')
  if (secret && provided !== secret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

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

  const ids = candidates.map((r: { id: string }) => r.id)

  // Mark as processing (optimistic lock on score_status)
  await service
    .from('media_files')
    .update({ score_status: 'processing' })
    .in('id', ids)
    .eq('score_status', 'queued')

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

  // Check remaining and self-chain
  const { count: remaining } = await service
    .from('media_files')
    .select('id', { count: 'exact', head: true })
    .eq('score_status', 'queued')
    .eq('file_type', 'image')
    .is('deleted_at', null)

  if ((remaining ?? 0) > 0) {
    waitUntil(
      fetch(`${getBaseUrl()}/api/rescore/process`, {
        method:  'POST',
        headers: {
          'Content-Type':  'application/json',
          'x-task-secret': process.env.TASK_SECRET ?? '',
        },
      }).catch(() => {})
    )
  }

  return NextResponse.json({ processed, remaining: remaining ?? 0 })
}
