import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { resolvePublicOrg, resolvePublicEvent } from '@/lib/public-api/slugs'
import { signStoragePaths } from '@/lib/supabase/storage'

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
}

const DEFAULT_LIMIT = 30
const MAX_LIMIT     = 100
// 500 UUIDs in a single .in() — no chunking needed. PostgREST has no IN-list
// cardinality cap, and 500 UUIDs is ~18.5KB in the URL, well under the ~7000+
// PostgREST request-line limit. Also bounded by Supabase's 1000-row default page.
const MAX_IDS       = 500

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

interface Cursor { createdAt: string; id: string }

function encodeCursor(createdAt: string, id: string): string {
  return Buffer.from(JSON.stringify({ createdAt, id })).toString('base64url')
}

function decodeCursor(raw: string): Cursor | null {
  try {
    const parsed = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8'))
    if (typeof parsed.createdAt === 'string' && typeof parsed.id === 'string') return parsed
    return null
  } catch {
    return null
  }
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS })
}

export async function GET(req: NextRequest) {
  // ── 1. Parse params ────────────────────────────────────────────────────────
  const { searchParams } = req.nextUrl
  const orgSlug      = searchParams.get('org')
  const eventSlug    = searchParams.get('event')
  const dayFilter    = searchParams.get('day')         || null
  const pgFilter     = searchParams.get('photographer') || null
  const q            = searchParams.get('q')           || null
  const cursorRaw    = searchParams.get('cursor')      || null
  const limitRaw     = parseInt(searchParams.get('limit') ?? String(DEFAULT_LIMIT), 10)
  const limit        = Number.isFinite(limitRaw) ? Math.min(Math.max(1, limitRaw), MAX_LIMIT) : DEFAULT_LIMIT
  const minScoreRaw  = searchParams.get('min_score')
  const minScore     = minScoreRaw !== null ? parseInt(minScoreRaw, 10) : null
  const idsRaw       = searchParams.get('ids')        || null
  const eventIdRaw   = searchParams.get('event_id')   || null

  // Optional ids mode: fetch exactly these photos, no pagination
  let ids: string[] | null = null
  if (idsRaw) {
    const parsed = idsRaw.split(',').map((s) => s.trim()).filter(Boolean)
    if (parsed.length > MAX_IDS) {
      return NextResponse.json({ error: `Too many ids (max ${MAX_IDS})` }, { status: 400, headers: CORS_HEADERS })
    }
    if (parsed.some((id) => !UUID_RE.test(id))) {
      return NextResponse.json({ error: 'Invalid id in ids' }, { status: 400, headers: CORS_HEADERS })
    }
    ids = [...new Set(parsed)]
  }

  // Optional event_id: a raw event UUID. Distinct from the event slug param and
  // takes precedence over it when both are passed. Validate format up front.
  if (eventIdRaw && !UUID_RE.test(eventIdRaw)) {
    return NextResponse.json({ error: 'Invalid event_id' }, { status: 400, headers: CORS_HEADERS })
  }

  console.log('[public/photos] params:', { orgSlug, eventSlug, eventIdRaw, dayFilter, pgFilter, q, cursorRaw, limit, ids: ids?.length ?? null })

  // ── 2. Resolve slugs ───────────────────────────────────────────────────────
  const orgId   = resolvePublicOrg(orgSlug)
  // Raw event_id wins over the event slug; fall back to slug resolution otherwise.
  const eventId = eventIdRaw ?? resolvePublicEvent(eventSlug)
  console.log('[public/photos] resolved:', { orgId, eventId })

  if (!orgId) return NextResponse.json({ error: 'Unknown org slug' }, { status: 400, headers: CORS_HEADERS })
  // Event is optional in both browse and ids mode (org-only browse returns the
  // whole archive). Reject only when a slug was supplied but failed to resolve.
  if (!eventId && eventSlug) {
    return NextResponse.json({ error: 'Unknown event slug' }, { status: 400, headers: CORS_HEADERS })
  }

  const supabase = createServiceClient()

  // ── 3. Defensive org/event ownership check (skipped when ids mode has no event) ──
  if (eventId) {
    const { data: eventRow, error: eventErr } = await supabase
      .from('events')
      .select('id, organisation_id')
      .eq('id', eventId)
      .eq('organisation_id', orgId)
      .is('deleted_at', null)
      .single()

    if (eventErr || !eventRow) {
      console.log('[public/photos] event not found or org mismatch', { eventId, orgId })
      return NextResponse.json({ error: 'Event not found' }, { status: 400, headers: CORS_HEADERS })
    }
  }

  // ── 4. Decode cursor (not used in ids mode) ──────────────────────────────
  let cursor: Cursor | null = null
  if (!ids && cursorRaw) {
    cursor = decodeCursor(cursorRaw)
    if (!cursor) {
      return NextResponse.json({ error: 'Invalid cursor' }, { status: 400, headers: CORS_HEADERS })
    }
  }
  console.log('[public/photos] cursor:', cursor)

  // ── 5. Build query ────────────────────────────────────────────────────────
  type PhotoRow = {
    id: string; storage_path: string; display_path: string | null
    thumbnail_url: string | null; folder_id: string | null
    photographer_id: string | null; photographer: string | null
    created_at: string; quality_score: number | null
  }
  const SELECT = 'id, storage_path, display_path, thumbnail_url, folder_id, photographer_id, photographer, created_at, quality_score'
  const baseQuery = () =>
    supabase
      .from('media_files')
      .select(SELECT)
      .eq('organisation_id', orgId)
      .eq('review_status', 'approved')
      .is('deleted_at', null)
      .eq('file_type', 'image')

  let allRows: PhotoRow[] = []
  let rowsErr: { message: string } | null = null

  if (ids) {
    // ids mode: chunk the .in('id', …) SELECT. A single 500-id .in() is a
    // ~18.5KB GET to Supabase and fails; query ~100 ids at a time and
    // concatenate. No order/limit needed — results are reordered to the
    // requested order below, and id is unique so each chunk returns ≤chunk rows.
    const ID_QUERY_CHUNK = 100
    for (let i = 0; i < ids.length; i += ID_QUERY_CHUNK) {
      let q = baseQuery().in('id', ids.slice(i, i + ID_QUERY_CHUNK))
      if (eventId) q = q.eq('event_id', eventId)
      const { data, error } = await q
      if (error) { rowsErr = error; break }
      if (data) allRows.push(...(data as PhotoRow[]))
    }
    console.log('[public/photos] ids mode —', ids.length, 'ids in', Math.ceil(ids.length / ID_QUERY_CHUNK), 'chunk(s), rows:', allRows.length)
  } else {
    // browse mode: single keyset-paginated query (limit+1 to detect next page)
    let query = baseQuery()
      .order(minScore !== null ? 'quality_score' : 'created_at', { ascending: false })
      .order('created_at', { ascending: false })
      .order('id',         { ascending: false })
      .limit(limit + 1)

    if (eventId) query = query.eq('event_id', eventId)
    if (minScore !== null && Number.isFinite(minScore)) query = query.gte('quality_score', minScore)
    if (dayFilter) query = query.eq('folder_id',      dayFilter)
    if (pgFilter)  query = query.eq('photographer_id', pgFilter)

    if (q) {
      // Pre-fetch media_file_ids whose tags match the query term, then OR them with
      // description/filename matches. Cap at 200 unique IDs to keep the in-clause
      // within reasonable URL length bounds (server-to-server call, ~7KB for 200 UUIDs).
      const { data: tagRows } = await supabase
        .from('tags')
        .select('media_file_id')
        .ilike('value', `%${q}%`)
        .limit(500)

      const taggedIds = [...new Set((tagRows ?? []).map((t: { media_file_id: string }) => t.media_file_id))].slice(0, 200)
      console.log('[public/photos] q search term:', q, '| tag ID matches:', taggedIds.length)

      const orParts: string[] = [`description.ilike.%${q}%`, `filename.ilike.%${q}%`]
      if (taggedIds.length > 0) orParts.push(`id.in.(${taggedIds.join(',')})`)
      query = query.or(orParts.join(','))
    }

    if (cursor) {
      query = query.or(
        `created_at.lt.${cursor.createdAt},and(created_at.eq.${cursor.createdAt},id.lt.${cursor.id})`
      )
    }

    const { data, error } = await query
    allRows = (data ?? []) as PhotoRow[]
    rowsErr = error
    console.log('[public/photos] browse mode — rows returned:', allRows.length)
  }

  if (rowsErr) {
    console.log('[public/photos] query error:', rowsErr.message)
    return NextResponse.json({ error: 'Failed to load photos' }, { status: 500, headers: CORS_HEADERS })
  }

  // Determine pagination (ids mode: no pagination, results follow request order)
  const hasMore    = !ids && allRows.length > limit
  let pageRows     = hasMore ? allRows.slice(0, limit) : allRows
  if (ids) {
    const byId = new Map(allRows.map((r) => [r.id, r]))
    pageRows = ids.flatMap((id) => byId.get(id) ?? [])
  }
  const lastRow    = pageRows[pageRows.length - 1]
  const nextCursor = hasMore && lastRow
    ? encodeCursor(lastRow.created_at, lastRow.id)
    : null

  if (pageRows.length === 0) {
    return NextResponse.json({ photos: [], nextCursor: null }, { headers: CORS_HEADERS })
  }

  // ── 6. Sign URLs (batched) ────────────────────────────────────────────────
  // Previously this fired ~N concurrent createSignedUrl calls per size (one per
  // row for the 'full' transform + one per baked thumbnail), so a large share
  // (~500 photos → ~1000 concurrent) hit Supabase's rate limit and some signs
  // came back empty → blank thumbnails non-deterministically.
  //
  // Instead, collect every path and batch-sign with createSignedUrls (≤1000
  // paths/call, chunked internally) — one or two round trips total, no burst.
  // Batch signing can't apply a render transform, so we sign plain object URLs:
  //   full      → display derivative (or original) — display-sized, viewable
  //   thumbnail → pre-baked thumbnail_url when present, else the full path
  // Plain object URLs (no /render/image transform) also avoid the transform quota.
  const fullPathOf  = (r: { storage_path: string; display_path: string | null }) =>
    r.display_path ?? r.storage_path
  const thumbPathOf = (r: { storage_path: string; display_path: string | null; thumbnail_url: string | null }) =>
    r.thumbnail_url ?? r.display_path ?? r.storage_path

  const allPaths = [...new Set(pageRows.flatMap((r) => [fullPathOf(r), thumbPathOf(r)]))]
  const signed   = await signStoragePaths(allPaths)
  console.log('[public/photos] batch-signed', signed.size, 'of', allPaths.length, 'paths for', pageRows.length, 'photos')

  // First non-empty signed URL, else null. Treats '' (a failed sign) as failure
  // so the client is never handed an empty src (which forces a full page reload).
  const firstUrl = (...vals: (string | undefined)[]): string | null => {
    for (const v of vals) if (v) return v
    return null
  }

  // ── 7. Resolve folder names (batch) ───────────────────────────────────────
  const folderIds = [...new Set(pageRows.map((r) => r.folder_id).filter(Boolean))] as string[]
  let folderNameMap = new Map<string, string>()

  if (folderIds.length > 0) {
    const { data: folderRows } = await supabase
      .from('folders')
      .select('id, name')
      .in('id', folderIds)
    for (const f of (folderRows ?? [])) folderNameMap.set(f.id, f.name)
  }

  // ── 8. Resolve photographer names (batch) ─────────────────────────────────
  const photographerIds = [...new Set(pageRows.map((r) => r.photographer_id).filter(Boolean))] as string[]
  let photographerNameMap   = new Map<string, string>()
  let photographerHandleMap = new Map<string, string | null>()

  if (photographerIds.length > 0) {
    const { data: pgRows } = await supabase
      .from('photographers')
      .select('id, name, instagram_handle')
      .in('id', photographerIds)
    for (const p of (pgRows ?? [])) photographerNameMap.set(p.id, p.name)
    for (const p of (pgRows ?? [])) photographerHandleMap.set(p.id, p.instagram_handle ?? null)
  }

  // ── 9. Shape response ─────────────────────────────────────────────────────
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
  }))

  return NextResponse.json({ photos, nextCursor }, { headers: CORS_HEADERS })
}
