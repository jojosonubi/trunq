import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { resolvePublicOrgId } from '@/lib/public-api/resolve'
import { signStoragePaths } from '@/lib/supabase/storage'

// GLOBAL archive search. Additive sibling of public/curate — same plain-text
// term machinery (description ILIKE ∪ tag value ILIKE ∪ palette colour, AND
// across terms) but scoped to ALL public live events (no summer filter) and
// returned as ONE flat list ranked by curation_score. The client handles
// group-by pivots (year/location/venue/photographer) from the metadata on
// each photo. Only ever surfaces photos from is_public=true live events.

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
}

const MAX_RESULTS   = 200
const MAX_TERMS     = 5
const MIN_TERM_LEN  = 2
const PREFETCH_PAGE = 1000
const ID_FETCH_CHUNK = 100
const PALETTE = new Set(['red','orange','yellow','green','teal','blue','purple','pink','white','black','grey','brown'])

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS })
}

type PhotoRow = {
  id: string; storage_path: string; display_path: string | null
  thumbnail_url: string | null; photographer_id: string | null
  photographer: string | null; created_at: string
  quality_score: number | null; curation_score: number | null; event_id: string | null
}
const SELECT = 'id, storage_path, display_path, thumbnail_url, photographer_id, photographer, created_at, quality_score, curation_score, event_id'

