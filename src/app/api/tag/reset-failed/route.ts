/**
 * POST /api/tag/reset-failed?event_id=<uuid>&also_processing=1
 *
 * Resets tagging_status back to 'untagged' so rows can be re-submitted.
 * Resets 'failed' by default; add ?also_processing=1 to also reset rows
 * stuck in 'processing' (e.g. after a batch expired without being polled).
 *
 * Never touches score_status.
 * Auth: owner role only.
 */

import { NextRequest, NextResponse } from 'next/server'
import { requireApiUserWithOrg } from '@/lib/api-auth'
import { createServiceClient } from '@/lib/supabase/service'

export async function POST(req: NextRequest) {
  const auth = await requireApiUserWithOrg()
  if (auth.response) return auth.response
  if (auth.organisationRole !== 'owner') {
    return NextResponse.json({ error: 'Owner role required' }, { status: 403 })
  }

  const eventId        = req.nextUrl.searchParams.get('event_id')    ?? null
  const alsoProcessing = req.nextUrl.searchParams.get('also_processing') === '1'

  const statuses = alsoProcessing ? ['failed', 'processing'] : ['failed']

  const supabase = createServiceClient()

  let q = supabase
    .from('media_files')
    .update({ tagging_status: 'untagged' })
    .in('tagging_status', statuses)
    .eq('file_type', 'image')
    .is('deleted_at', null)
    .eq('organisation_id', auth.organisationId)
    .select('id')

  if (eventId) q = q.eq('event_id', eventId)

  const { data, error } = await q

  if (error) {
    console.error('[tag/reset-failed] error:', error.message)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const reset = data?.length ?? 0
  console.log(`[tag/reset-failed] reset ${reset} rows (statuses: ${statuses.join(', ')})${eventId ? ` event=${eventId}` : ''}`)

  return NextResponse.json({ reset })
}
