import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireApiUser, requireAdminUser } from '@/lib/api-auth'

function getServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  )
}

// POST /api/trash — soft-delete an event or media file (any authenticated user)
export async function POST(req: NextRequest) {
  const auth = await requireApiUser()
  if (auth.response) return auth.response

  const body = await req.json() as { type: 'event' | 'photo'; id: string }
  const { type, id } = body

  if (!id || (type !== 'event' && type !== 'photo')) {
    return NextResponse.json({ error: 'Missing or invalid type/id' }, { status: 400 })
  }

  const supabase = getServiceClient()
  const now = new Date().toISOString()

  if (type === 'event') {
    const { error } = await supabase
      .from('events')
      .update({ deleted_at: now })
      .eq('id', id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  } else {
    const { error } = await supabase
      .from('media_files')
      .update({ deleted_at: now })
      .eq('id', id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}

// PATCH /api/trash — restore a trashed event or media file (admin only)
export async function PATCH(req: NextRequest) {
  const auth = await requireAdminUser()
  if (auth.response) return auth.response

  const body = await req.json() as { type: 'event' | 'photo'; id: string }
  const { type, id } = body

  if (!id || (type !== 'event' && type !== 'photo')) {
    return NextResponse.json({ error: 'Missing or invalid type/id' }, { status: 400 })
  }

  const supabase = getServiceClient()
  const table = type === 'event' ? 'events' : 'media_files'

  const { error } = await supabase
    .from(table)
    .update({ deleted_at: null })
    .eq('id', id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

// DELETE /api/trash — permanently delete a trashed event or media file (admin only)
export async function DELETE(req: NextRequest) {
  const auth = await requireAdminUser()
  if (auth.response) return auth.response

  const { searchParams } = req.nextUrl
  const type = searchParams.get('type') as 'event' | 'photo' | null
  const id   = searchParams.get('id')

  if (!id || (type !== 'event' && type !== 'photo')) {
    return NextResponse.json({ error: 'Missing or invalid type/id' }, { status: 400 })
  }

  const supabase = getServiceClient()

  if (type === 'event') {
    // Collect all media storage paths for this event, then delete them
    const { data: mediaFiles } = await supabase
      .from('media_files')
      .select('storage_path')
      .eq('event_id', id)

    const storagePaths = (mediaFiles ?? [])
      .map((f) => f.storage_path)
      .filter(Boolean) as string[]

    if (storagePaths.length > 0) {
      await supabase.storage.from('media').remove(storagePaths)
    }

    const { error } = await supabase.from('events').delete().eq('id', id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  } else {
    // Get storage path first, then delete from DB, then remove from storage
    const { data: file } = await supabase
      .from('media_files')
      .select('storage_path')
      .eq('id', id)
      .single()

    const { error } = await supabase.from('media_files').delete().eq('id', id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    if (file?.storage_path) {
      await supabase.storage.from('media').remove([file.storage_path])
    }
  }

  return NextResponse.json({ ok: true })
}
