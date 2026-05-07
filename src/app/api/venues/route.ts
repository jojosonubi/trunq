import { NextRequest, NextResponse } from 'next/server'
import { requireApiUserWithOrg } from '@/lib/api-auth'
import { createServiceClient } from '@/lib/supabase/service'

// GET /api/venues?q=search
export async function GET(request: NextRequest) {
  const auth = await requireApiUserWithOrg()
  if (auth.response) return auth.response

  const q = request.nextUrl.searchParams.get('q')?.trim() ?? ''
  const supabase = createServiceClient()

  let query = supabase
    .from('venues')
    .select('id, name')
    .eq('organisation_id', auth.organisationId)
    .order('name')
    .limit(5)

  if (q) query = query.ilike('name', `%${q}%`)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ venues: data ?? [] })
}

// POST /api/venues  — upsert by name
export async function POST(request: NextRequest) {
  const auth = await requireApiUserWithOrg()
  if (auth.response) return auth.response

  const body = await request.json() as { name?: string }
  const name = body.name?.trim()
  if (!name) return NextResponse.json({ error: 'name is required' }, { status: 400 })

  const supabase = createServiceClient()

  const { data: existing } = await supabase
    .from('venues')
    .select()
    .eq('organisation_id', auth.organisationId)
    .ilike('name', name)
    .maybeSingle()

  if (existing) return NextResponse.json({ venue: existing })

  const { data, error } = await supabase
    .from('venues')
    .insert({ name, organisation_id: auth.organisationId })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ venue: data }, { status: 201 })
}
