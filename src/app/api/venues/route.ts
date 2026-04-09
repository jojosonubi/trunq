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

// GET /api/venues?q=search
export async function GET(request: NextRequest) {
  const auth = await requireApiUser()
  if (auth.response) return auth.response

  const q = request.nextUrl.searchParams.get('q')?.trim() ?? ''
  const supabase = getServiceClient()

  let query = supabase
    .from('venues')
    .select('id, name')
    .order('name')
    .limit(5)

  if (q) query = query.ilike('name', `%${q}%`)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ venues: data ?? [] })
}

// POST /api/venues  — upsert by name
export async function POST(request: NextRequest) {
  const auth = await requireApiUser()
  if (auth.response) return auth.response

  const body = await request.json() as { name?: string }
  const name = body.name?.trim()
  if (!name) return NextResponse.json({ error: 'name is required' }, { status: 400 })

  const supabase = getServiceClient()

  const { data: existing } = await supabase
    .from('venues')
    .select()
    .ilike('name', name)
    .maybeSingle()

  if (existing) return NextResponse.json({ venue: existing })

  const { data, error } = await supabase
    .from('venues')
    .insert({ name })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ venue: data }, { status: 201 })
}
