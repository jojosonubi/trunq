import { NextRequest, NextResponse } from 'next/server'
import { requireApiUser } from '@/lib/api-auth'
import { createServiceClient } from '@/lib/supabase/service'

export async function GET(request: NextRequest) {
  const auth = await requireApiUser()
  if (auth.response) return auth.response

  const eventId = request.nextUrl.searchParams.get('event_id')
  if (!eventId) return NextResponse.json({ error: 'Missing event_id' }, { status: 400 })

  const supabase = createServiceClient()
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

    const supabase = createServiceClient()

    // Resolve organisation_id from the parent event
    const { data: event, error: eventErr } = await supabase
      .from('events')
      .select('organisation_id')
      .eq('id', event_id)
      .single()

    if (eventErr || !event) {
      return NextResponse.json({ error: 'Event not found' }, { status: 404 })
    }

    const { data, error } = await supabase
      .from('brands')
      .insert({ event_id, organisation_id: event.organisation_id, name: name.trim() })
      .select()
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ brand: data }, { status: 201 })
  } catch (err) {
    console.error('[brands POST]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
