import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { signStoragePaths } from '@/lib/supabase/storage'
import { requireApiUser } from '@/lib/api-auth'

export interface EventResult {
  id: string
  name: string
  date: string
  location: string | null
  venue: string | null
  cover_image_url: string | null
}

export interface PhotoResult {
  id: string
  event_id: string
  event_name: string
  event_date: string
  public_url: string
  signed_url?: string
  storage_path: string
  description: string | null
  photographer: string | null
  matched_tag: string | null
}

export interface PerformerResult {
  id: string
  event_id: string
  event_name: string
  name: string
  role: string | null
  reference_url: string | null
}

export interface SearchResults {
  events: EventResult[]
  photos: PhotoResult[]
  performers: PerformerResult[]
}

export async function GET(req: NextRequest) {
  const auth = await requireApiUser()
  if (auth.response) return auth.response

  const raw = req.nextUrl.searchParams.get('q')?.trim() ?? ''

  if (raw.length < 2) {
    return NextResponse.json<SearchResults>({ events: [], photos: [], performers: [] })
  }

  // Strip characters that are special in PostgREST or- / ilike filters
  const q       = raw.replace(/[*%,]/g, '')
  const pattern = `%${q}%`   // for .ilike()
  const star    = `*${q}*`   // for .or() ilike filter syntax

  if (!q) return NextResponse.json<SearchResults>({ events: [], photos: [], performers: [] })

  const supabase = createClient()

  const [eventsRes, photosByFieldRes, tagMatchesRes, performersRes] = await Promise.all([
    // Events: name, venue, or location
    supabase
      .from('events')
      .select('id, name, date, location, venue, cover_image_url')
      .is('deleted_at', null)
      .or(`name.ilike.${star},venue.ilike.${star},location.ilike.${star}`)
      .limit(5),

    // Photos: description or photographer
    supabase
      .from('media_files')
      .select('id, event_id, public_url, storage_path, description, photographer, events(id, name, date)')
      .or(`description.ilike.${star},photographer.ilike.${star}`)
      .eq('file_type', 'image')
      .is('deleted_at', null)
      .limit(5),

    // Photos: AI tag value (joined back to the file + event)
    supabase
      .from('tags')
      .select('value, media_files(id, event_id, public_url, storage_path, description, photographer, events(id, name, date))')
      .ilike('value', pattern)
      .limit(20),

    // Performers: name
    supabase
      .from('performers')
      .select('id, event_id, name, role, reference_url, events(id, name)')
      .ilike('name', pattern)
      .limit(5),
  ])

  // ── Build photo results ──────────────────────────────────────────────────────
  const photoMap = new Map<string, PhotoResult>()

  for (const f of (photosByFieldRes.data ?? []) as any[]) {
    const ev = f.events as { name?: string; date?: string } | null
    photoMap.set(f.id, {
      id:           f.id,
      event_id:     f.event_id,
      event_name:   ev?.name ?? '',
      event_date:   ev?.date ?? '',
      public_url:   f.public_url,
      storage_path: f.storage_path,
      description:  f.description,
      photographer: f.photographer,
      matched_tag:  null,
    })
  }

  for (const t of (tagMatchesRes.data ?? []) as any[]) {
    const mf = t.media_files as any
    if (!mf) continue
    if (photoMap.has(mf.id)) {
      const existing = photoMap.get(mf.id)!
      if (!existing.matched_tag) existing.matched_tag = String(t.value)
      continue
    }
    const ev = mf.events as { name?: string; date?: string } | null
    photoMap.set(mf.id, {
      id:           mf.id,
      event_id:     mf.event_id,
      event_name:   ev?.name ?? '',
      event_date:   ev?.date ?? '',
      public_url:   mf.public_url,
      storage_path: mf.storage_path,
      description:  mf.description,
      photographer: mf.photographer,
      matched_tag:  String(t.value),
    })
  }

  // ── Build performer results ──────────────────────────────────────────────────
  const performers: PerformerResult[] = (performersRes.data ?? []).map((p: any) => {
    const ev = p.events as { name?: string } | null
    return {
      id:            p.id,
      event_id:      p.event_id,
      event_name:    ev?.name ?? '',
      name:          p.name,
      role:          p.role,
      reference_url: p.reference_url,
    }
  })

  const photos = [...photoMap.values()].slice(0, 8)

  // Generate signed URLs for all photo results in one batch
  const storagePaths = photos.map((p) => p.storage_path).filter(Boolean)
  const signedUrlMap = storagePaths.length > 0 ? await signStoragePaths(storagePaths) : new Map<string, string>()
  for (const photo of photos) {
    photo.signed_url = signedUrlMap.get(photo.storage_path) ?? photo.public_url
  }

  return NextResponse.json<SearchResults>({
    events:     (eventsRes.data ?? []) as EventResult[],
    photos,
    performers,
  })
}
