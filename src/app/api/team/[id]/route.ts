import { NextRequest, NextResponse } from 'next/server'
import { requireAdminUser } from '@/lib/api-auth'
import { createServiceClient } from '@/lib/supabase/service'

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
  const { error } = await service.auth.admin.deleteUser(params.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
