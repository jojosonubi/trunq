import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireApiUser } from '@/lib/api-auth'

export async function PATCH(req: NextRequest) {
  const auth = await requireApiUser()
  if (auth.response) return auth.response

  const body = await req.json() as { full_name?: string }
  const supabase = createClient()

  const { error } = await supabase
    .from('profiles')
    .update({ full_name: body.full_name ?? null })
    .eq('id', auth.user.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
