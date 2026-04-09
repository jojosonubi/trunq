/**
 * POST /api/rescore/batch
 *
 * Resets score_status to 'queued' for every image in the archive, then
 * fires the rescore worker. Tags are preserved — only scores are recomputed.
 * Returns { queued: N } immediately; processing runs server-side.
 */

import { NextResponse } from 'next/server'
import { waitUntil } from '@vercel/functions'
import { requireApiUser } from '@/lib/api-auth'
import { createServiceClient } from '@/lib/supabase/service'

function getBaseUrl(): string {
  if (process.env.NEXT_PUBLIC_APP_URL) return process.env.NEXT_PUBLIC_APP_URL
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`
  return 'http://localhost:3000'
}

export async function POST() {
  const auth = await requireApiUser()
  if (auth.response) return auth.response

  const service = createServiceClient()

  // Mark every non-deleted image as score-queued (leave tagging_status alone)
  const { data, error } = await service
    .from('media_files')
    .update({ score_status: 'queued' })
    .eq('file_type', 'image')
    .is('deleted_at', null)
    .select('id')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const queued = data?.length ?? 0
  if (queued === 0) return NextResponse.json({ queued: 0 })

  waitUntil(
    fetch(`${getBaseUrl()}/api/rescore/process`, {
      method:  'POST',
      headers: {
        'Content-Type':  'application/json',
        'x-task-secret': process.env.TASK_SECRET ?? '',
      },
    }).catch(() => {})
  )

  return NextResponse.json({ queued })
}
