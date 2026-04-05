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

export async function GET(request: NextRequest) {
  const auth = await requireApiUser()
  if (auth.response) return auth.response

  const eventId = request.nextUrl.searchParams.get('event_id')
  if (!eventId) return NextResponse.json({ error: 'Missing event_id' }, { status: 400 })

  const supabase = getServiceClient()
  const { data, error } = await supabase
    .from('performers')
    .select('*')
    .eq('event_id', eventId)
    .order('created_at', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ performers: data })
}

export async function POST(request: NextRequest) {
  const auth = await requireApiUser()
  if (auth.response) return auth.response

  try {
    const body = await request.json() as { event_id?: string; name?: string; role?: string }
    const { event_id, name, role } = body

    if (!event_id || !name?.trim()) {
      return NextResponse.json({ error: 'Missing event_id or name' }, { status: 400 })
    }

    const supabase = getServiceClient()
    const { data, error } = await supabase
      .from('performers')
      .insert({ event_id, name: name.trim(), role: role?.trim() || null })
      .select()
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ performer: data }, { status: 201 })
  } catch (err) {
    console.error('[performers POST]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
