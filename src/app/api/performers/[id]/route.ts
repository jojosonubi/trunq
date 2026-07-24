import { NextRequest, NextResponse } from 'next/server'
import { requireApiUser } from '@/lib/api-auth'
import { createServiceClient } from '@/lib/supabase/service'
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await requireApiUser()
  if (auth.response) return auth.response

  try {
    const body = await request.json() as { name?: string; role?: string }
    const { name, role } = body
    const update: Record<string, string | null> = {}
    if (name !== undefined) update.name = name.trim()
    if (role !== undefined) update.role = role?.trim() || null

    const supabase = createServiceClient()
    const { data, error } = await supabase
      .from('performers')
      .update(update)
      .eq('id', params.id)
      .select()
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ performer: data })
  } catch (err) {
    console.error('[performers PATCH]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await requireApiUser()
  if (auth.response) return auth.response

  try {
    const supabase = createServiceClient()

    // Fetch the performer first to get the storage path for cleanup
    const { data: performer } = await supabase
      .from('performers')
      .select('reference_storage_path')
      .eq('id', params.id)
      .single()

    if (performer?.reference_storage_path) {
      await supabase.storage.from('media').remove([performer.reference_storage_path])
    }

    const { error } = await supabase.from('performers').delete().eq('id', params.id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ deleted: true })
  } catch (err) {
    console.error('[performers DELETE]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
