import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { resolvePublicOrg, resolvePublicEvent } from '@/lib/public-api/slugs'
import { signStoragePathsSized } from '@/lib/supabase/storage'

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
}

const DEFAULT_LIMIT = 30
const MAX_LIMIT     = 100

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

  console.log('[public/photos] params:', { orgSlug, eventSlug, dayFilter, pgFilter, q, cursorRaw, limit })

  // ── 2. Resolve slugs ───────────────────────────────────────────────────────
  const orgId   = resolvePublicOrg(orgSlug)
  const eventId = resolvePublicEvent(eventSlug)
  console.log('[public/photos] resolved:', { orgId, eventId })

  if (!orgId)   return NextResponse.json({ error: 'Unknown org slug' },   { status: 400, headers: CORS_HEADERS })
  if (!eventId) return NextResponse.json({ error: 'Unknown event slug' }, { status: 400, headers: CORS_HEADERS })

  const supabase = createServiceClient()

  // ── 3. Defensive org/event ownership check ────────────────────────────────
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

  // ── 4. Decode cursor ───────────────────────────────────────────────────────
  let cursor: Cursor | null = null
  if (cursorRaw) {
    cursor = decodeCursor(cursorRaw)
    if (!cursor) {
      return NextResponse.json({ error: 'Invalid cursor' }, { status: 400, headers: CORS_HEADERS })
    }
  }
  console.log('[public/photos] cursor:', cursor)

  // ── 5. Build query ────────────────────────────────────────────────────────
  // Fetch limit+1 to detect whether there is a next page
  let query = supabase
    .from('media_files')
    .select('id, storage_path, folder_id, photographer_id, photographer, created_at')
    .eq('event_id', eventId)
    .eq('organisation_id', orgId)
    .eq('review_status', 'approved')
    .is('deleted_at', null)
    .eq('file_type', 'image')
    .order('created_at', { ascending: false })
    .order('id',         { ascending: false })
    .limit(limit + 1)

  if (dayFilter)    query = query.eq('folder_id',      dayFilter)
  if (pgFilter)     query = query.eq('photographer_id', pgFilter)

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

  // Keyset pagination: (created_at, id) < (cursor.createdAt, cursor.id)
  if (cursor) {
    query = query.or(
      `created_at.lt.${cursor.createdAt},and(created_at.eq.${cursor.createdAt},id.lt.${cursor.id})`
    )
  }

  console.log('[public/photos] query built — executing...')
  const { data: rows, error: rowsErr } = await query

  if (rowsErr) {
    console.log('[public/photos] query error:', rowsErr.message)
    return NextResponse.json({ error: 'Failed to load photos' }, { status: 500, headers: CORS_HEADERS })
  }

  const allRows = rows ?? []
  console.log('[public/photos] rows returned:', allRows.length)

  // Determine pagination
  const hasMore    = allRows.length > limit
  const pageRows   = hasMore ? allRows.slice(0, limit) : allRows
  const lastRow    = pageRows[pageRows.length - 1]
  const nextCursor = hasMore && lastRow
    ? encodeCursor(lastRow.created_at, lastRow.id)
    : null

  if (pageRows.length === 0) {
    return NextResponse.json({ photos: [], nextCursor: null }, { headers: CORS_HEADERS })
  }

  // ── 6. Sign URLs (batch, two sizes in parallel) ───────────────────────────
  const storagePaths = pageRows.map((r) => r.storage_path).filter(Boolean) as string[]

  const [fullMap, cardMap] = await Promise.all([
    signStoragePathsSized(storagePaths, 'full',  { aspect: 'preserve' }),
    signStoragePathsSized(storagePaths, 'card',  { aspect: 'preserve' }),
  ])
  console.log('[public/photos] signed URLs — full:', fullMap.size, 'card:', cardMap.size)

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
  let photographerNameMap = new Map<string, string>()

  if (photographerIds.length > 0) {
    const { data: pgRows } = await supabase
      .from('photographers')
      .select('id, name')
      .in('id', photographerIds)
    for (const p of (pgRows ?? [])) photographerNameMap.set(p.id, p.name)
  }

  // ── 9. Shape response ─────────────────────────────────────────────────────
  const photos = pageRows.map((row) => ({
    id:           row.id,
    url:          fullMap.get(row.storage_path) ?? '',
    thumbnailUrl: cardMap.get(row.storage_path) ?? '',
    day:          (row.folder_id ? folderNameMap.get(row.folder_id) : null) ?? null,
    photographer: row.photographer_id
      ? { id: row.photographer_id, name: photographerNameMap.get(row.photographer_id) ?? 'Unknown' }
      : { id: null,                name: row.photographer ?? 'Unknown' },
    createdAt:    row.created_at,
  }))

  return NextResponse.json({ photos, nextCursor }, { headers: CORS_HEADERS })
}
