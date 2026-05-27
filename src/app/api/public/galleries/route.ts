import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { resolvePublicOrg, resolvePublicEvent } from '@/lib/public-api/slugs'

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS })
}

export async function GET(req: NextRequest) {
  // ── 1. Parse & resolve slugs ───────────────────────────────────────────────
  const { searchParams } = req.nextUrl
  const orgSlug   = searchParams.get('org')
  const eventSlug = searchParams.get('event')
  console.log('[public/galleries] params:', { orgSlug, eventSlug })

  const orgId   = resolvePublicOrg(orgSlug)
  const eventId = resolvePublicEvent(eventSlug)
  console.log('[public/galleries] resolved:', { orgId, eventId })

  if (!orgId)   return NextResponse.json({ error: 'Unknown org slug' },   { status: 400, headers: CORS_HEADERS })
  if (!eventId) return NextResponse.json({ error: 'Unknown event slug' }, { status: 400, headers: CORS_HEADERS })

  const supabase = createServiceClient()

  // ── 2. Defensive org/event ownership check ────────────────────────────────
  const { data: eventRow, error: eventErr } = await supabase
    .from('events')
    .select('id, name, date, organisation_id')
    .eq('id', eventId)
    .eq('organisation_id', orgId)
    .is('deleted_at', null)
    .single()

  if (eventErr || !eventRow) {
    console.log('[public/galleries] event not found or org mismatch', { eventId, orgId, eventErr })
    return NextResponse.json({ error: 'Event not found' }, { status: 400, headers: CORS_HEADERS })
  }
  console.log('[public/galleries] event confirmed:', eventRow.name)

  // ── 3. Fetch folders (days) ────────────────────────────────────────────────
  const { data: folderRows, error: folderErr } = await supabase
    .from('folders')
    .select('id, name')
    .eq('event_id', eventId)
    .order('name', { ascending: true })

  if (folderErr) {
    console.log('[public/galleries] folders error:', folderErr.message)
    return NextResponse.json({ error: 'Failed to load days' }, { status: 500, headers: CORS_HEADERS })
  }
  const folders = folderRows ?? []
  console.log('[public/galleries] folders:', folders.length)

  // ── 4. Approved media counts per folder ───────────────────────────────────
  // Supabase doesn't support GROUP BY natively, so pull folder_id of all approved media
  // then count client-side. Max rows = approved media per event (typically < 10k).
  const { data: mediaRows, error: mediaErr } = await supabase
    .from('media_files')
    .select('id, folder_id, photographer_id, photographer')
    .eq('event_id', eventId)
    .eq('organisation_id', orgId)
    .eq('review_status', 'approved')
    .is('deleted_at', null)

  if (mediaErr) {
    console.log('[public/galleries] media error:', mediaErr.message)
    return NextResponse.json({ error: 'Failed to load media' }, { status: 500, headers: CORS_HEADERS })
  }
  const media = mediaRows ?? []
  console.log('[public/galleries] approved media rows:', media.length)

  // Count per folder
  const folderCounts = new Map<string, number>()
  for (const m of media) {
    if (m.folder_id) folderCounts.set(m.folder_id, (folderCounts.get(m.folder_id) ?? 0) + 1)
  }

  const days = folders.map((f) => ({
    value: f.id,
    label: f.name,
    count: folderCounts.get(f.id) ?? 0,
  }))

  // ── 5. Photographer facets ─────────────────────────────────────────────────
  // Gather distinct photographer_ids that have approved media in this event
  const photographerCounts = new Map<string, number>()
  const nullPhotographerNames = new Map<string, string>() // fallback text name for null-id rows

  for (const m of media) {
    if (m.photographer_id) {
      photographerCounts.set(m.photographer_id, (photographerCounts.get(m.photographer_id) ?? 0) + 1)
    }
    // null photographer_id rows are not included in the facet (no stable id to filter by)
  }

  // Fetch names for all distinct photographer_ids
  const photographerIds = [...photographerCounts.keys()]
  let photographerNameMap = new Map<string, string>()

  if (photographerIds.length > 0) {
    const { data: pgRows, error: pgErr } = await supabase
      .from('photographers')
      .select('id, name')
      .in('id', photographerIds)

    if (pgErr) {
      console.log('[public/galleries] photographers error:', pgErr.message)
      return NextResponse.json({ error: 'Failed to load photographers' }, { status: 500, headers: CORS_HEADERS })
    }
    for (const p of (pgRows ?? [])) photographerNameMap.set(p.id, p.name)
  }

  const photographers = photographerIds
    .map((id) => ({
      value: id,
      label: photographerNameMap.get(id) ?? 'Unknown',
      count: photographerCounts.get(id) ?? 0,
    }))
    .sort((a, b) => b.count - a.count)

  console.log('[public/galleries] photographer facets:', photographers.length)

  // ── 6. Respond ────────────────────────────────────────────────────────────
  return NextResponse.json(
    {
      event: {
        id:   eventRow.id,
        name: eventRow.name,
        date: eventRow.date ?? null,
      },
      days,
      photographers,
    },
    { headers: CORS_HEADERS }
  )
}
