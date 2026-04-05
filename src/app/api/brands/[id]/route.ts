import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireApiUser } from '@/lib/api-auth'

function getServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  )
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await requireApiUser()
  if (auth.response) return auth.response

  try {
    const body = await request.json() as { name?: string }
    if (!body.name?.trim()) {
      return NextResponse.json({ error: 'Missing name' }, { status: 400 })
    }

    const supabase = getServiceClient()
    const { data, error } = await supabase
      .from('brands')
      .update({ name: body.name.trim() })
      .eq('id', params.id)
      .select()
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ brand: data })
  } catch (err) {
    console.error('[brands PATCH]', err)
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
    const supabase = getServiceClient()

    const { data: existing } = await supabase
      .from('brands')
      .select('reference_storage_path')
      .eq('id', params.id)
      .single()

    if (existing?.reference_storage_path) {
      await supabase.storage.from('media').remove([existing.reference_storage_path])
    }

    const { error } = await supabase.from('brands').delete().eq('id', params.id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ deleted: true })
  } catch (err) {
    console.error('[brands DELETE]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
