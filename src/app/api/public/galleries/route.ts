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

  // ── 3. Folders + aggregate counts (parallel) ──────────────────────────────
  // AGGREGATE QUERIES — volume-proof; return one row per distinct group
  // regardless of total photo count. count() uses PostgREST v12 aggregate syntax.
  const [foldersRes, folderAggRes, pgAggRes] = await Promise.all([
    // 3a. Folder list (names)
    supabase
      .from('folders')
      .select('id, name')
      .eq('event_id', eventId)
      .order('name', { ascending: true }),

    // 3b. Approved photo count per folder_id (aggregate — never capped by row limit)
    supabase
      .from('media_files')
      .select('folder_id, count()')
      .eq('event_id', eventId)
      .eq('organisation_id', orgId)
      .eq('review_status', 'approved')
      .is('deleted_at', null),

    // 3c. Approved photo count per photographer_id (aggregate — volume-proof)
    supabase
      .from('media_files')
      .select('photographer_id, count()')
      .eq('event_id', eventId)
      .eq('organisation_id', orgId)
      .eq('review_status', 'approved')
      .is('deleted_at', null)
      .not('photographer_id', 'is', null),
  ])

  if (foldersRes.error) {
    console.log('[public/galleries] folders error:', foldersRes.error.message)
    return NextResponse.json({ error: 'Failed to load days' }, { status: 500, headers: CORS_HEADERS })
  }
  if (folderAggRes.error) {
    console.log('[public/galleries] folder agg error:', folderAggRes.error.message)
    return NextResponse.json({ error: 'Failed to load day counts' }, { status: 500, headers: CORS_HEADERS })
  }
  if (pgAggRes.error) {
    console.log('[public/galleries] photographer agg error:', pgAggRes.error.message)
    return NextResponse.json({ error: 'Failed to load photographer counts' }, { status: 500, headers: CORS_HEADERS })
  }

  const folders = foldersRes.data ?? []

  // PostgREST aggregate rows: { folder_id, count } / { photographer_id, count }
  // count() returns a number; cast explicitly.
  type FolderAggRow = { folder_id: string | null; count: number }
  type PgAggRow     = { photographer_id: string;  count: number }

  const folderAgg = (folderAggRes.data ?? []) as FolderAggRow[]
  const pgAgg     = (pgAggRes.data     ?? []) as PgAggRow[]

  console.log('[public/galleries] folder agg rows:', folderAgg.length, '| pg agg rows:', pgAgg.length)

  // ── 4. Build day facets from aggregate ────────────────────────────────────
  const folderCountMap = new Map<string, number>()
  for (const row of folderAgg) {
    if (row.folder_id) folderCountMap.set(row.folder_id, Number(row.count))
  }

  const days = folders.map((f) => ({
    value: f.id,
    label: f.name,
    count: folderCountMap.get(f.id) ?? 0,
  }))

  // ── 5. Fetch photographer names for distinct IDs ───────────────────────────
  const photographerIds = pgAgg.map((r) => r.photographer_id)
  let photographerNameMap = new Map<string, string>()

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

  // ── 6. Build photographer facets from aggregate ───────────────────────────
  const photographers = pgAgg
    .map((row) => ({
      value: row.photographer_id,
      label: photographerNameMap.get(row.photographer_id) ?? 'Unknown',
      count: Number(row.count),
    }))
    .sort((a, b) => b.count - a.count)

  console.log('[public/galleries] photographer facets:', photographers.length,
    '| total approved:', photographers.reduce((s, p) => s + p.count, 0))

  // ── 7. Respond ────────────────────────────────────────────────────────────
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
