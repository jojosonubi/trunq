import { NextRequest, NextResponse } from 'next/server'
import { requireApiUserWithOrg } from '@/lib/api-auth'
import { createServiceClient } from '@/lib/supabase/service'
import { signStoragePathsSized } from '@/lib/supabase/storage'
import type { FullPhotoResult } from '../full/route'

// GET /api/search/similar?id=<media_file_id>&limit=12
// Visually similar photos to an existing archive image (by its stored embedding).
export async function GET(req: NextRequest) {
  const auth = await requireApiUserWithOrg()
  if (auth.response) return auth.response

  const id = req.nextUrl.searchParams.get('id')?.trim()
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })
  const limit = Math.min(Math.max(Number(req.nextUrl.searchParams.get('limit')) || 12, 1), 40)

  const supabase = createServiceClient()

  const { data: matches, error } = await supabase.rpc('match_similar_photos', {
    p_media_file_id: id,
    p_org: auth.organisationId,
    p_limit: limit,
  })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const ordered = (matches ?? []) as { media_file_id: string; similarity: number }[]
  const ids = ordered.map((m) => m.media_file_id)
  if (ids.length === 0) return NextResponse.json({ photos: [] })

  const { data: rows } = await supabase
    .from('media_files')
    .select('*, tags(*), events(name, date)')
    .in('id', ids)

  const byId = new Map((rows ?? []).map((r: any) => [r.id, r]))
  const displayPathMap = new Map<string, string | null>()

  const photos: FullPhotoResult[] = ordered
    .map((m) => byId.get(m.media_file_id))
    .filter(Boolean)
    .map((row: any) => {
      const ev = row.events as { name?: string; date?: string } | null
      displayPathMap.set(row.id, row.display_path ?? null)
      const { events: _ev, ...media } = row
      return {
        ...media,
        tags:             row.tags ?? [],
        dominant_colours: row.dominant_colours ?? [],
        event_name:       ev?.name ?? '',
        event_date:       ev?.date ?? '',
        matched_tag:      null,
      }
    })

  const refs = photos.map((p) => ({ storage_path: p.storage_path, display_path: displayPathMap.get(p.id) ?? null }))
  const cardMap = await signStoragePathsSized(refs, 'card', { aspect: 'preserve' })
  for (const photo of photos) {
    photo.signed_url = cardMap.get(photo.storage_path) ?? photo.public_url
  }

  return NextResponse.json({ photos })
}
