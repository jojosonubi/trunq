import { NextRequest, NextResponse } from 'next/server'
import { requireAdminUser } from '@/lib/api-auth'
import { createServiceClient } from '@/lib/supabase/service'
import { writeAudit } from '@/lib/audit'

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await requireAdminUser()
  if (auth.response) return auth.response

  if (params.id === auth.user.id) {
    return NextResponse.json({ error: 'Cannot remove yourself' }, { status: 400 })
  }

  const service = createServiceClient()

  // Capture name/email before deletion for the audit record
  const { data: removed } = await service
    .from('profiles')
    .select('full_name, email, role')
    .eq('id', params.id)
    .single()

  const { error } = await service.auth.admin.deleteUser(params.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await writeAudit(service, {
    userId:     auth.user.id,
    action:     'team_member_removed',
    entityType: 'user',
    entityId:   params.id,
    metadata: {
      removed_email: removed?.email,
      removed_name:  removed?.full_name,
      removed_role:  removed?.role,
    },
  })

  return NextResponse.json({ ok: true })
}
