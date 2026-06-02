import { NextRequest, NextResponse } from 'next/server'
import { requireApiUserWithOrg } from '@/lib/api-auth'
import { createServiceClient } from '@/lib/supabase/service'
import { generateThumbnailDerivative } from '@/lib/storage/derivatives'

const BATCH_SIZE = 10

interface RowResult {
  id: string
  error?: string
}

async function processRow(
  supabase: ReturnType<typeof createServiceClient>,
  row: { id: string; storage_path: string },
): Promise<RowResult> {
  try {
    const { data: fileData, error: dlError } = await supabase.storage
      .from('media')
      .download(row.storage_path)

    if (dlError || !fileData) {
      const msg = dlError?.message ?? 'empty response'
      console.error(`[backfill-thumbnails] ${row.id} download failed: ${msg}`)
      return { id: row.id, error: `download: ${msg}` }
    }

    const originalBuffer = Buffer.from(await fileData.arrayBuffer())
    const thumb          = await generateThumbnailDerivative(originalBuffer, row.storage_path)

    const { error: uploadError } = await supabase.storage
      .from('media')
      .upload(thumb.path, thumb.buffer, {
        contentType: 'image/jpeg',
        upsert: true,
      })

    if (uploadError) {
      console.error(`[backfill-thumbnails] ${row.id} upload failed: ${uploadError.message}`)
      return { id: row.id, error: `upload: ${uploadError.message}` }
    }

    const { error: updateError } = await supabase
      .from('media_files')
      .update({ thumbnail_url: thumb.path })
      .eq('id', row.id)

    if (updateError) {
      console.error(`[backfill-thumbnails] ${row.id} DB update failed: ${updateError.message}`)
      return { id: row.id, error: `db: ${updateError.message}` }
    }

    console.log(`[backfill-thumbnails] ${row.id} ok — ${thumb.path} (${(thumb.buffer.length / 1024).toFixed(0)}KB)`)
    return { id: row.id }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error(`[backfill-thumbnails] ${row.id} unexpected error: ${msg}`)
    return { id: row.id, error: msg }
  }
}

export async function POST(req: NextRequest) {
  // ── Auth: owner role only ─────────────────────────────────────────────────
  const auth = await requireApiUserWithOrg()
  if (auth.response) return auth.response

  if (auth.organisationRole !== 'owner') {
    return NextResponse.json({ error: 'Owner role required' }, { status: 403 })
  }

  const eventId = req.nextUrl.searchParams.get('event_id') ?? null

  const supabase = createServiceClient()

  // Verify event belongs to caller's org if scoped
  if (eventId) {
    const { data: ev, error: evErr } = await supabase
      .from('events')
      .select('organisation_id')
      .eq('id', eventId)
      .single()

    if (evErr || !ev) {
      return NextResponse.json({ error: 'Event not found' }, { status: 404 })
    }
    if (ev.organisation_id !== auth.organisationId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
  }

  // ── Fetch rows to process ─────────────────────────────────────────────────
  let q = supabase
    .from('media_files')
    .select('id, storage_path')
    .is('thumbnail_url', null)
    .is('deleted_at', null)
    .eq('file_type', 'image')
    .eq('organisation_id', auth.organisationId)
    .order('created_at', { ascending: false })
    .limit(BATCH_SIZE + 1)   // fetch one extra to detect hasMore

  if (eventId) q = q.eq('event_id', eventId)

  const { data: rows, error: fetchError } = await q

  if (fetchError) {
    console.error('[backfill-thumbnails] fetch error:', fetchError.message)
    return NextResponse.json({ error: 'Failed to fetch rows' }, { status: 500 })
  }

  const allRows = rows ?? []
  const hasMore = allRows.length > BATCH_SIZE
  const pending = hasMore ? allRows.slice(0, BATCH_SIZE) : allRows

  console.log(`[backfill-thumbnails] ${pending.length} rows to process${eventId ? ` (event ${eventId})` : ''} hasMore=${hasMore}`)

  if (pending.length === 0) {
    return NextResponse.json({ processed: 0, succeeded: 0, failed: 0, hasMore: false })
  }

  // ── Process sequentially (Sharp + upload is CPU/network-bound) ────────────
  let succeeded = 0
  const failedIds: string[] = []

  for (const row of pending) {
    const result = await processRow(supabase, row as { id: string; storage_path: string })
    if (result.error) {
      failedIds.push(result.id)
    } else {
      succeeded++
    }
    console.log(`[backfill-thumbnails] progress: ${succeeded + failedIds.length}/${pending.length} — succeeded=${succeeded} failed=${failedIds.length}`)
  }

  return NextResponse.json({
    processed:  pending.length,
    succeeded,
    failed:     failedIds.length,
    failed_ids: failedIds,
    hasMore,
  })
}
