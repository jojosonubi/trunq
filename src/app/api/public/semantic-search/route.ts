import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { resolvePublicOrgId } from '@/lib/public-api/resolve'
import { signStoragePaths } from '@/lib/supabase/storage'
import { embedText, embedImage, prepareImageForEmbedding } from '@/lib/aws/bedrock'

// SEMANTIC archive search. Additive sibling of public/archive-search — same
// event scope (ALL public live events), same enrichment and TrunqPhoto shape,
// but matching is cosine similarity in the Titan Multimodal embedding space
// (photo_embeddings, migration 042) instead of ILIKE terms:
//   GET  ?org=&q=   — text query, embedded into the joint text+image space
//   POST multipart image — search-by-image (find photos that look like this)
// Ranked by similarity (curationScore included for client-side re-ranking).
// Only ever surfaces photos from is_public=true live events — enforced inside
// the match_archive_photos RPC AND re-verified on the enrichment fetch.

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
}

const MAX_RESULTS     = 200
const MIN_QUERY_LEN   = 2
const MAX_UPLOAD_SIZE = 10 * 1024 * 1024
const ID_FETCH_CHUNK  = 100

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

async function searchByEmbedding(
  orgId: string,
  embedding: number[],
  limit: number,
  query: string | null,
): Promise<NextResponse> {
  const supabase = createServiceClient()

  // ── 1. Top-K neighbours (RPC filters to approved/live/public server-side) ──
  const { data: matches, error: rpcErr } = await supabase.rpc('match_archive_photos', {
    p_org:       orgId,
    p_embedding: JSON.stringify(embedding),
    p_limit:     limit,
  })
  if (rpcErr) {
    console.log('[public/semantic-search] rpc error:', rpcErr.message)
    return NextResponse.json({ error: 'Failed to run query' }, { status: 500, headers: CORS_HEADERS })
  }
  const neighbours = (matches ?? []) as { media_file_id: string; similarity: number }[]
  console.log('[public/semantic-search] rpc →', neighbours.length, 'neighbours')
  if (neighbours.length === 0) {
    return NextResponse.json({ query, total: 0, photos: [] }, { headers: CORS_HEADERS })
  }
  const similarityById = new Map(neighbours.map((n) => [n.media_file_id, n.similarity]))

  // ── 2. Event metadata for public live events ────────────────────────────────
  const { data: evRows, error: evErr } = await supabase
    .from('events')
    .select('id, name, date, venue, location')
    .eq('organisation_id', orgId)
    .eq('is_public', true)
    .is('deleted_at', null)
  if (evErr) {
    console.log('[public/semantic-search] events error:', evErr.message)
    return NextResponse.json({ error: 'Failed to resolve events' }, { status: 500, headers: CORS_HEADERS })
  }
  const evMeta = new Map((evRows ?? []).map((e) => [e.id as string, e]))

  // ── 3. Fetch matched rows (chunked, concurrent, re-verified filters) ────────
  const neighbourIds = neighbours.map((n) => n.media_file_id)
  const chunks: string[][] = []
  for (let i = 0; i < neighbourIds.length; i += ID_FETCH_CHUNK) chunks.push(neighbourIds.slice(i, i + ID_FETCH_CHUNK))
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
      console.log('[public/semantic-search] fetch chunk error:', error.message)
      return NextResponse.json({ error: 'Failed to load photos' }, { status: 500, headers: CORS_HEADERS })
    }
    rows.push(...((data ?? []) as PhotoRow[]))
  }
  rows.sort((a, b) => (similarityById.get(b.id) ?? 0) - (similarityById.get(a.id) ?? 0))
  const pageRows = rows.slice(0, limit)

  // ── 4. Sign URLs + photographer names — same scheme as archive-search ──────
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

  // ── 5. Shape — TrunqPhoto-compatible + similarity + grouping metadata ──────
  const populatedTerm = (v: string | null | undefined) => (v && v.trim() ? v : null)
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
      similarity:    similarityById.get(row.id) ?? null,
      event_name:    ev?.name ?? null,
      event_date:    ev?.date ?? null,
      venue:         populatedTerm(ev?.venue) ?? null,
      location:      populatedTerm(ev?.location) ?? null,
    }
  })

  return NextResponse.json({ query, total: photos.length, photos }, { headers: CORS_HEADERS })
}

function clampLimit(raw: string | null): number {
  const n = Number(raw ?? MAX_RESULTS)
  return Number.isFinite(n) ? Math.min(Math.max(Math.trunc(n), 1), MAX_RESULTS) : MAX_RESULTS
}

// ── GET: text query ───────────────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  const orgId = await resolvePublicOrgId(req.nextUrl.searchParams.get('org'))
  if (!orgId) return NextResponse.json({ error: 'Unknown org slug' }, { status: 400, headers: CORS_HEADERS })

  const q = (req.nextUrl.searchParams.get('q') ?? '').trim()
  if (q.length < MIN_QUERY_LEN) {
    return NextResponse.json({ error: 'Missing or invalid q' }, { status: 400, headers: CORS_HEADERS })
  }
  const limit = clampLimit(req.nextUrl.searchParams.get('limit'))
  console.log('[public/semantic-search] GET:', { org: req.nextUrl.searchParams.get('org'), q, limit })

  let embedding: number[]
  try {
    embedding = await embedText(q)
  } catch (err) {
    console.log('[public/semantic-search] embedText error:', err instanceof Error ? err.message : String(err))
    return NextResponse.json({ error: 'Failed to embed query' }, { status: 500, headers: CORS_HEADERS })
  }
  return searchByEmbedding(orgId, embedding, limit, q)
}

// ── POST: search-by-image (multipart field "image") ───────────────────────────
export async function POST(req: NextRequest) {
  const orgId = await resolvePublicOrgId(req.nextUrl.searchParams.get('org'))
  if (!orgId) return NextResponse.json({ error: 'Unknown org slug' }, { status: 400, headers: CORS_HEADERS })

  let file: File | null = null
  try {
    const form = await req.formData()
    const field = form.get('image')
    file = field instanceof File ? field : null
  } catch {
    return NextResponse.json({ error: 'Expected multipart/form-data with an "image" field' }, { status: 400, headers: CORS_HEADERS })
  }
  if (!file) {
    return NextResponse.json({ error: 'Missing "image" field' }, { status: 400, headers: CORS_HEADERS })
  }
  if (file.size > MAX_UPLOAD_SIZE) {
    return NextResponse.json({ error: 'Image too large (max 10MB)' }, { status: 413, headers: CORS_HEADERS })
  }
  const limit = clampLimit(req.nextUrl.searchParams.get('limit'))
  console.log('[public/semantic-search] POST image:', { org: req.nextUrl.searchParams.get('org'), size: file.size, limit })

  let embedding: number[]
  try {
    const b64 = await prepareImageForEmbedding(Buffer.from(await file.arrayBuffer()))
    embedding = await embedImage(b64)
  } catch (err) {
    console.log('[public/semantic-search] embedImage error:', err instanceof Error ? err.message : String(err))
    return NextResponse.json({ error: 'Failed to embed image' }, { status: 500, headers: CORS_HEADERS })
  }
  return searchByEmbedding(orgId, embedding, limit, null)
}
