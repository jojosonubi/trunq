import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { requireAdminUser } from '@/lib/api-auth'

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await requireAdminUser()
  if (auth.response) return auth.response

  const contentType = req.headers.get('content-type') ?? ''

  let storagePath: string

  if (contentType.includes('application/json')) {
    const body = await req.json() as { storage_path?: string }
    if (!body.storage_path) {
      return NextResponse.json({ error: 'storage_path required' }, { status: 400 })
    }
    storagePath = body.storage_path
  } else {
    const formData = await req.formData()
    const file = formData.get('file') as File | null
    if (!file) return NextResponse.json({ error: 'file required' }, { status: 400 })

    const ext = file.name.split('.').pop()?.toLowerCase() ?? 'jpg'
    const path = `event-covers/${params.id}/${Date.now()}.${ext}`

    const service = createServiceClient()
    const { error: uploadError } = await service.storage
      .from('media')
      .upload(path, file, { upsert: true, contentType: file.type })

    if (uploadError) {
      return NextResponse.json({ error: uploadError.message }, { status: 500 })
    }

    storagePath = path
  }

  const supabase = createClient()
  const { error } = await supabase
    .from('events')
    .update({ thumbnail_storage_path: storagePath })
    .eq('id', params.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, storage_path: storagePath })
}
