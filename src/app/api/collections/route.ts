import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { requireApiUserWithOrg } from '@/lib/api-auth'

export interface CollectionSummary {
  id: string
  name: string
  created_at: string
  item_count: number
}

export async function GET() {
  const auth = await requireApiUserWithOrg()
  if (auth.response) return auth.response

  const supabase = createServiceClient()
  const { data: collections, error } = await supabase
    .from('collections')
    .select('id, name, created_at')
    .eq('organisation_id', auth.organisationId)
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const ids = (collections ?? []).map((c) => c.id)
  const countMap: Record<string, number> = {}
  if (ids.length > 0) {
    const { data: items } = await supabase
      .from('collection_items')
      .select('collection_id')
      .in('collection_id', ids)
    for (const row of items ?? []) {
      countMap[row.collection_id] = (countMap[row.collection_id] ?? 0) + 1
    }
  }

  const result: CollectionSummary[] = (collections ?? []).map((c) => ({
    ...c,
    item_count: countMap[c.id] ?? 0,
  }))

  return NextResponse.json({ collections: result })
}

export async function POST(req: NextRequest) {
  const auth = await requireApiUserWithOrg()
  if (auth.response) return auth.response

  const body = await req.json() as { name?: string }
  const name = body.name?.trim()
  if (!name) return NextResponse.json({ error: 'name required' }, { status: 400 })

  const supabase = createServiceClient()
  const { data: collection, error } = await supabase
    .from('collections')
    .insert({
      organisation_id: auth.organisationId,
      name,
      created_by: auth.user.id,
    })
    .select('id, name, created_at')
    .single()

  if (error || !collection) {
    return NextResponse.json({ error: error?.message ?? 'Failed to create collection' }, { status: 500 })
  }

  return NextResponse.json({ collection: { ...collection, item_count: 0 } })
}
