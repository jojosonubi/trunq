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

// GET /api/photographers?q=search  — autocomplete search
export async function GET(request: NextRequest) {
  try {
    const auth = await requireApiUser()
    if (auth.response) return auth.response

    const q = request.nextUrl.searchParams.get('q')?.trim() ?? ''
    const supabase = getServiceClient()

    let query = supabase
      .from('photographers')
      .select('id, name, created_at')
      .order('name')
      .limit(10)

    if (q) query = query.ilike('name', `%${q}%`)

    const { data, error } = await query
    if (error) {
      console.error('[photographers GET] query error:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ photographers: data ?? [] })
  } catch (err) {
    console.error('[photographers GET] unexpected:', err)
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 })
  }
}

// POST /api/photographers  — upsert photographer by name, return record
export async function POST(request: NextRequest) {
  try {
    const auth = await requireApiUser()
    if (auth.response) return auth.response

    const body = await request.json() as { name?: string }
    const name = body.name?.trim()
    if (!name) return NextResponse.json({ error: 'name is required' }, { status: 400 })

    console.log('[photographers POST] name:', name)
    const supabase = getServiceClient()

    // Check for existing record by case-insensitive name match
    const { data: existing, error: selectError } = await supabase
      .from('photographers')
      .select()
      .ilike('name', name)
      .maybeSingle()

    if (selectError) {
      console.error('[photographers POST] select error:', selectError)
      return NextResponse.json({ error: selectError.message }, { status: 500 })
    }
    if (existing) {
      console.log('[photographers POST] found existing:', existing.id)
      return NextResponse.json({ photographer: existing }, { status: 200 })
    }

    // Not found — insert new record
    const { data: inserted, error: insertError } = await supabase
      .from('photographers')
      .insert({ name })
      .select()
      .single()

    if (insertError) {
      console.error('[photographers POST] insert error:', insertError)
      return NextResponse.json({ error: insertError.message }, { status: 500 })
    }

    console.log('[photographers POST] inserted:', inserted.id)
    return NextResponse.json({ photographer: inserted }, { status: 201 })
  } catch (err) {
    console.error('[photographers POST] unexpected:', err)
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 })
  }
}
