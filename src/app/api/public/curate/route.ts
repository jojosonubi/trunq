import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { resolvePublicOrgId } from '@/lib/public-api/resolve'
import { signStoragePaths } from '@/lib/supabase/storage'

// Internal curation review feed. Additive sibling of public/archive-photos —
// never edits it. Per summer (events dated May–September, 2016–2026): the top
// TOP_N photos by quality_score, plus scored/total counts so the review page
// can show how far scoring has backfilled. Same photo shape as public/photos,
// so the existing grid + PhotoModal consume it unchanged. Only ever surfaces
// photos from is_public=true live events.

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
}

const TOP_N      = 20
const YEAR_MIN   = 2016
const YEAR_MAX   = 2026
const SUMMER_MONTHS = new Set(['05', '06', '07', '08', '09'])

// Plain-text curation query: terms AND-matched, each term against description
// OR tag values OR (when it names a palette colour) dominant_colours. The query
// FILTERS the candidate pool; ranking stays quality_score DESC.
const MAX_TERMS       = 5
const MIN_TERM_LEN    = 2
const PREFETCH_PAGE   = 1000  // page size for per-term id prefetches
const ID_FETCH_CHUNK  = 100   // ids per .in() chunk when fetching matched photos
const PALETTE = new Set(['red','orange','yellow','green','teal','blue','purple','pink','white','black','grey','brown'])

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS })
}

type PhotoRow = {
  id: string; storage_path: string; display_path: string | null
  thumbnail_url: string | null; folder_id: string | null
  photographer_id: string | null; photographer: string | null
  created_at: string; quality_score: number | null; event_id: string | null
}
const SELECT = 'id, storage_path, display_path, thumbnail_url, folder_id, photographer_id, photographer, created_at, quality_score, event_id'

