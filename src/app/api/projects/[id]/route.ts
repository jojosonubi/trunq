import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireApiUser } from '@/lib/api-auth'
import { createServiceClient } from '@/lib/supabase/service'
import { writeAudit } from '@/lib/audit'

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await requireApiUser()
  if (auth.response) return auth.response

  const supabase = createClient()
  const { error } = await supabase.from('events').delete().eq('id', params.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const service = createServiceClient()
  await writeAudit(service, {
    userId:     auth.user.id,
    action:     'project_deleted',
    entityType: 'project',
    entityId:   params.id,
  })

  return NextResponse.json({ ok: true })
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await requireApiUser()
  if (auth.response) return auth.response

  const body = await req.json() as {
    name?: string
    date?: string
    location?: string | null
    venue?: string | null
    description?: string | null
    photographers?: string[]
    thumbnail_storage_path?: string | null
  }

  const patch: Record<string, unknown> = {
    name:          body.name,
    date:          body.date,
    location:      body.location ?? null,
    venue:         body.venue ?? null,
    description:   body.description ?? null,
    photographers: body.photographers ?? [],
  }
  if ('thumbnail_storage_path' in body) {
    patch.thumbnail_storage_path = body.thumbnail_storage_path ?? null
  }

  const supabase = createClient()
  const { data, error } = await supabase
    .from('events')
    .update(patch)
    .eq('id', params.id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const service = createServiceClient()
  await writeAudit(service, {
    userId:     auth.user.id,
    action:     'project_edited',
    entityType: 'project',
    entityId:   params.id,
    metadata:   { fields: Object.keys(patch) },
  })

  return NextResponse.json({ event: data })
}
