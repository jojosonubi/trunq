import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { signStoragePaths } from '@/lib/supabase/storage'
import { requireApiUserWithOrg } from '@/lib/api-auth'

// GET /api/collections/[id]/download — full-res download manifest.
// Signs plain ORIGINAL objects (storage_path, no transform — batch API, no
// throttling risk); the client fetches each and zips locally.
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireApiUserWithOrg()
  if (auth.response) return auth.response

  const supabase = createServiceClient()
  const { data: collection } = await supabase
    .from('collections')
    .select('id, name')
    .eq('id', params.id)
    .eq('organisation_id', auth.organisationId)
    .maybeSingle()
  if (!collection) return NextResponse.json({ error: 'Collection not found' }, { status: 404 })

  const { data: items } = await supabase
    .from('collection_items')
    .select('added_at, media_files(id, filename, storage_path)')
    .eq('collection_id', params.id)
    .order('added_at', { ascending: true })
    .limit(500)

  const rows = ((items ?? []) as unknown as { media_files: { filename: string; storage_path: string } | null }[])
    .map((i) => i.media_files)
    .filter((r): r is NonNullable<typeof r> => !!r)

  const urlMap = await signStoragePaths(rows.map((r) => r.storage_path), 3600)

  const files = rows
    .map((r) => ({ filename: r.filename, url: urlMap.get(r.storage_path) ?? '' }))
    .filter((f) => f.url)

  return NextResponse.json({ name: collection.name, files })
}
