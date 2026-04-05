import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { randomUUID } from 'crypto'
import { requireApiUser } from '@/lib/api-auth'

function getServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  )
}

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await requireApiUser()
  if (auth.response) return auth.response

  try {
    const formData = await request.formData()
    const file = formData.get('file') as File | null
    if (!file) return NextResponse.json({ error: 'Missing file' }, { status: 400 })

    const supabase = getServiceClient()

    // Delete old reference photo if one exists
    const { data: existing } = await supabase
      .from('performers')
      .select('reference_storage_path')
      .eq('id', params.id)
      .single()

    if (existing?.reference_storage_path) {
      await supabase.storage.from('media').remove([existing.reference_storage_path])
    }

    // Upload new reference photo
    const ext = file.name.split('.').pop()?.toLowerCase() ?? 'jpg'
    const storagePath = `performers/${params.id}_${randomUUID()}.${ext}`

    const { error: uploadError } = await supabase.storage
      .from('media')
      .upload(storagePath, file, { contentType: file.type, upsert: false })

    if (uploadError) {
      return NextResponse.json({ error: uploadError.message }, { status: 500 })
    }

    const { data: performer, error: updateError } = await supabase
      .from('performers')
      .update({ reference_storage_path: storagePath })
      .eq('id', params.id)
      .select()
      .single()

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 })
    }

    // Backup copy — non-blocking
    ;(async () => {
      try {
        const { error } = await supabase.storage
          .from('media-backup')
          .upload(storagePath, file, { contentType: file.type, upsert: true })
        if (error) console.error('[backup] performers/reference:', error.message)
      } catch (err) {
        console.error('[backup] performers/reference unexpected:', err)
      }
    })()

    return NextResponse.json({ performer })
  } catch (err) {
    console.error('[performers/reference POST]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
