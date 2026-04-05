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

export async function POST(request: NextRequest) {
  const auth = await requireApiUser()
  if (auth.response) return auth.response

  try {
    const { event_id } = await request.json() as { event_id?: string }

    if (!event_id) {
      return NextResponse.json({ error: 'Missing event_id' }, { status: 400 })
    }

    const supabase = getServiceClient()

    // Return the existing token if one already exists for this event
    const { data: existing } = await supabase
      .from('delivery_links')
      .select('token')
      .eq('event_id', event_id)
      .maybeSingle()

    if (existing) {
      return NextResponse.json({ token: existing.token })
    }

    const { data, error } = await supabase
      .from('delivery_links')
      .insert({ event_id })
      .select('token')
      .single()

    if (error || !data) {
      return NextResponse.json(
        { error: error?.message ?? 'Failed to create delivery link' },
        { status: 500 }
      )
    }

    return NextResponse.json({ token: data.token }, { status: 201 })
  } catch (err) {
    console.error('[delivery] error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
