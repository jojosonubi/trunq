import { NextRequest, NextResponse } from 'next/server'
import { requireApiUser } from '@/lib/api-auth'
import { createServiceClient } from '@/lib/supabase/service'
import {
  buildArchiveFilename,
  resolveUniqueFilename,
  getExtension,
} from '../_lib'

export async function POST(request: NextRequest) {
  const auth = await requireApiUser()
  if (auth.response) return auth.response

  try {
    const body = await request.json() as {
      event_id:          string
      original_filename: string
      mime_type:         string
      photographer?:     string | null
      folder_id?:        string | null
    }

    const { event_id, original_filename, mime_type } = body
    const photographer = body.photographer?.trim() || null
    const folder_id    = body.folder_id?.trim()    || null

    if (!event_id || !original_filename || !mime_type) {
      return NextResponse.json(
        { error: 'Missing required fields: event_id, original_filename, mime_type' },
        { status: 400 },
      )
    }

    const supabase = createServiceClient()
    const ext      = getExtension(original_filename)

    const [eventRes, seqRes] = await Promise.all([
      supabase.from('events').select('date, name').eq('id', event_id).single(),
      supabase.rpc('next_media_seq', { p_event_id: event_id }),
    ])

    if (seqRes.error) {
      console.error('[presign] Sequence fetch error:', seqRes.error.message)
      return NextResponse.json({ error: 'Failed to get sequence number' }, { status: 500 })
    }

    const eventDate = eventRes.data?.date ?? new Date().toISOString().slice(0, 10)
    const eventName = eventRes.data?.name ?? 'event'
    const seq       = seqRes.data as number

    const baseFilename = buildArchiveFilename(eventDate, eventName, photographer, seq, ext)
    const { filename: archiveFilename, isBase } = await resolveUniqueFilename(supabase, event_id, baseFilename)
    const storagePath = `${event_id}/${archiveFilename}`

    if (!isBase) {
      console.log(`[presign] filename collision resolved: ${baseFilename} → ${archiveFilename}`)
    }

    const { data: signData, error: signError } = await supabase.storage
      .from('media')
      .createSignedUploadUrl(storagePath)

    if (signError || !signData) {
      console.error('[presign] createSignedUploadUrl error:', signError?.message)
      return NextResponse.json({ error: 'Failed to create signed upload URL' }, { status: 500 })
    }

    return NextResponse.json({
      upload_url:       signData.signedUrl,
      storage_path:     storagePath,
      archive_filename: archiveFilename,
      is_base:          isBase,
      photographer,
      folder_id,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[presign] Unexpected error:', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
