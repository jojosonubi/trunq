import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { signStoragePaths } from '@/lib/supabase/storage'
import { requireApiUser } from '@/lib/api-auth'

function getServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  )
}

export interface FullPhotoResult {
  id: string
  event_id: string
  event_name: string
  event_date: string
  storage_path: string
  public_url: string
  signed_url?: string
  photographer: string | null
  description: string | null
  matched_tag: string | null
  dominant_colours: string[]
  file_type: string
}

export async function GET(req: NextRequest) {
  const auth = await requireApiUser()
  if (auth.response) return auth.response

  const p          = req.nextUrl.searchParams
  const rawQ       = p.get('q')?.trim() ?? ''
  const evtName    = p.get('event_name')?.trim() ?? ''
  const venue      = p.get('venue')?.trim() ?? ''
  const location   = p.get('location')?.trim() ?? ''
  const photographer = p.get('photographer')?.trim() ?? ''
  const dateFrom   = p.get('date_from')?.trim() ?? ''
  const dateTo     = p.get('date_to')?.trim() ?? ''
  const colour     = p.get('colour')?.trim() ?? ''
  const fileType   = p.get('file_type')?.trim() ?? ''

  const supabase = getServiceClient()

  // ── Step 1: resolve event-level filters to a set of event IDs ──────────────
  let filteredEventIds: string[] | null = null  // null = no event filter

  const hasEventFilter = evtName || venue || location || dateFrom || dateTo

  if (hasEventFilter) {
    let evQ = supabase
      .from('events')
      .select('id')
      .is('deleted_at', null)

    if (evtName)   evQ = evQ.ilike('name',     `%${evtName}%`)
    if (venue)     evQ = evQ.ilike('venue',    `%${venue}%`)
    if (location)  evQ = evQ.ilike('location', `%${location}%`)
    if (dateFrom)  evQ = evQ.gte('date', dateFrom)
    if (dateTo)    evQ = evQ.lte('date', dateTo)

    const { data: evRows } = await evQ.limit(500)
    filteredEventIds = (evRows ?? []).map((r: { id: string }) => r.id)

    // No events match → return empty immediately
    if (filteredEventIds.length === 0) {
      return NextResponse.json({ photos: [], total: 0 })
    }
  }

  // ── Step 2: if there's a text query, find file IDs via tag matches ──────────
  let tagMatchIds: Set<string> | null = null

  if (rawQ.length >= 2) {
    const qClean = rawQ.replace(/[*%,]/g, '')
    const { data: tagRows } = await supabase
      .from('tags')
      .select('media_file_id')
      .ilike('value', `%${qClean}%`)
      .limit(500)

    tagMatchIds = new Set((tagRows ?? []).map((r: { media_file_id: string }) => r.media_file_id))
  }

  // ── Step 3: query media_files ───────────────────────────────────────────────
  const qClean = rawQ.replace(/[*%,]/g, '')
  const star   = `*${qClean}*`

  let mfQ = supabase
    .from('media_files')
    .select('id, event_id, storage_path, public_url, photographer, description, dominant_colours, file_type, events(id, name, date)')
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(200)

  // Text query: description or photographer match (tag matches merged below)
  if (rawQ.length >= 2) {
    mfQ = mfQ.or(`description.ilike.${star},photographer.ilike.${star}`)
  }

  // Event-level filter
  if (filteredEventIds !== null) {
    mfQ = mfQ.in('event_id', filteredEventIds)
  }

  // Photographer filter (exact from dropdown)
  if (photographer) {
    mfQ = mfQ.ilike('photographer', `%${photographer}%`)
  }

  // Colour filter
  if (colour) {
    mfQ = mfQ.contains('dominant_colours', [colour])
  }

  // File type filter
  if (fileType) {
    mfQ = mfQ.eq('file_type', fileType)
  }

  const { data: mfRows } = await mfQ

  // ── Step 4: also fetch tag-matched files not already in the direct results ──
  let extraRows: typeof mfRows = []

  if (tagMatchIds && tagMatchIds.size > 0) {
    const directIds = new Set((mfRows ?? []).map((r: { id: string }) => r.id))
    const missingIds = [...tagMatchIds].filter((id) => !directIds.has(id))

    if (missingIds.length > 0) {
      let extraQ = supabase
        .from('media_files')
        .select('id, event_id, storage_path, public_url, photographer, description, dominant_colours, file_type, events(id, name, date)')
        .is('deleted_at', null)
        .in('id', missingIds.slice(0, 200))

      if (filteredEventIds !== null) extraQ = extraQ.in('event_id', filteredEventIds)
      if (photographer) extraQ = extraQ.ilike('photographer', `%${photographer}%`)
      if (colour)       extraQ = extraQ.contains('dominant_colours', [colour])
      if (fileType)     extraQ = extraQ.eq('file_type', fileType)

      const { data: extra } = await extraQ
      extraRows = extra ?? []
    }
  }

  // ── Step 5: merge, dedupe, build results ────────────────────────────────────
  const photoMap = new Map<string, FullPhotoResult>()

  function addRow(row: any, matchedTag: string | null) {
    if (photoMap.has(row.id)) return
    const ev = row.events as { id?: string; name?: string; date?: string } | null
    photoMap.set(row.id, {
      id:               row.id,
      event_id:         row.event_id,
      event_name:       ev?.name ?? '',
      event_date:       ev?.date ?? '',
      storage_path:     row.storage_path,
      public_url:       row.public_url,
      photographer:     row.photographer,
      description:      row.description,
      dominant_colours: row.dominant_colours ?? [],
      file_type:        row.file_type,
      matched_tag:      matchedTag,
    })
  }

  for (const row of (mfRows ?? [])) addRow(row, null)

  // Tag-matched extras: note which tag matched
  if (tagMatchIds && extraRows.length > 0) {
    for (const row of extraRows) addRow(row, rawQ)
  }

  const photos = [...photoMap.values()]

  // ── Step 6: sign URLs in one batch ─────────────────────────────────────────
  const paths = photos.map((p) => p.storage_path).filter(Boolean)
  const urlMap = paths.length > 0 ? await signStoragePaths(paths) : new Map<string, string>()
  for (const photo of photos) {
    photo.signed_url = urlMap.get(photo.storage_path) ?? photo.public_url
  }

  return NextResponse.json({ photos, total: photos.length })
}
