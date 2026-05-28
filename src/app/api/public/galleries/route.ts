import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { resolvePublicOrg, resolvePublicEvent } from '@/lib/public-api/slugs'

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
}

// PostgREST aggregate functions (count()) are NOT enabled on this project (PGRST123).
// Instead we paginate through approved media rows (folder_id + photographer_id only —
// tiny rows, ~72 bytes each) and count client-side. This is volume-proof: for 2 066
// rows it takes 3 × 1 000-row pages; for 10 000 rows, 10 pages.
const MEDIA_PAGE_SIZE = 1000

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

  // ── 3. Folders ────────────────────────────────────────────────────────────
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

  // ── 4. Paginate through ALL approved media to collect folder + photographer counts ──
  // Fetches only (folder_id, photographer_id) — no large columns — so pages are fast.
  // Volume-proof: no silent truncation regardless of how many photos any one
  // photographer uploads.
  type MediaRow = { folder_id: string | null; photographer_id: string | null }
  const allMedia: MediaRow[] = []
  let from = 0

  for (;;) {
    const { data, error } = await supabase
      .from('media_files')
      .select('folder_id, photographer_id')
      .eq('event_id', eventId)
      .eq('organisation_id', orgId)
      .eq('review_status', 'approved')
      .is('deleted_at', null)
      .range(from, from + MEDIA_PAGE_SIZE - 1)

    if (error) {
      console.log('[public/galleries] media page error:', error.message)
      return NextResponse.json({ error: 'Failed to load media' }, { status: 500, headers: CORS_HEADERS })
    }

    const page = data ?? []
    allMedia.push(...page)
    if (page.length < MEDIA_PAGE_SIZE) break   // last page
    from += MEDIA_PAGE_SIZE
  }

  console.log('[public/galleries] total approved media rows fetched:', allMedia.length)

  // ── 5. Count per folder + per photographer (client-side, exact) ───────────
  const folderCounts      = new Map<string, number>()
  const photographerCounts = new Map<string, number>()

  for (const m of allMedia) {
    if (m.folder_id)       folderCounts.set(m.folder_id,       (folderCounts.get(m.folder_id)       ?? 0) + 1)
    if (m.photographer_id) photographerCounts.set(m.photographer_id, (photographerCounts.get(m.photographer_id) ?? 0) + 1)
  }

  // ── 6. Build day facets ───────────────────────────────────────────────────
  const days = folders.map((f) => ({
    value: f.id,
    label: f.name,
    count: folderCounts.get(f.id) ?? 0,
  }))

  // ── 7. Fetch photographer names for distinct IDs ──────────────────────────
  const photographerIds = [...photographerCounts.keys()]
  const photographerNameMap = new Map<string, string>()

  if (photographerIds.length > 0) {
    const { data: pgRows, error: pgErr } = await supabase
      .from('photographers')
      .select('id, name')
      .in('id', photographerIds)

    if (pgErr) {
      console.log('[public/galleries] photographer names error:', pgErr.message)
      return NextResponse.json({ error: 'Failed to load photographers' }, { status: 500, headers: CORS_HEADERS })
    }
    for (const p of (pgRows ?? [])) photographerNameMap.set(p.id, p.name)
  }

  // ── 8. Build photographer facets ─────────────────────────────────────────
  const photographers = photographerIds
    .map((id) => ({
      value: id,
      label: photographerNameMap.get(id) ?? 'Unknown',
      count: photographerCounts.get(id) ?? 0,
    }))
    .sort((a, b) => b.count - a.count)

  console.log('[public/galleries] photographer facets:', photographers.length,
    '| total approved:', allMedia.length)

  // ── 9. Respond ────────────────────────────────────────────────────────────
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
