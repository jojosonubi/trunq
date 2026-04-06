import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireApiUser } from '@/lib/api-auth'
import { createServiceClient } from '@/lib/supabase/service'
import { writeAudit } from '@/lib/audit'

export async function PATCH(req: NextRequest) {
  const auth = await requireApiUser()
  if (auth.response) return auth.response

  const body = await req.json() as {
    id: string
    usage_type?: 'all_rights' | 'editorial_only' | 'client_use' | 'restricted' | null
    usage_expires_at?: string | null
    usage_notes?: string | null
  }

  if (!body.id) {
    return NextResponse.json({ error: 'id required' }, { status: 400 })
  }

  const patch: Record<string, unknown> = {}
  if ('usage_type'       in body) patch.usage_type       = body.usage_type ?? null
  if ('usage_expires_at' in body) patch.usage_expires_at = body.usage_expires_at ?? null
  if ('usage_notes'      in body) patch.usage_notes      = body.usage_notes ?? null

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: 'No fields to update' }, { status: 400 })
  }

  const supabase = createClient()
  const { data, error } = await supabase
    .from('media_files')
    .update(patch)
    .eq('id', body.id)
    .select('id, usage_type, usage_expires_at, usage_notes')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const service = createServiceClient()
  await writeAudit(service, {
    userId:     auth.user.id,
    action:     'usage_rights_updated',
    entityType: 'photo',
    entityId:   body.id,
    metadata:   patch,
  })

  return NextResponse.json({ file: data })
}
