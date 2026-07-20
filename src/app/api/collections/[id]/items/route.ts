import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { requireApiUserWithOrg } from '@/lib/api-auth'

const MAX_BATCH = 500

async function getOwnedCollection(collectionId: string, organisationId: string) {
  const supabase = createServiceClient()
  const { data } = await supabase
    .from('collections')
    .select('id')
    .eq('id', collectionId)
    .eq('organisation_id', organisationId)
    .maybeSingle()
  return data
}

function parseMediaIds(body: unknown): string[] | null {
  const ids = (body as { media_ids?: unknown })?.media_ids
  if (!Array.isArray(ids) || ids.length === 0 || ids.length > MAX_BATCH) return null
  if (!ids.every((id) => typeof id === 'string')) return null
  return ids as string[]
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireApiUserWithOrg()
  if (auth.response) return auth.response

  const mediaIds = parseMediaIds(await req.json())
  if (!mediaIds) {
    return NextResponse.json({ error: `media_ids required (1–${MAX_BATCH})` }, { status: 400 })
  }

  const collection = await getOwnedCollection(params.id, auth.organisationId)
  if (!collection) return NextResponse.json({ error: 'Collection not found' }, { status: 404 })

  const supabase = createServiceClient()
  const rows = mediaIds.map((media_file_id) => ({
    collection_id: params.id,
    media_file_id,
    added_by: auth.user.id,
  }))

  const { error } = await supabase
    .from('collection_items')
    .upsert(rows, { onConflict: 'collection_id,media_file_id', ignoreDuplicates: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, added: mediaIds.length })
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireApiUserWithOrg()
  if (auth.response) return auth.response

  const mediaIds = parseMediaIds(await req.json())
  if (!mediaIds) {
    return NextResponse.json({ error: `media_ids required (1–${MAX_BATCH})` }, { status: 400 })
  }

  const collection = await getOwnedCollection(params.id, auth.organisationId)
  if (!collection) return NextResponse.json({ error: 'Collection not found' }, { status: 404 })

  const supabase = createServiceClient()
  const { error } = await supabase
    .from('collection_items')
    .delete()
    .eq('collection_id', params.id)
    .in('media_file_id', mediaIds)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
