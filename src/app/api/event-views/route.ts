import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireApiUser } from '@/lib/api-auth'

export async function POST(req: NextRequest) {
  const auth = await requireApiUser()
  if (auth.response) return auth.response

  const { event_id } = await req.json() as { event_id?: string }
  if (!event_id) return NextResponse.json({ error: 'event_id required' }, { status: 400 })

  const supabase = createClient()
  const { error } = await supabase
    .from('event_views')
    .upsert(
      { user_id: auth.user.id, event_id, viewed_at: new Date().toISOString() },
      { onConflict: 'user_id,event_id' }
    )

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
