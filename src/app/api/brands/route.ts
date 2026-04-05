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
    .from('brands')
    .select('*')
    .eq('event_id', eventId)
    .order('created_at', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ brands: data })
}

export async function POST(request: NextRequest) {
  const auth = await requireApiUser()
  if (auth.response) return auth.response

  try {
    const body = await request.json() as { event_id?: string; name?: string }
    const { event_id, name } = body

    if (!event_id || !name?.trim()) {
      return NextResponse.json({ error: 'Missing event_id or name' }, { status: 400 })
    }

    const supabase = getServiceClient()
    const { data, error } = await supabase
      .from('brands')
      .insert({ event_id, name: name.trim() })
      .select()
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ brand: data }, { status: 201 })
  } catch (err) {
    console.error('[brands POST]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
