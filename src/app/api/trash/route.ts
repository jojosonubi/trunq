import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireApiUser, requireAdminUser } from '@/lib/api-auth'
import { createServiceClient } from '@/lib/supabase/service'
import { writeAudit } from '@/lib/audit'

function getServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  )
}

// POST /api/trash — soft-delete an event or media file
export async function POST(req: NextRequest) {
  const auth = await requireApiUser()
  if (auth.response) return auth.response

  const body = await req.json() as { type: 'event' | 'photo'; id: string }
  const { type, id } = body

  if (!id || (type !== 'event' && type !== 'photo')) {
    return NextResponse.json({ error: 'Missing or invalid type/id' }, { status: 400 })
  }

  const supabase = getServiceClient()
  const now      = new Date().toISOString()
  const table    = type === 'event' ? 'events' : 'media_files'

  const { error } = await supabase.from(table).update({ deleted_at: now }).eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const service = createServiceClient()
  await writeAudit(service, {
    userId:     auth.user.id,
    action:     type === 'event' ? 'event_deleted' : 'photo_deleted',
    entityType: type,
    entityId:   id,
  })

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
  const table    = type === 'event' ? 'events' : 'media_files'

  const { error } = await supabase.from(table).update({ deleted_at: null }).eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const service = createServiceClient()
  await writeAudit(service, {
    userId:     auth.user.id,
    action:     type === 'event' ? 'event_restored' : 'photo_restored',
    entityType: type,
    entityId:   id,
  })

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

  // Collect ALL storage objects for a media row — original + display
  // derivative + baked thumbnail. Deleting only storage_path orphaned the
  // derivatives in the bucket forever.
  const pathsOf = (f: { storage_path?: string | null; display_path?: string | null; thumbnail_url?: string | null }) =>
    [f.storage_path, f.display_path, f.thumbnail_url].filter(Boolean) as string[]

  if (type === 'event') {
    const { data: mediaFiles, error: listErr } = await supabase
      .from('media_files')
      .select('storage_path, display_path, thumbnail_url')
      .eq('event_id', id)
    // If we can't enumerate the files, do NOT delete the rows — that would
    // permanently leak every object in storage.
    if (listErr) return NextResponse.json({ error: listErr.message }, { status: 500 })

    const storagePaths = (mediaFiles ?? []).flatMap(pathsOf)
    if (storagePaths.length > 0) {
      await supabase.storage.from('media').remove(storagePaths)
    }

    const { error } = await supabase.from('events').delete().eq('id', id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  } else {
    const { data: file, error: fileErr } = await supabase
      .from('media_files')
      .select('storage_path, display_path, thumbnail_url')
      .eq('id', id)
      .single()
    if (fileErr) return NextResponse.json({ error: fileErr.message }, { status: 500 })

    const { error } = await supabase.from('media_files').delete().eq('id', id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    const paths = file ? pathsOf(file) : []
    if (paths.length > 0) {
      await supabase.storage.from('media').remove(paths)
    }
  }

  const service = createServiceClient()
  await writeAudit(service, {
    userId:     auth.user.id,
    action:     type === 'event' ? 'event_permanently_deleted' : 'photo_permanently_deleted',
    entityType: type,
    entityId:   id,
  })

  return NextResponse.json({ ok: true })
}
