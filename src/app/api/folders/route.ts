import { NextRequest, NextResponse } from 'next/server'
import { requireApiUser } from '@/lib/api-auth'
import { createServiceClient } from '@/lib/supabase/service'

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

    const trimmedName = name.trim()
    console.log('[folders POST] inserting:', { event_id, name: trimmedName })

    const { data: inserted, error } = await supabase
      .from('folders')
      .upsert(
        { event_id, organisation_id: event.organisation_id, name: trimmedName },
        { onConflict: 'event_id,name', ignoreDuplicates: true },
      )
      .select()
      .single()

    if (error) {
      console.error('[folders POST] upsert error:', error.message)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    if (inserted) {
      // Row was created (no conflict)
      return NextResponse.json({ folder: inserted }, { status: 201 })
    }

    // ignoreDuplicates: true returns no row on conflict — fetch the pre-existing one
    // so callers always get back a folder regardless of whether it was just created.
    console.log('[folders POST] conflict detected — fetching existing row:', { event_id, name: trimmedName })
    const { data: existing, error: fetchErr } = await supabase
      .from('folders')
      .select('*')
      .eq('event_id', event_id)
      .eq('name', trimmedName)
      .single()

    if (fetchErr || !existing) {
      console.error('[folders POST] fallback fetch failed:', fetchErr?.message)
      return NextResponse.json({ error: 'Could not resolve folder after conflict' }, { status: 500 })
    }

    return NextResponse.json({ folder: existing }, { status: 200 })
  } catch (err) {
    console.error('[folders POST] error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
