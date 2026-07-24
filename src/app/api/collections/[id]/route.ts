import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { requireApiUserWithOrg } from '@/lib/api-auth'

async function getOwned(collectionId: string, organisationId: string) {
  const supabase = createServiceClient()
  const { data } = await supabase
    .from('collections')
    .select('id')
    .eq('id', collectionId)
    .eq('organisation_id', organisationId)
    .maybeSingle()
  return data
}

// PATCH /api/collections/[id]  — rename
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireApiUserWithOrg()
  if (auth.response) return auth.response

  const name = ((await req.json()) as { name?: string }).name?.trim()
  if (!name) return NextResponse.json({ error: 'name required' }, { status: 400 })

  if (!(await getOwned(params.id, auth.organisationId))) {
    return NextResponse.json({ error: 'Collection not found' }, { status: 404 })
  }

  const supabase = createServiceClient()
  const { error } = await supabase.from('collections').update({ name }).eq('id', params.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

// DELETE /api/collections/[id]  — delete the collection (items cascade)
export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireApiUserWithOrg()
  if (auth.response) return auth.response

  if (!(await getOwned(params.id, auth.organisationId))) {
    return NextResponse.json({ error: 'Collection not found' }, { status: 404 })
  }

  const supabase = createServiceClient()
  const { error } = await supabase.from('collections').delete().eq('id', params.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
