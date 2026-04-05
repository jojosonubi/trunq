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
  const auth = await requireApiUser()
  if (auth.response) return auth.response

  const q = request.nextUrl.searchParams.get('q')?.trim() ?? ''
  const supabase = getServiceClient()

  const query = supabase
    .from('photographers')
    .select('id, name, created_at')
    .order('name')
    .limit(10)

  if (q) {
    query.ilike('name', `%${q}%`)
  }

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ photographers: data ?? [] })
}

// POST /api/photographers  — upsert photographer by name, return record
export async function POST(request: NextRequest) {
  const auth = await requireApiUser()
  if (auth.response) return auth.response

  const body = await request.json() as { name?: string }
  const name = body.name?.trim()
  if (!name) return NextResponse.json({ error: 'name is required' }, { status: 400 })

  const supabase = getServiceClient()

  // Upsert on lower(name) — handled by the unique index via ON CONFLICT
  const { data, error } = await supabase
    .from('photographers')
    .upsert({ name }, { onConflict: 'name', ignoreDuplicates: false })
    .select()
    .single()

  if (error) {
    // If the unique index fires (different casing), fetch the existing record
    if (error.code === '23505') {
      const { data: existing } = await supabase
        .from('photographers')
        .select()
        .ilike('name', name)
        .single()
      return NextResponse.json({ photographer: existing }, { status: 200 })
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ photographer: data }, { status: 201 })
}
