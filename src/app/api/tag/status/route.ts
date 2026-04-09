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

  const service = createServiceClient()

  let query = service
    .from('media_files')
    .select('tagging_status')
    .eq('file_type', 'image')
    .is('deleted_at', null)

  if (eventId) query = query.eq('event_id', eventId)

  const { data, error } = await query

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const counts = { untagged: 0, queued: 0, processing: 0, complete: 0, failed: 0 }
  for (const row of (data ?? [])) {
    const s = row.tagging_status as keyof typeof counts
    if (s in counts) counts[s]++
  }

  return NextResponse.json(counts)
}