export async function GET(req: NextRequest) {
  const orgId = await resolvePublicOrgId(req.nextUrl.searchParams.get('org'))
  if (!orgId) return NextResponse.json({ error: 'Unknown org slug' }, { status: 400, headers: CORS_HEADERS })

  const qRaw  = req.nextUrl.searchParams.get('q') ?? ''
  const terms = [...new Set(
    qRaw.toLowerCase().split(/\s+/).map((t) => t.replace(/[^a-z0-9-]/g, '')).filter((t) => t.length >= MIN_TERM_LEN)
  )].slice(0, MAX_TERMS)
  if (terms.length === 0) {
    return NextResponse.json({ error: 'Missing or invalid q' }, { status: 400, headers: CORS_HEADERS })
  }

  console.log('[public/archive-search] params:', { org: req.nextUrl.searchParams.get('org'), terms })

  const supabase = createServiceClient()

  // ── 1. All public live events (no date filter — this is the global scope) ──
  const { data: evRows, error: evErr } = await supabase
    .from('events')
    .select('id, name, date, venue, location')
    .eq('organisation_id', orgId)
    .eq('is_public', true)
    .is('deleted_at', null)
  if (evErr) {
    console.log('[public/archive-search] events error:', evErr.message)
    return NextResponse.json({ error: 'Failed to resolve events' }, { status: 500, headers: CORS_HEADERS })
  }
  const events = evRows ?? []
  const eventIds = events.map((e) => e.id as string)
  const evMeta = new Map(events.map((e) => [e.id as string, e]))
  if (eventIds.length === 0) {
    return NextResponse.json({ query: terms.join(' '), total: 0, photos: [] }, { headers: CORS_HEADERS })
  }

  // ── 2. Per-term candidate sets (AND across terms) — same as public/curate ──
  const populatedTerm = (v: string | null | undefined) => (v && v.trim() ? v : null)

  const tagIdsFor = async (term: string): Promise<string[]> => {
    const out: string[] = []
    for (let f = 0; ; f += PREFETCH_PAGE) {
      const { data, error } = await supabase
        .from('tags')
        .select('media_file_id, media_files!inner(event_id, review_status, deleted_at, file_type)')
        .eq('organisation_id', orgId)
        .ilike('value', `%${term}%`)
        .in('media_files.event_id', eventIds)
        .eq('media_files.review_status', 'approved')
        .is('media_files.deleted_at', null)
        .eq('media_files.file_type', 'image')
        .range(f, f + PREFETCH_PAGE - 1)
      if (error) throw new Error(`tag prefetch "${term}": ${error.message}`)
      const rows = (data ?? []) as { media_file_id: string }[]
      out.push(...rows.map((r) => r.media_file_id))
      if (rows.length < PREFETCH_PAGE) break
    }
    return out
  }

  const mfIdsFor = async (term: string, source: 'description' | 'colour'): Promise<string[]> => {
    const out: string[] = []
    for (let f = 0; ; f += PREFETCH_PAGE) {
      let mq = supabase
        .from('media_files')
        .select('id')
        .eq('organisation_id', orgId)
        .eq('review_status', 'approved')
        .is('deleted_at', null)
        .eq('file_type', 'image')
        .in('event_id', eventIds)
        .range(f, f + PREFETCH_PAGE - 1)
      mq = source === 'description' ? mq.ilike('description', `%${term}%`) : mq.contains('dominant_colours', [term])
      const { data, error } = await mq
      if (error) throw new Error(`${source} prefetch "${term}": ${error.message}`)
      const rows = (data ?? []) as { id: string }[]
      out.push(...rows.map((r) => r.id))
      if (rows.length < PREFETCH_PAGE) break
    }
    return out
  }

  let candidate: Set<string>
  try {
    const termSets = await Promise.all(terms.map(async (term) => {
      const sources = await Promise.all([
        tagIdsFor(term),
        mfIdsFor(term, 'description'),
        ...(PALETTE.has(term) ? [mfIdsFor(term, 'colour')] : []),
      ])
      return new Set(sources.flat())
    }))
    candidate = termSets.reduce((acc, ids) => new Set([...acc].filter((id) => ids.has(id))))
  } catch (err) {
    console.log('[public/archive-search] prefetch error:', err instanceof Error ? err.message : String(err))
    return NextResponse.json({ error: 'Failed to run query' }, { status: 500, headers: CORS_HEADERS })
  }
  console.log('[public/archive-search] AND →', candidate.size, 'candidates from', terms.length, 'term(s)')

  if (candidate.size === 0) {
    return NextResponse.json({ query: terms.join(' '), total: 0, photos: [] }, { headers: CORS_HEADERS })
  }

  // ── 3. Fetch matched rows (chunked, concurrent), rank, cap ──────────────────
  const candidateIds = [...candidate]
  const chunks: string[][] = []
  for (let i = 0; i < candidateIds.length; i += ID_FETCH_CHUNK) chunks.push(candidateIds.slice(i, i + ID_FETCH_CHUNK))
  const chunkResults = await Promise.all(chunks.map((chunk) =>
    supabase
      .from('media_files')
      .select(SELECT)
      .eq('organisation_id', orgId)
      .eq('review_status', 'approved')
      .is('deleted_at', null)
      .eq('file_type', 'image')
      .in('id', chunk)
  ))
  const rows: PhotoRow[] = []
  for (const { data, error } of chunkResults) {
    if (error) {
      console.log('[public/archive-search] fetch chunk error:', error.message)
      return NextResponse.json({ error: 'Failed to load photos' }, { status: 500, headers: CORS_HEADERS })
    }
    rows.push(...((data ?? []) as PhotoRow[]))
  }
  rows.sort((a, b) =>
    (b.curation_score ?? 0) - (a.curation_score ?? 0) ||
    (b.quality_score ?? 0) - (a.quality_score ?? 0) ||
    (a.id < b.id ? 1 : -1))
  const total = rows.length
  const pageRows = rows.slice(0, MAX_RESULTS)

  // ── 4. Sign URLs + photographer names — same scheme as public/curate ────────
  const fullPathOf  = (r: PhotoRow) => r.display_path ?? r.storage_path
  const thumbPathOf = (r: PhotoRow) => r.thumbnail_url ?? r.display_path ?? r.storage_path
  const allPaths = [...new Set(pageRows.flatMap((r) => [fullPathOf(r), thumbPathOf(r)]))]
  const signed   = await signStoragePaths(allPaths)
  const firstUrl = (...vals: (string | undefined)[]): string | null => {
    for (const v of vals) if (v) return v
    return null
  }

  const photographerIds = [...new Set(pageRows.map((r) => r.photographer_id).filter(Boolean))] as string[]
  const pgName   = new Map<string, string>()
  const pgHandle = new Map<string, string | null>()
  if (photographerIds.length > 0) {
    const { data: pg } = await supabase.from('photographers').select('id, name, instagram_handle').in('id', photographerIds)
    for (const p of (pg ?? [])) { pgName.set(p.id, p.name); pgHandle.set(p.id, p.instagram_handle ?? null) }
  }

  // ── 5. Shape — TrunqPhoto-compatible + grouping metadata ────────────────────
  const photos = pageRows.map((row) => {
    const ev = row.event_id ? evMeta.get(row.event_id) : undefined
    return {
      id:           row.id,
      url:          firstUrl(signed.get(fullPathOf(row))),
      thumbnailUrl: firstUrl(signed.get(thumbPathOf(row)), signed.get(fullPathOf(row))),
      day:          null,
      photographer: row.photographer_id
        ? { id: row.photographer_id, name: pgName.get(row.photographer_id) ?? 'Unknown', instagramHandle: pgHandle.get(row.photographer_id) ?? null }
        : { id: null,                name: row.photographer ?? 'Unknown',                 instagramHandle: null },
      createdAt:     row.created_at,
      curationScore: row.curation_score ?? null,
      event_name:    ev?.name ?? null,
      event_date:    ev?.date ?? null,
      venue:         populatedTerm(ev?.venue) ?? null,
      location:      populatedTerm(ev?.location) ?? null,
    }
  })

  return NextResponse.json({ query: terms.join(' '), total, photos }, { headers: CORS_HEADERS })
}
