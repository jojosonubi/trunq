import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { requireApiUserWithOrg } from '@/lib/api-auth'

/**
 * PATCH /api/media/reassign — bulk-reassign media_files' photographer and/or event.
 *
 * Body: { ids: string[], photographer_id?: string, event_id?: string }
 * - photographer_id → sets photographer_id + photographer (name), org-verified.
 * - event_id → moves the photos to another event; clears folder_id (folders are
 *   event-scoped). Org-verified.
 */
export async function PATCH(req: NextRequest) {
  const auth = await requireApiUserWithOrg()
  if (auth.response) return auth.response

  const body = await req.json() as {
    ids?: string[]
    photographer_id?: string
    event_id?: string
  }

  const ids = body.ids
  if (!Array.isArray(ids) || ids.length === 0 || ids.length > 500) {
    return NextResponse.json({ error: 'ids required (1–500)' }, { status: 400 })
  }

  const supabase = createServiceClient()
  const update: Record<string, unknown> = {}

  if (body.photographer_id) {
    const { data: p } = await supabase
      .from('photographers')
      .select('id, name')
      .eq('id', body.photographer_id)
      .eq('organisation_id', auth.organisationId)
      .maybeSingle()
    if (!p) return NextResponse.json({ error: 'Photographer not found' }, { status: 404 })
    update.photographer_id = p.id
    update.photographer     = p.name
  }

  if (body.event_id) {
    const { data: ev } = await supabase
      .from('events')
      .select('id')
      .eq('id', body.event_id)
      .eq('organisation_id', auth.organisationId)
      .is('deleted_at', null)
      .maybeSingle()
    if (!ev) return NextResponse.json({ error: 'Event not found' }, { status: 404 })
    update.event_id  = ev.id
    update.folder_id = null // folders belong to the old event
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: 'nothing to update' }, { status: 400 })
  }

  const { error } = await supabase
    .from('media_files')
    .update(update)
    .in('id', ids)
    .eq('organisation_id', auth.organisationId) // never mutate foreign-org media
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true, updated: ids.length })
}
