import { NextRequest, NextResponse } from 'next/server'
import { createHash } from 'crypto'
import { requireAdminUser } from '@/lib/api-auth'
import { createServiceClient } from '@/lib/supabase/service'

// GET /api/verify/[id] — verify the integrity of a single file
export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  const auth = await requireAdminUser()
  if (auth.response) return auth.response

  const service = createServiceClient()

  const { data: file, error } = await service
    .from('media_files')
    .select('id, filename, storage_path, file_hash')
    .eq('id', params.id)
    .single()

  if (error || !file) {
    return NextResponse.json({ error: 'File not found' }, { status: 404 })
  }

  if (!file.file_hash) {
    return NextResponse.json(
      { error: 'No stored hash for this file (uploaded before checksums were enabled)' },
      { status: 422 },
    )
  }

  const { data: signed, error: signError } = await service.storage
    .from('media')
    .createSignedUrl(file.storage_path, 60)

  if (signError || !signed?.signedUrl) {
    return NextResponse.json({ error: 'Could not sign storage URL' }, { status: 500 })
  }

  const res = await fetch(signed.signedUrl)
  if (!res.ok) {
    return NextResponse.json(
      { error: `Storage fetch failed: HTTP ${res.status}` },
      { status: 500 },
    )
  }

  const actual = createHash('sha256').update(Buffer.from(await res.arrayBuffer())).digest('hex')
  const valid  = actual === file.file_hash

  return NextResponse.json({
    valid,
    file_id:  file.id,
    filename: file.filename,
    ...(valid ? {} : { expected: file.file_hash, actual }),
  })
}
