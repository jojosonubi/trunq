import { NextRequest, NextResponse } from 'next/server'
import { requireApiUserWithOrg } from '@/lib/api-auth'
import { createServiceClient } from '@/lib/supabase/service'
import { generateDisplayDerivative } from '@/lib/storage/derivatives'

const BATCH_SIZE = 5

interface RowResult {
  id: string
  error?: string
}

async function processRow(
  supabase: ReturnType<typeof createServiceClient>,
  row: { id: string; storage_path: string; file_size: number | null },
): Promise<RowResult> {
  try {
    // Download original from storage
    const { data: fileData, error: dlError } = await supabase.storage
      .from('media')
      .download(row.storage_path)

    if (dlError || !fileData) {
      const msg = dlError?.message ?? 'empty response'
      console.error(`[backfill] ${row.id} download failed: ${msg}`)
      return { id: row.id, error: `download: ${msg}` }
    }

    const originalBuffer = Buffer.from(await fileData.arrayBuffer())
    const originalMB = (originalBuffer.length / 1024 / 1024).toFixed(2)

    // Generate derivative
    const derivative = await generateDisplayDerivative(originalBuffer, row.storage_path)
    const derivMB = (derivative.buffer.length / 1024 / 1024).toFixed(2)

    // Upload derivative
    const { error: uploadError } = await supabase.storage
      .from('media')
      .upload(derivative.path, derivative.buffer, {
        contentType: 'image/jpeg',
        upsert: true,
      })

    if (uploadError) {
      console.error(`[backfill] ${row.id} derivative upload failed: ${uploadError.message}`)
      return { id: row.id, error: `upload: ${uploadError.message}` }
    }

    // Update display_path on the row
    const { error: updateError } = await supabase
      .from('media_files')
      .update({ display_path: derivative.path })
      .eq('id', row.id)

    if (updateError) {
      console.error(`[backfill] ${row.id} DB update failed: ${updateError.message}`)
      return { id: row.id, error: `db: ${updateError.message}` }
    }

    console.log(`[backfill] ${row.id} ok — original ${originalMB}MB → derivative ${derivMB}MB at ${derivative.path}`)
    return { id: row.id }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error(`[backfill] ${row.id} unexpected error: ${msg}`)
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

  // ── Optional params ───────────────────────────────────────────────────────
  const eventId = req.nextUrl.searchParams.get('event_id') ?? null
  // force=1 reprocesses rows that already have a display_path (regenerates the derivative)
  const force   = req.nextUrl.searchParams.get('force') === '1'

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
  // Default: only rows where display_path IS NULL (never generated).
  // force=1: include all rows regardless of display_path (regenerates derivatives).
  let q = supabase
    .from('media_files')
    .select('id, storage_path, file_size')
    .is('deleted_at', null)
    .eq('file_type', 'image')
    .eq('organisation_id', auth.organisationId)
    .order('created_at', { ascending: true })
    .limit(100)    // cap per invocation to avoid timeout; re-run for remainder

  if (!force) q = q.is('display_path', null)

  if (eventId) q = q.eq('event_id', eventId)

  const { data: rows, error: fetchError } = await q

  if (fetchError) {
    console.error('[backfill] fetch error:', fetchError.message)
    return NextResponse.json({ error: 'Failed to fetch rows' }, { status: 500 })
  }

  const pending = rows ?? []
  console.log(`[backfill] ${pending.length} rows to process${eventId ? ` (event ${eventId})` : ''}`)

  if (pending.length === 0) {
    return NextResponse.json({ processed: 0, succeeded: 0, failed: 0, failed_ids: [] })
  }

  // ── Process in batches of BATCH_SIZE ─────────────────────────────────────
  let succeeded = 0
  const failedIds: string[] = []

  for (let i = 0; i < pending.length; i += BATCH_SIZE) {
    const batch = pending.slice(i, i + BATCH_SIZE)
    const results = await Promise.all(batch.map((row) => processRow(supabase, row as { id: string; storage_path: string; file_size: number | null })))

    for (const result of results) {
      if (result.error) {
        failedIds.push(result.id)
      } else {
        succeeded++
      }
    }

    console.log(`[backfill] progress: ${Math.min(i + BATCH_SIZE, pending.length)}/${pending.length} — succeeded=${succeeded} failed=${failedIds.length}`)
  }

  return NextResponse.json({
    processed: pending.length,
    succeeded,
    failed:    failedIds.length,
    failed_ids: failedIds,
  })
}
