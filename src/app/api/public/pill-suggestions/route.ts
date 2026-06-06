import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { resolvePublicOrg, resolvePublicEvent } from '@/lib/public-api/slugs'

// Cache for 60 seconds at the Vercel edge. Pills rotate via jitter on each revalidation,
// which is frequent enough to feel fresh across visits without hitting Supabase on every request.
export const revalidate = 60

const CORS_HEADERS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
}

const CACHE_HEADERS = {
  'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300',
}

const SKIP_LIST = new Set([
  // scene — too generic
  'outdoor', 'indoor', 'day', 'night', 'daylight',
  // subject — too generic
  'solo', 'duo', 'candid', 'posing', 'posed-portrait', 'close-up',
  // mood — too generic / near-universal
  'confident', 'high-energy', 'joyful', 'playful', 'cinematic',
  // garment/accessory — too common to be interesting
  't-shirt', 'crop-top', 'tank-top', 'crossbody',
  // hair — ambiguous single words
  'short', 'long',
])

const TYPE_WEIGHT: Record<string, number> = {
  accessory:     1.5,
  cultural_dress: 1.5,
  gesture:       1.3,
  hair:          1.2,
  garment:       1.1,
  mood:          1.0,
  subject:       0.9,
  scene:         0.8,
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS })
}

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl
  const orgSlug   = searchParams.get('org')
  const eventSlug = searchParams.get('event')
  const nRaw      = parseInt(searchParams.get('n') ?? '6', 10)
  const n         = Number.isFinite(nRaw) && nRaw > 0 ? Math.min(nRaw, 20) : 6

  const orgId   = resolvePublicOrg(orgSlug)
  const eventId = resolvePublicEvent(eventSlug)

  if (!orgId)   return NextResponse.json({ error: 'Unknown org slug' },   { status: 400, headers: CORS_HEADERS })
  if (!eventId) return NextResponse.json({ error: 'Unknown event slug' }, { status: 400, headers: CORS_HEADERS })

  const supabase = createServiceClient()

  // ── Step 1: Sample media_file IDs for the target event ────────────────────
  // Cap at 1000 IDs (one Supabase page). Tag frequencies across a 1000-photo
  // sample are representative enough for pill selection, and capping here
  // reduces the downstream tag query count from ~15 calls to ~5, keeping the
  // cold-path response time within Vercel's function timeout window.
  // TODO: if the event grows and representative coverage matters, switch to a
  //       random-ordered sample (add .order('created_at', { ascending: false })
  //       and paginate with a random offset) rather than restoring full pagination.
  const { data: mediaRows, error: mediaErr } = await supabase
    .from('media_files')
    .select('id')
    .eq('event_id', eventId)
    .eq('organisation_id', orgId)
    .eq('file_type', 'image')
    .is('deleted_at', null)
    .limit(1000)

  if (mediaErr) {
    console.error('[pill-suggestions] media_files query error:', mediaErr.message)
    return NextResponse.json({ error: 'Failed to load media data' }, { status: 500, headers: CORS_HEADERS })
  }

  const mediaIds = (mediaRows ?? []).map((r: { id: string }) => r.id)

  if (mediaIds.length === 0) {
    return NextResponse.json({ pills: [] }, { headers: { ...CORS_HEADERS, ...CACHE_HEADERS } })
  }

  // ── Step 2: Fetch tags in ID-chunks, paginating within each chunk ───────────
  // Supabase caps responses at 1000 rows by default. With ~10 tags/photo and
  // CHUNK=500 IDs, each chunk can have ~5,000 rows — must paginate within chunk.
  const CHUNK     = 500
  const TAG_PAGE  = 1000
  const rows: { media_file_id: string; value: string; tag_type: string }[] = []
  for (let i = 0; i < mediaIds.length; i += CHUNK) {
    const chunk = mediaIds.slice(i, i + CHUNK)
    for (let from = 0; ; from += TAG_PAGE) {
      const { data: chunkRows, error } = await supabase
        .from('tags')
        .select('media_file_id, value, tag_type')
        .in('media_file_id', chunk)
        .eq('organisation_id', orgId)
        .range(from, from + TAG_PAGE - 1)

      if (error) {
        console.error('[pill-suggestions] tags query error:', error.message)
        return NextResponse.json({ error: 'Failed to load tag data' }, { status: 500, headers: CORS_HEADERS })
      }
      if (!chunkRows || chunkRows.length === 0) break
      for (const r of chunkRows) rows.push(r)
      if (chunkRows.length < TAG_PAGE) break
    }
  }

  if (rows.length === 0) {
    return NextResponse.json({ pills: [] }, { headers: { ...CORS_HEADERS, ...CACHE_HEADERS } })
  }

  // ── Aggregate: count distinct media_file_id per (value, tag_type) ───────────
  type GroupKey = string
  const freqMap = new Map<GroupKey, { value: string; tag_type: string; fileIds: Set<string> }>()

  for (const row of rows) {
    const key = `${row.tag_type}::${row.value}`
    let entry = freqMap.get(key)
    if (!entry) {
      entry = { value: row.value, tag_type: row.tag_type, fileIds: new Set() }
      freqMap.set(key, entry)
    }
    entry.fileIds.add(row.media_file_id)
  }

  // ── Filter eligible tags ─────────────────────────────────────────────────────
  const allGroups = [...freqMap.values()]
    .map(({ value, tag_type, fileIds }) => ({ value, tag_type, frequency: fileIds.size }))
    .sort((a, b) => b.frequency - a.frequency)

  console.log('[pill-suggestions] mediaIds:', mediaIds.length, 'tagRows:', rows.length,
    'groups:', allGroups.length)
  console.log('[pill-suggestions] top 30 by freq:',
    allGroups.slice(0, 30).map(g => `${g.tag_type}/${g.value}:${g.frequency}`).join(', '))

  const eligible = allGroups.filter(({ value, frequency }) =>
    frequency >= 80 && frequency <= 500 && !SKIP_LIST.has(value.toLowerCase())
  )

  console.log('[pill-suggestions] eligible (80–500, not skipped):', eligible.length)
  console.log('[pill-suggestions] eligible sample:',
    eligible.slice(0, 20).map(g => `${g.tag_type}/${g.value}:${g.frequency}`).join(', '))

  if (eligible.length === 0) {
    return NextResponse.json({ pills: [] }, { headers: { ...CORS_HEADERS, ...CACHE_HEADERS } })
  }

  // ── Score ─────────────────────────────────────────────────────────────────────
  const maxFreq = Math.max(...eligible.map((t) => t.frequency))

  const scored = eligible.map((tag) => {
    const typeWeight       = TYPE_WEIGHT[tag.tag_type] ?? 1.0
    const specificityWeight = tag.value.includes('-') ? 1.15 : 1.0
    const jitter           = 0.95 + Math.random() * 0.1
    const baseRatio        = tag.frequency / maxFreq
    const score            = baseRatio * typeWeight * specificityWeight * jitter
    return { ...tag, score }
  })

  scored.sort((a, b) => b.score - a.score)

  // ── Pick with type-diversity constraint (max 2 per tag_type) ─────────────────
  const typeCounts = new Map<string, number>()
  const picked: { value: string; tag_type: string }[] = []

  for (const tag of scored) {
    if (picked.length >= n) break
    const count = typeCounts.get(tag.tag_type) ?? 0
    if (count >= 2) continue
    typeCounts.set(tag.tag_type, count + 1)
    picked.push({ value: tag.value, tag_type: tag.tag_type })
  }

  console.log('[pill-suggestions] final picks:',
    picked.map(p => `${p.tag_type}/${p.value}`).join(', '))

  // ── Shape response ────────────────────────────────────────────────────────────
  const pills = picked.map((tag) => ({
    label: tag.value.replace(/-/g, ' '),
    query: tag.value,
  }))

  return NextResponse.json(
    { pills },
    { headers: { ...CORS_HEADERS, ...CACHE_HEADERS } }
  )
}
