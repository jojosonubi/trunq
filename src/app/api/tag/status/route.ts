/**
 * GET /api/tag/status?event_id=xxx
 *
 * Returns counts of images by tagging_status for the given event (or
 * globally if event_id is omitted). Used by the TaggingProgress widget
 * to show live progress without needing Realtime subscriptions.
 */

import { NextRequest, NextResponse } from 'next/server'
import { requireApiUser } from '@/lib/api-auth'
import { createServiceClient } from '@/lib/supabase/service'

export async function GET(request: NextRequest) {
  const auth = await requireApiUser()
  if (auth.response) return auth.response

  const { searchParams } = new URL(request.url)
  const eventId = searchParams.get('event_id')
  const mode    = searchParams.get('mode') // 'rescore' counts by score_status

  const service = createServiceClient()
  const statusCol = mode === 'rescore' ? 'score_status' : 'tagging_status'

  // Per-status HEAD count queries — fetching rows and counting client-side
  // silently truncated at PostgREST's 1000-row cap, making the progress
  // widget wrong on any archive/event above 1000 photos.
  const statuses = ['untagged', 'queued', 'processing', 'complete', 'failed'] as const
  const results = await Promise.all(statuses.map((s) => {
    let q = service
      .from('media_files')
      .select('id', { count: 'exact', head: true })
      .eq('file_type', 'image')
      .is('deleted_at', null)
      .eq(statusCol, s)
    if (eventId) q = q.eq('event_id', eventId)
    return q
  }))

  const firstErr = results.find((r) => r.error)?.error
  if (firstErr) {
    return NextResponse.json({ error: firstErr.message }, { status: 500 })
  }

  const counts = Object.fromEntries(
    statuses.map((s, i) => [s, results[i].count ?? 0])
  ) as Record<(typeof statuses)[number], number>

  return NextResponse.json(counts)
}
