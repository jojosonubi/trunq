import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { resolvePublicOrgId, resolvePublicEventId } from '@/lib/public-api/resolve'
import { signStoragePaths } from '@/lib/supabase/storage'

// Public archive photo browse with COLOUR + date/venue filters. Additive sibling
// of public/photos — never edits it. Returns the SAME photo shape public/photos
// returns, so the existing grid + PhotoModal consume it unchanged. Only ever
// surfaces photos from is_public=true live events.

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
}

const DEFAULT_LIMIT = 30
const MAX_LIMIT     = 100
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// Canonical 12-colour palette (migration 016 — the dominant_colours values).
const PALETTE = new Set(['red','orange','yellow','green','teal','blue','purple','pink','white','black','grey','brown'])

interface Cursor { createdAt: string; id: string }
function encodeCursor(createdAt: string, id: string): string {
  return Buffer.from(JSON.stringify({ createdAt, id })).toString('base64url')
}
function decodeCursor(raw: string): Cursor | null {
  try {
    const parsed = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8'))
    if (typeof parsed.createdAt === 'string' && typeof parsed.id === 'string') return parsed
    return null
  } catch { return null }
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS })
}

export async function GET(req: NextRequest) {
  // ── 1. Parse & validate params ──────────────────────────────────────────────
  const { searchParams } = req.nextUrl
  const orgSlug   = searchParams.get('org')
  const eventSlug = searchParams.get('event')      || null
  const from      = searchParams.get('from')       || null
  const to        = searchParams.get('to')         || null
  const venue     = searchParams.get('venue')      || null
  const cursorRaw = searchParams.get('cursor')     || null
  const matchAll  = searchParams.get('colour_match') === 'all'   // default: any-of (&&)
  const limitRaw  = parseInt(searchParams.get('limit') ?? String(DEFAULT_LIMIT), 10)
  const limit     = Number.isFinite(limitRaw) ? Math.min(Math.max(1, limitRaw), MAX_LIMIT) : DEFAULT_LIMIT

  const colours = (searchParams.get('colour') || '')
    .split(',').map((c) => c.trim().toLowerCase()).filter(Boolean)
  const badColour = colours.find((c) => !PALETTE.has(c))
  if (badColour) {
    return NextResponse.json({ error: `Invalid colour "${badColour}" (allowed: ${[...PALETTE].join(', ')})` }, { status: 400, headers: CORS_HEADERS })
  }
  if (from && !DATE_RE.test(from)) return NextResponse.json({ error: 'Invalid from (YYYY-MM-DD)' }, { status: 400, headers: CORS_HEADERS })
  if (to   && !DATE_RE.test(to))   return NextResponse.json({ error: 'Invalid to (YYYY-MM-DD)' },   { status: 400, headers: CORS_HEADERS })

  console.log('[public/archive-photos] params:', { orgSlug, eventSlug, colours, matchAll, from, to, venue, limit })

  const orgId = await resolvePublicOrgId(orgSlug)
  if (!orgId) return NextResponse.json({ error: 'Unknown org slug' }, { status: 400, headers: CORS_HEADERS })

  const supabase = createServiceClient()

  // ── 2. Resolve the public event set (is_public + live) the photos may come from ──
  // A single event slug narrows to that one event (still must be public); else the
  // whole public archive for the org, optionally filtered by venue/date range.
  let eventQuery = supabase
    .from('events')
    .select('id')
    .eq('organisation_id', orgId)
    .eq('is_public', true)
    .is('deleted_at', null)

  if (eventSlug) {
    const evId = await resolvePublicEventId(orgId, eventSlug)
    if (!evId) return NextResponse.json({ error: 'Unknown event slug' }, { status: 400, headers: CORS_HEADERS })
    eventQuery = eventQuery.eq('id', evId)
  }
  if (venue) eventQuery = eventQuery.eq('venue', venue)
  if (from)  eventQuery = eventQuery.gte('date', from)
  if (to)    eventQuery = eventQuery.lte('date', to)

  const { data: evRows, error: evErr } = await eventQuery
  if (evErr) {
    console.log('[public/archive-photos] events error:', evErr.message)
    return NextResponse.json({ error: 'Failed to resolve events' }, { status: 500, headers: CORS_HEADERS })
  }
  const publicEventIds = (evRows ?? []).map((e) => e.id as string)
  if (publicEventIds.length === 0) {
    return NextResponse.json({ photos: [], nextCursor: null }, { headers: CORS_HEADERS })
  }

  // ── 3. Decode cursor ──────────────────────────────────────────────────────
  let cursor: Cursor | null = null
  if (cursorRaw) {
    cursor = decodeCursor(cursorRaw)
    if (!cursor) return NextResponse.json({ error: 'Invalid cursor' }, { status: 400, headers: CORS_HEADERS })
  }

  // ── 4. Query photos — colour-filtered, keyset-paginated ─────────────────────
  type PhotoRow = {
    id: string; storage_path: string; display_path: string | null
    thumbnail_url: string | null; folder_id: string | null
    photographer_id: string | null; photographer: string | null
    created_at: string; quality_score: number | null; event_id: string | null
  }
  const SELECT = 'id, storage_path, display_path, thumbnail_url, folder_id, photographer_id, photographer, created_at, quality_score, event_id'

  let query = supabase
    .from('media_files')
    .select(SELECT)
    .eq('organisation_id', orgId)
    .eq('review_status', 'approved')
    .is('deleted_at', null)
    .eq('file_type', 'image')
    .in('event_id', publicEventIds)
    .order('created_at', { ascending: false })
    .order('id',         { ascending: false })
    .limit(limit + 1)

  if (colours.length > 0) {
    // dominant_colours is TEXT[] with a GIN index (migration 016).
    // all-of → @> (contains); any-of → && (overlaps).
    query = matchAll ? query.contains('dominant_colours', colours) : query.overlaps('dominant_colours', colours)
  }
  if (cursor) {
    query = query.or(`created_at.lt.${cursor.createdAt},and(created_at.eq.${cursor.createdAt},id.lt.${cursor.id})`)
  }

  const { data, error } = await query
  if (error) {
    console.log('[public/archive-photos] photos error:', error.message)
    return NextResponse.json({ error: 'Failed to load photos' }, { status: 500, headers: CORS_HEADERS })
  }
  const allRows = (data ?? []) as PhotoRow[]
  const hasMore = allRows.length > limit
  const pageRows = hasMore ? allRows.slice(0, limit) : allRows
  const lastRow  = pageRows[pageRows.length - 1]
  const nextCursor = hasMore && lastRow ? encodeCursor(lastRow.created_at, lastRow.id) : null

  if (pageRows.length === 0) {
    return NextResponse.json({ photos: [], nextCursor: null }, { headers: CORS_HEADERS })
  }

  // ── 5. Sign URLs (batched) — same scheme as public/photos ───────────────────
  const fullPathOf  = (r: PhotoRow) => r.display_path ?? r.storage_path
  const thumbPathOf = (r: PhotoRow) => r.thumbnail_url ?? r.display_path ?? r.storage_path
  const allPaths = [...new Set(pageRows.flatMap((r) => [fullPathOf(r), thumbPathOf(r)]))]
  const signed   = await signStoragePaths(allPaths)
  const firstUrl = (...vals: (string | undefined)[]): string | null => {
    for (const v of vals) if (v) return v
    return null
  }

  // ── 6. Resolve folder + photographer names, event date/name (batched) ───────
  const folderIds = [...new Set(pageRows.map((r) => r.folder_id).filter(Boolean))] as string[]
  const folderNameMap = new Map<string, string>()
  if (folderIds.length > 0) {
    const { data: f } = await supabase.from('folders').select('id, name').in('id', folderIds)
    for (const row of (f ?? [])) folderNameMap.set(row.id, row.name)
  }

  const photographerIds = [...new Set(pageRows.map((r) => r.photographer_id).filter(Boolean))] as string[]
  const photographerNameMap   = new Map<string, string>()
  const photographerHandleMap = new Map<string, string | null>()
  if (photographerIds.length > 0) {
    const { data: pg } = await supabase.from('photographers').select('id, name, instagram_handle').in('id', photographerIds)
    for (const p of (pg ?? [])) { photographerNameMap.set(p.id, p.name); photographerHandleMap.set(p.id, p.instagram_handle ?? null) }
  }

  const eventIds = [...new Set(pageRows.map((r) => r.event_id).filter(Boolean))] as string[]
  const eventDateMap = new Map<string, string | null>()
  const eventNameMap = new Map<string, string | null>()
  if (eventIds.length > 0) {
    const { data: ev } = await supabase.from('events').select('id, date, name').in('id', eventIds)
    for (const e of (ev ?? [])) { eventDateMap.set(e.id, e.date ?? null); eventNameMap.set(e.id, e.name ?? null) }
  }

  // ── 7. Shape response — identical to public/photos ──────────────────────────
  const photos = pageRows.map((row) => ({
    id:           row.id,
    url:          firstUrl(signed.get(fullPathOf(row))),
    thumbnailUrl: firstUrl(signed.get(thumbPathOf(row)), signed.get(fullPathOf(row))),
    day:          (row.folder_id ? folderNameMap.get(row.folder_id) : null) ?? null,
    photographer: row.photographer_id
      ? { id: row.photographer_id, name: photographerNameMap.get(row.photographer_id) ?? 'Unknown', instagramHandle: photographerHandleMap.get(row.photographer_id) ?? null }
      : { id: null,                name: row.photographer ?? 'Unknown',                              instagramHandle: null },
    createdAt:    row.created_at,
    qualityScore: row.quality_score ?? null,
    event_name:   row.event_id ? eventNameMap.get(row.event_id) ?? null : null,
    event_date:   row.event_id ? eventDateMap.get(row.event_id) ?? null : null,
  }))

  return NextResponse.json({ photos, nextCursor }, { headers: CORS_HEADERS })
}
