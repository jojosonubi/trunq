import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { resolvePublicOrg, resolvePublicEvent } from '@/lib/public-api/slugs'

const CORS_HEADERS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
}

const CACHE_HEADERS = {
  'Cache-Control': 'public, max-age=60',
}

const SKIP_LIST = new Set([
  'outdoor', 'indoor', 'day', 'night', 'daylight',
  'solo', 'duo', 'candid', 'posing', 'posed-portrait', 'close-up',
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

  // ── Step 1: Paginate media_file IDs for the target event ───────────────────
  // Supabase default row limit is 1000; paginate to collect all IDs.
  const PAGE = 1000
  const mediaIds: string[] = []
  for (let from = 0; ; from += PAGE) {
    const { data: mediaRows, error: mediaErr } = await supabase
      .from('media_files')
      .select('id')
      .eq('event_id', eventId)
      .eq('organisation_id', orgId)
      .eq('file_type', 'image')
      .is('deleted_at', null)
      .range(from, from + PAGE - 1)

    if (mediaErr) {
      console.error('[pill-suggestions] media_files query error:', mediaErr.message)
      return NextResponse.json({ error: 'Failed to load media data' }, { status: 500, headers: CORS_HEADERS })
    }
    if (!mediaRows || mediaRows.length === 0) break
    for (const r of mediaRows) mediaIds.push(r.id)
    if (mediaRows.length < PAGE) break
  }

  if (mediaIds.length === 0) {
    return NextResponse.json({ pills: [] }, { headers: { ...CORS_HEADERS, ...CACHE_HEADERS } })
  }

  // ── Step 2: Fetch tags in chunks (URL limit ~4KB; 500 UUIDs ≈ 18KB) ────────
  const CHUNK = 500
  const rows: { media_file_id: string; value: string; tag_type: string }[] = []
  for (let i = 0; i < mediaIds.length; i += CHUNK) {
    const chunk = mediaIds.slice(i, i + CHUNK)
    const { data: chunkRows, error } = await supabase
      .from('tags')
      .select('media_file_id, value, tag_type')
      .in('media_file_id', chunk)
      .eq('organisation_id', orgId)

    if (error) {
      console.error('[pill-suggestions] tags query error:', error.message)
      return NextResponse.json({ error: 'Failed to load tag data' }, { status: 500, headers: CORS_HEADERS })
    }
    if (chunkRows) for (const r of chunkRows) rows.push(r)
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
  const eligible: { value: string; tag_type: string; frequency: number }[] = []

  for (const { value, tag_type, fileIds } of freqMap.values()) {
    const frequency = fileIds.size
    if (frequency < 80 || frequency > 500) continue
    if (SKIP_LIST.has(value.toLowerCase())) continue
    eligible.push({ value, tag_type, frequency })
  }

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
