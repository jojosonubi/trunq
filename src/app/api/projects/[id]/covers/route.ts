import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireApiUser } from '@/lib/api-auth'
import { signStoragePaths } from '@/lib/supabase/storage'

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await requireApiUser()
  if (auth.response) return auth.response

  const supabase = createClient()
  const { data, error } = await supabase
    .from('media_files')
    .select('id, storage_path')
    .eq('event_id', params.id)
    .eq('file_type', 'image')
    .is('deleted_at', null)
    .order('created_at', { ascending: true })
    .limit(30)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const rows = data ?? []
  const paths = rows.map((r: { storage_path: string }) => r.storage_path)
  const urlMap = paths.length > 0 ? await signStoragePaths(paths) : new Map<string, string>()

  const photos = rows.map((r: { id: string; storage_path: string }) => ({
    id: r.id,
    storage_path: r.storage_path,
    signed_url: urlMap.get(r.storage_path) ?? '',
  }))

  return NextResponse.json({ photos })
}
