import { NextRequest, NextResponse } from 'next/server'
import { requireApiUserWithOrg } from '@/lib/api-auth'
import { createServiceClient } from '@/lib/supabase/service'
import { signStoragePathsSized } from '@/lib/supabase/storage'
import { embedText, embedImage, prepareImageForEmbedding } from '@/lib/aws/bedrock'
import type { FullPhotoResult } from '../full/route'

const MAX_UPLOAD = 10 * 1024 * 1024

// Enrich match_org_photos results into the same FullPhotoResult shape the
// keyword search returns, so SearchPageClient renders them unchanged.
async function buildResults(orgId: string, embedding: number[]) {
  const supabase = createServiceClient()

  const { data: matches, error } = await supabase.rpc('match_org_photos', {
    p_org: orgId,
    p_embedding: embedding,
    p_limit: 200,
  })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const ordered = (matches ?? []) as { media_file_id: string; similarity: number }[]
  const ids = ordered.map((m) => m.media_file_id)
  if (ids.length === 0) return NextResponse.json({ photos: [], total: 0 })

  const { data: rows } = await supabase
    .from('media_files')
    .select('id, event_id, storage_path, display_path, public_url, photographer, description, dominant_colours, file_type, events(name, date)')
    .in('id', ids)

  const byId = new Map((rows ?? []).map((r: any) => [r.id, r]))
  const displayPathMap = new Map<string, string | null>()

  // Preserve similarity order from the RPC.
  const photos: FullPhotoResult[] = ordered
    .map((m) => byId.get(m.media_file_id))
    .filter(Boolean)
    .map((row: any) => {
      const ev = row.events as { name?: string; date?: string } | null
      displayPathMap.set(row.id, row.display_path ?? null)
      return {
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
        matched_tag:      null,
      }
    })

  const photoRefs = photos.map((p) => ({ storage_path: p.storage_path, display_path: displayPathMap.get(p.id) ?? null }))
  const [cardMap, fullMap] = await Promise.all([
    signStoragePathsSized(photoRefs, 'card', { aspect: 'preserve' }),
    signStoragePathsSized(photoRefs, 'full', { aspect: 'preserve' }),
  ])
  for (const photo of photos) {
    photo.signed_url = cardMap.get(photo.storage_path) ?? photo.public_url
    photo.full_url   = fullMap.get(photo.storage_path) ?? photo.public_url
  }

  return NextResponse.json({ photos, total: photos.length })
}

// GET /api/search/semantic?q=…  — text-query semantic search
export async function GET(req: NextRequest) {
  const auth = await requireApiUserWithOrg()
  if (auth.response) return auth.response

  const q = (req.nextUrl.searchParams.get('q') ?? '').trim()
  if (q.length < 2) return NextResponse.json({ photos: [], total: 0 })

  let embedding: number[]
  try {
    embedding = await embedText(q)
  } catch (err) {
    console.error('[search/semantic] embedText failed:', err instanceof Error ? err.message : err)
    return NextResponse.json({ error: 'Failed to embed query' }, { status: 500 })
  }
  return buildResults(auth.organisationId, embedding)
}

// POST /api/search/semantic  — search-by-image (multipart "image" field)
export async function POST(req: NextRequest) {
  const auth = await requireApiUserWithOrg()
  if (auth.response) return auth.response

  let file: File | null = null
  try {
    const form = await req.formData()
    const field = form.get('image')
    file = field instanceof File ? field : null
  } catch {
    return NextResponse.json({ error: 'Expected multipart/form-data with an "image" field' }, { status: 400 })
  }
  if (!file) return NextResponse.json({ error: 'Missing "image" field' }, { status: 400 })
  if (file.size > MAX_UPLOAD) return NextResponse.json({ error: 'Image too large (max 10MB)' }, { status: 413 })

  let embedding: number[]
  try {
    const b64 = await prepareImageForEmbedding(Buffer.from(await file.arrayBuffer()))
    embedding = await embedImage(b64)
  } catch (err) {
    console.error('[search/semantic] embedImage failed:', err instanceof Error ? err.message : err)
    return NextResponse.json({ error: 'Failed to embed image' }, { status: 500 })
  }
  return buildResults(auth.organisationId, embedding)
}
