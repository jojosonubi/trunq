/**
 * POST /api/tag/batch
 *
 * Enqueues images for server-side background tagging. Returns immediately
 * with a count of queued images. The actual processing is handled by
 * /api/tag/process, which self-chains until the queue is empty.
 *
 * Body:
 *   { event_id?: string }  — omit for cross-project (all unprocessed images)
 */

import { NextRequest, NextResponse } from 'next/server'
import { waitUntil } from '@vercel/functions'
import { requireApiUser } from '@/lib/api-auth'
import { createServiceClient } from '@/lib/supabase/service'

function getBaseUrl(): string {
  if (process.env.NEXT_PUBLIC_APP_URL) return process.env.NEXT_PUBLIC_APP_URL
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`
  return 'http://localhost:3000'
}

export async function POST(request: NextRequest) {
  const auth = await requireApiUser()
  if (auth.response) return auth.response

  const body = await request.json().catch(() => ({})) as { event_id?: string }
  const service = createServiceClient()

  // Build query for images that still need processing
  let query = service
    .from('media_files')
    .update({ tagging_status: 'queued', score_status: 'queued' })
    .in('tagging_status', ['untagged', 'failed'])
    .eq('file_type', 'image')
    .is('deleted_at', null)
    .select('id')

  if (body.event_id) {
    query = query.eq('event_id', body.event_id)
  }

  const { data, error } = await query

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const queued = data?.length ?? 0

  if (queued === 0) {
    return NextResponse.json({ queued: 0 })
  }

  // Kick off the worker — waitUntil ensures the fetch fires even after we return
  waitUntil(
    fetch(`${getBaseUrl()}/api/tag/process`, {
      method:  'POST',
      headers: {
        'Content-Type':   'application/json',
        'x-task-secret':  process.env.TASK_SECRET ?? '',
      },
    }).catch(() => {})
  )

  return NextResponse.json({ queued })
}
