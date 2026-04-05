import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'

// GET /api/invites/[code] — validate an invite code (public, called during signup)
export async function GET(
  _req: NextRequest,
  { params }: { params: { code: string } }
) {
  const service = createServiceClient()

  const { data, error } = await service
    .from('invites')
    .select('id, role, expires_at, used_at')
    .eq('code', params.code)
    .single()

  if (error || !data) {
    return NextResponse.json({ valid: false })
  }

  const expired = new Date(data.expires_at) < new Date()
  const used    = data.used_at !== null

  if (expired || used) {
    return NextResponse.json({ valid: false, reason: used ? 'already_used' : 'expired' })
  }

  return NextResponse.json({ valid: true, role: data.role })
}

// DELETE /api/invites/[code] — revoke an invite (admin only)
export async function DELETE(
  _req: NextRequest,
  { params }: { params: { code: string } }
) {
  const { createClient } = await import('@/lib/supabase/server')
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()
  if (profile?.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const service = createServiceClient()
  const { error } = await service.from('invites').delete().eq('code', params.code)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
