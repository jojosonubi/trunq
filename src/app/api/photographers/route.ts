import { NextRequest, NextResponse } from 'next/server'
import { requireApiUserWithOrg } from '@/lib/api-auth'
import { createServiceClient } from '@/lib/supabase/service'

// GET /api/photographers?q=search  — autocomplete search scoped to caller's org
export async function GET(request: NextRequest) {
  const auth = await requireApiUserWithOrg()
  if (auth.response) return auth.response

  try {
    const q = request.nextUrl.searchParams.get('q')?.trim() ?? ''
    const supabase = createServiceClient()

    let query = supabase
      .from('photographers')
      .select('id, name, created_at')
      .eq('organisation_id', auth.organisationId)
      .order('name')
      .limit(10)

    if (q) query = query.ilike('name', `%${q}%`)

    const { data, error } = await query
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ photographers: data ?? [] })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    )
  }
}

// POST /api/photographers — upsert photographer by name in caller's org
export async function POST(request: NextRequest) {
  const auth = await requireApiUserWithOrg()
  if (auth.response) return auth.response

  try {
    const body = await request.json() as { name?: string }
    const name = body.name?.trim()
    if (!name) return NextResponse.json({ error: 'name is required' }, { status: 400 })

    const supabase = createServiceClient()

    // Case-insensitive lookup within this org
    const { data: existing, error: selectError } = await supabase
      .from('photographers')
      .select()
      .eq('organisation_id', auth.organisationId)
      .ilike('name', name)
      .maybeSingle()

    if (selectError) {
      return NextResponse.json({ error: selectError.message }, { status: 500 })
    }
    if (existing) {
      return NextResponse.json({ photographer: existing }, { status: 200 })
    }

    const { data: inserted, error: insertError } = await supabase
      .from('photographers')
      .insert({
        organisation_id: auth.organisationId,
        name,
      })
      .select()
      .single()

    if (insertError) {
      return NextResponse.json({ error: insertError.message }, { status: 500 })
    }

    return NextResponse.json({ photographer: inserted }, { status: 201 })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    )
  }
}
