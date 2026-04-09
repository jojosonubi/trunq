/**
 * POST /api/tag/process  (internal — do not call from client directly)
 *
 * Claims the next batch of queued images, processes them, then self-chains
 * until the queue is empty. Each invocation handles BATCH_SIZE images so
 * individual function timeouts are never a concern.
 *
 * Protected by x-task-secret header.
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
  // Internal auth — reject anything without the task secret
  const secret = process.env.TASK_SECRET
  if (secret) {
    const provided = request.headers.get('x-task-secret')
    if (provided !== secret) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
  }

  const service = createServiceClient()

  // ── Claim next batch atomically ───────────────────────────────────────────
  // Select candidates first, then update only rows still in 'queued' state.
  // The WHERE on update prevents double-claiming if two invocations race.
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

  if ((remaining ?? 0) > 0) {
    // Self-chain: trigger next batch as a completely independent invocation
    waitUntil(
      fetch(`${getBaseUrl()}/api/tag/process`, {
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