export async function GET(req: NextRequest) {
  const orgId = await resolvePublicOrgId(req.nextUrl.searchParams.get('org'))
  if (!orgId) return NextResponse.json({ error: 'Unknown org slug' }, { status: 400, headers: CORS_HEADERS })

  // Optional plain-text query → normalized terms (AND semantics).
  const qRaw  = req.nextUrl.searchParams.get('q') ?? ''
  const terms = [...new Set(
    qRaw.toLowerCase().split(/\s+/).map((t) => t.replace(/[^a-z0-9-]/g, '')).filter((t) => t.length >= MIN_TERM_LEN)
  )].slice(0, MAX_TERMS)

  console.log('[public/curate] params:', { org: req.nextUrl.searchParams.get('org'), terms })

  const supabase = createServiceClient()

  // ── 1. Public summer events, bucketed by year of the EVENT date ─────────────
  const { data: evRows, error: evErr } = await supabase
    .from('events')
    .select('id, name, date')
    .eq('organisation_id', orgId)
    .eq('is_public', true)
    .is('deleted_at', null)
    .not('date', 'is', null)
  if (evErr) {
    console.log('[public/curate] events error:', evErr.message)
    return NextResponse.json({ error: 'Failed to resolve events' }, { status: 500, headers: CORS_HEADERS })
  }

  const eventIdsByYear = new Map<number, string[]>()
  const eventNameMap = new Map<string, string | null>()
  const eventDateMap = new Map<string, string | null>()
  for (const e of evRows ?? []) {
    const m = /^(\d{4})-(\d{2})-\d{2}/.exec(e.date ?? '')
    if (!m) continue
    const year = Number(m[1])
    if (year < YEAR_MIN || year > YEAR_MAX || !SUMMER_MONTHS.has(m[2])) continue
    const ids = eventIdsByYear.get(year) ?? []
    ids.push(e.id)
    eventIdsByYear.set(year, ids)
    eventNameMap.set(e.id, e.name ?? null)
    eventDateMap.set(e.id, e.date ?? null)
  }

  // ── 2a. Plain-text query → candidate id set (AND across terms) ──────────────
  // Each term matches via description ILIKE, tag value ILIKE, or an exact
  // palette-colour hit on dominant_colours; a photo must match EVERY term.
  // Same prefetch/intersect pattern as public/archive-photos' tag filter.
  const allSummerEventIds = [...eventIdsByYear.values()].flat()
  const eventYearMap = new Map<string, number>()
  for (const [year, ids] of eventIdsByYear) for (const id of ids) eventYearMap.set(id, year)

  let candidate: Set<string> | null = null   // null = no q → default feed
  if (terms.length > 0 && allSummerEventIds.length > 0) {
    // a) tag values — scoped to eligible photos in the summer event set
    const tagIdsFor = async (term: string): Promise<string[]> => {
      const out: string[] = []
      for (let f = 0; ; f += PREFETCH_PAGE) {
        const { data, error } = await supabase
          .from('tags')
          .select('media_file_id, media_files!inner(event_id, review_status, deleted_at, file_type)')
          .eq('organisation_id', orgId)
          .ilike('value', `%${term}%`)
          .in('media_files.event_id', allSummerEventIds)
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

    // b) description ILIKE / c) palette colour — both on media_files
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
          .in('event_id', allSummerEventIds)
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

    // All terms × sources concurrently; union per term, then intersect (AND).
    let termSets: Set<string>[]
    try {
      termSets = await Promise.all(terms.map(async (term) => {
        const sources = await Promise.all([
          tagIdsFor(term),
          mfIdsFor(term, 'description'),
          ...(PALETTE.has(term) ? [mfIdsFor(term, 'colour')] : []),
        ])
        return new Set(sources.flat())
      }))
    } catch (err) {
      console.log('[public/curate] prefetch error:', err instanceof Error ? err.message : String(err))
      return NextResponse.json({ error: 'Failed to run query' }, { status: 500, headers: CORS_HEADERS })
    }
    candidate = termSets.reduce((acc, ids) => new Set([...acc].filter((id) => ids.has(id))))
    console.log('[public/curate] query AND →', candidate.size, 'candidates from', terms.length, 'term(s)')
  }

  // ── 2b. Query mode: fetch matched rows once, bucket by year ─────────────────
  // (chunked .in(); ranking is quality_score DESC within each summer)
  const matchedRowsByYear = new Map<number, PhotoRow[]>()
  if (candidate !== null) {
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
        .eq('score_status', 'complete')
        .not('quality_score', 'is', null)
    ))
    for (const { data, error } of chunkResults) {
      if (error) {
        console.log('[public/curate] matched fetch chunk error:', error.message)
        return NextResponse.json({ error: 'Failed to load photos' }, { status: 500, headers: CORS_HEADERS })
      }
      for (const row of (data ?? []) as PhotoRow[]) {
        const year = row.event_id ? eventYearMap.get(row.event_id) : undefined
        if (year === undefined) continue
        const bucket = matchedRowsByYear.get(year) ?? []
        bucket.push(row)
        matchedRowsByYear.set(year, bucket)
      }
    }
    for (const bucket of matchedRowsByYear.values()) {
      bucket.sort((a, b) => (b.quality_score ?? 0) - (a.quality_score ?? 0) || (a.id < b.id ? 1 : -1))
    }
  }

  // ── 2c. Per year (all years concurrently): top-N rows (+ match count in query
  //        mode) + backfill counts ────────────────────────────────────────────
  let years: { year: number; scored: number; total: number; matches: number | null; rows: PhotoRow[] }[]
  try {
    years = await Promise.all([...eventIdsByYear.keys()].sort((a, b) => a - b).map(async (year) => {
      const eventIds = eventIdsByYear.get(year)!

      let rows: PhotoRow[]
      let matches: number | null
      if (candidate !== null) {
        const bucket = matchedRowsByYear.get(year) ?? []
        matches = bucket.length
        rows = bucket.slice(0, TOP_N)
      } else {
        matches = null
        const { data: topRows, error: topErr } = await supabase
          .from('media_files')
          .select(SELECT)
          .eq('organisation_id', orgId)
          .eq('review_status', 'approved')
          .is('deleted_at', null)
          .eq('file_type', 'image')
          .in('event_id', eventIds)
          .eq('score_status', 'complete')
          .not('quality_score', 'is', null)
          .order('quality_score', { ascending: false })
          .order('id', { ascending: false })
          .limit(TOP_N)
        if (topErr) throw new Error(`top photos ${year}: ${topErr.message}`)
        rows = (topRows ?? []) as PhotoRow[]
      }

      const countQuery = () => supabase
        .from('media_files')
        .select('id', { count: 'exact', head: true })
        .eq('organisation_id', orgId)
        .eq('review_status', 'approved')
        .is('deleted_at', null)
        .eq('file_type', 'image')
        .in('event_id', eventIds)
      const [{ count: scored, error: scoredErr }, { count: total, error: totalErr }] = await Promise.all([
        countQuery().eq('score_status', 'complete'),
        countQuery(),
      ])
      if (scoredErr || totalErr) throw new Error(`counts ${year}: ${scoredErr?.message ?? totalErr?.message}`)

      return { year, scored: scored ?? 0, total: total ?? 0, matches, rows }
    }))
  } catch (err) {
    console.log('[public/curate] year query error:', err instanceof Error ? err.message : String(err))
    return NextResponse.json({ error: 'Failed to load photos' }, { status: 500, headers: CORS_HEADERS })
  }

  // ── 3. Sign URLs (batched across all years) — same scheme as public/photos ──
  const allRows = years.flatMap((y) => y.rows)
  const fullPathOf  = (r: PhotoRow) => r.display_path ?? r.storage_path
  const thumbPathOf = (r: PhotoRow) => r.thumbnail_url ?? r.display_path ?? r.storage_path
  const allPaths = [...new Set(allRows.flatMap((r) => [fullPathOf(r), thumbPathOf(r)]))]
  const signed   = await signStoragePaths(allPaths)
  const firstUrl = (...vals: (string | undefined)[]): string | null => {
    for (const v of vals) if (v) return v
    return null
  }

  // ── 4. Folder + photographer names (batched) ────────────────────────────────
  const folderIds = [...new Set(allRows.map((r) => r.folder_id).filter(Boolean))] as string[]
  const folderNameMap = new Map<string, string>()
  if (folderIds.length > 0) {
    const { data: f } = await supabase.from('folders').select('id, name').in('id', folderIds)
    for (const row of (f ?? [])) folderNameMap.set(row.id, row.name)
  }

  const photographerIds = [...new Set(allRows.map((r) => r.photographer_id).filter(Boolean))] as string[]
  const photographerNameMap   = new Map<string, string>()
  const photographerHandleMap = new Map<string, string | null>()
  if (photographerIds.length > 0) {
    const { data: pg } = await supabase.from('photographers').select('id, name, instagram_handle').in('id', photographerIds)
    for (const p of (pg ?? [])) { photographerNameMap.set(p.id, p.name); photographerHandleMap.set(p.id, p.instagram_handle ?? null) }
  }

  // ── 5. Shape response — photo shape identical to public/photos ──────────────
  const shape = (row: PhotoRow) => ({
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
  })

  return NextResponse.json({
    query: terms.length > 0 ? terms.join(' ') : null,
    years: years.map((y) => ({
      year:    y.year,
      scored:  y.scored,
      total:   y.total,
      matches: y.matches,   // null on the default (no-query) feed
      photos:  y.rows.map(shape),
    })),
  }, { headers: CORS_HEADERS })
}
