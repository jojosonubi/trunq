import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { resolvePublicOrgId } from '@/lib/public-api/resolve'
import { signStoragePaths } from '@/lib/supabase/storage'

// Public album-grid browse — events grouped by year, each with a cover, name,
// date, venue, location and approved-photo count. Additive sibling of
// public/photos & public/galleries: it shares their CORS + service-client
// pattern but ONLY ever returns events with is_public = true, and never touches
// anything the stable kiosk routes rely on.

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const YEAR_RE = /^\d{4}$/

// PostgREST count() aggregate is disabled on this project (PGRST123) — same as
// public/galleries. So we paginate through (event_id)-only rows and tally
// client-side. Scoped to the public event set, so we sweep only those events'
// photos, not the whole archive. Volume-proof: no silent truncation.
const MEDIA_PAGE_SIZE = 1000

type EventRow = {
  id: string
  slug: string | null
  name: string
  date: string | null
  venue: string | null
  location: string | null
  thumbnail_storage_path: string | null
}

type EventItem = {
  id: string
  slug: string | null
  name: string
  date: string | null
  venue: string | null
  location: string | null
  photo_count: number
  cover_url: string | null
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS })
}

export async function GET(req: NextRequest) {
  // ── 1. Parse & validate params ──────────────────────────────────────────────
  const { searchParams } = req.nextUrl
  const orgSlug = searchParams.get('org')
  const from    = searchParams.get('from')  || null
  const to      = searchParams.get('to')    || null
  const venue   = searchParams.get('venue') || null
  const year    = searchParams.get('year')  || null

  if (from && !DATE_RE.test(from)) return NextResponse.json({ error: 'Invalid from (expected YYYY-MM-DD)' }, { status: 400, headers: CORS_HEADERS })
  if (to   && !DATE_RE.test(to))   return NextResponse.json({ error: 'Invalid to (expected YYYY-MM-DD)' },   { status: 400, headers: CORS_HEADERS })
  if (year && !YEAR_RE.test(year)) return NextResponse.json({ error: 'Invalid year (expected YYYY)' },       { status: 400, headers: CORS_HEADERS })

  console.log('[public/events] params:', { orgSlug, from, to, venue, year })

  const orgId = await resolvePublicOrgId(orgSlug)
  if (!orgId) return NextResponse.json({ error: 'Unknown org slug' }, { status: 400, headers: CORS_HEADERS })

  const supabase = createServiceClient()

  // ── 2. Public events (is_public + live only), filtered, newest first ────────
  // Uses events_public_date_idx (organisation_id, date DESC) WHERE is_public.
  let q = supabase
    .from('events')
    .select('id, slug, name, date, venue, location, thumbnail_storage_path')
    .eq('organisation_id', orgId)
    .eq('is_public', true)
    .is('deleted_at', null)
    .order('date', { ascending: false })

  if (from)  q = q.gte('date', from)
  if (to)    q = q.lte('date', to)
  if (venue) q = q.eq('venue', venue)
  if (year)  q = q.gte('date', `${year}-01-01`).lte('date', `${year}-12-31`)

  const { data: eventData, error: eventErr } = await q
  if (eventErr) {
    console.log('[public/events] events query error:', eventErr.message)
    return NextResponse.json({ error: 'Failed to load events' }, { status: 500, headers: CORS_HEADERS })
  }
  const events = (eventData ?? []) as EventRow[]
  console.log('[public/events] public events matched:', events.length)

  if (events.length === 0) {
    return NextResponse.json(
      { years: [], venues: [] },
      { headers: { ...CORS_HEADERS, 'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600' } }
    )
  }

  const eventIds = events.map((e) => e.id)

  // ── 3. Per-event approved photo counts (paginated sweep; count() disabled) ──
  const counts = new Map<string, number>()
  let fromRow = 0
  for (;;) {
    const { data, error } = await supabase
      .from('media_files')
      .select('event_id')
      .eq('organisation_id', orgId)
      .eq('review_status', 'approved')
      .is('deleted_at', null)
      .eq('file_type', 'image')
      .in('event_id', eventIds)
      .range(fromRow, fromRow + MEDIA_PAGE_SIZE - 1)

    if (error) {
      console.log('[public/events] count sweep error:', error.message)
      return NextResponse.json({ error: 'Failed to count photos' }, { status: 500, headers: CORS_HEADERS })
    }
    const page = (data ?? []) as { event_id: string | null }[]
    for (const m of page) if (m.event_id) counts.set(m.event_id, (counts.get(m.event_id) ?? 0) + 1)
    if (page.length < MEDIA_PAGE_SIZE) break
    fromRow += MEDIA_PAGE_SIZE
  }

  // ── 4. Cover paths ──────────────────────────────────────────────────────────
  // Prefer the event's explicit cover (thumbnail_storage_path). For events with
  // none, fall back to the newest approved photo's thumbnail — one limit(1)
  // query each, in parallel (coverless events are the minority).
  const coverPathByEvent = new Map<string, string>()
  for (const e of events) if (e.thumbnail_storage_path) coverPathByEvent.set(e.id, e.thumbnail_storage_path)

  const coverless = events.filter((e) => !e.thumbnail_storage_path)
  if (coverless.length > 0) {
    const fallbacks = await Promise.all(
      coverless.map(async (e) => {
        const { data } = await supabase
          .from('media_files')
          .select('thumbnail_url, display_path, storage_path')
          .eq('event_id', e.id)
          .eq('organisation_id', orgId)
          .eq('review_status', 'approved')
          .is('deleted_at', null)
          .eq('file_type', 'image')
          .order('created_at', { ascending: false })
          .limit(1)
        const r = data?.[0] as { thumbnail_url: string | null; display_path: string | null; storage_path: string } | undefined
        const path = r ? (r.thumbnail_url ?? r.display_path ?? r.storage_path) : null
        return [e.id, path] as const
      })
    )
    for (const [id, path] of fallbacks) if (path) coverPathByEvent.set(id, path)
  }

  // Batch-sign every cover path (one or two round trips, no burst).
  const coverPaths = [...new Set([...coverPathByEvent.values()])]
  const signed = await signStoragePaths(coverPaths)
  console.log('[public/events] batch-signed', signed.size, 'of', coverPaths.length, 'cover paths')

  // ── 5. Group by year (desc) + build venue facet ─────────────────────────────
  const byYear = new Map<number, EventItem[]>()
  for (const e of events) {
    const yr = parseInt((e.date ?? '').slice(0, 4), 10)
    if (!Number.isFinite(yr)) continue
    const coverPath = coverPathByEvent.get(e.id)
    const item: EventItem = {
      id: e.id,
      slug: e.slug,
      name: e.name,
      date: e.date,
      venue: e.venue ?? null,
      location: e.location ?? null,
      photo_count: counts.get(e.id) ?? 0,
      cover_url: coverPath ? (signed.get(coverPath) || null) : null,
    }
    if (!byYear.has(yr)) byYear.set(yr, [])
    byYear.get(yr)!.push(item)
  }

  const years = [...byYear.entries()]
    .sort((a, b) => b[0] - a[0])
    .map(([yr, evs]) => ({ year: yr, events: evs }))

  const venues = [...new Set(events.map((e) => e.venue).filter((v): v is string => Boolean(v)))].sort()

  return NextResponse.json(
    { years, venues },
    { headers: { ...CORS_HEADERS, 'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600' } }
  )
}
