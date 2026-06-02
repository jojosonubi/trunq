import { NextRequest, NextResponse } from 'next/server'
import { waitUntil } from '@vercel/functions'
import { requireApiUserWithOrg } from '@/lib/api-auth'
import { createServiceClient } from '@/lib/supabase/service'
import { writeAudit } from '@/lib/audit'
import { getFileType } from '../_lib'
import type { ExifData } from '@/lib/exif'
import { generateDisplayDerivative, generateThumbnailDerivative } from '@/lib/storage/derivatives'

export async function POST(request: NextRequest) {
  const auth = await requireApiUserWithOrg()
  if (auth.response) return auth.response

  try {
    const body = await request.json() as {
      storage_path:      string
      archive_filename:  string
      original_filename: string
      event_id:          string
      photographer?:     string | null
      folder_id?:        string | null
      exif_data?:        ExifData | null
      file_hash:         string
      file_size:         number
      mime_type:         string
    }

    const {
      storage_path,
      archive_filename,
      original_filename,
      event_id,
      file_hash,
      file_size,
      mime_type,
    } = body

    if (!storage_path || !archive_filename || !original_filename || !event_id || !file_hash || !mime_type) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 },
      )
    }

    const photographer = body.photographer?.trim() || null
    const folder_id    = body.folder_id?.trim()    || null
    const exif: ExifData = body.exif_data ?? {
      dateTaken: null, gpsLat: null, gpsLng: null,
      cameraMake: null, cameraModel: null, iso: null,
      aperture: null, shutterSpeed: null, focalLength: null,
      width: null, height: null,
    }

    const supabase = createServiceClient()

    // Verify event belongs to caller's org
    const { data: event, error: eventErr } = await supabase
      .from('events')
      .select('organisation_id')
      .eq('id', event_id)
      .single()

    if (eventErr || !event) {
      return NextResponse.json({ error: 'Event not found' }, { status: 404 })
    }

    if (event.organisation_id !== auth.organisationId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    // Resolve photographer_id if a photographer name was provided
    let photographer_id: string | null = null
    if (photographer) {
      const { data: existing } = await supabase
        .from('photographers')
        .select('id')
        .eq('organisation_id', event.organisation_id)
        .ilike('name', photographer)
        .maybeSingle()

      if (existing) {
        photographer_id = existing.id
      } else {
        const { data: inserted } = await supabase
          .from('photographers')
          .insert({
            organisation_id: event.organisation_id,
            name:            photographer,
          })
          .select('id')
          .single()
        photographer_id = inserted?.id ?? null
      }
    }

    const { data: mediaFile, error: dbError } = await supabase
      .from('media_files')
      .insert({
        event_id,
        filename:           archive_filename,
        original_filename,
        file_hash,
        storage_path,
        public_url:         storage_path,
        file_type:          getFileType(mime_type),
        file_size,
        width:              exif.width,
        height:             exif.height,
        exif_date_taken:    exif.dateTaken,
        exif_gps_lat:       exif.gpsLat,
        exif_gps_lng:       exif.gpsLng,
        exif_camera_make:   exif.cameraMake,
        exif_camera_model:  exif.cameraModel,
        exif_iso:           exif.iso,
        exif_aperture:      exif.aperture,
        exif_shutter_speed: exif.shutterSpeed,
        exif_focal_length:  exif.focalLength,
        organisation_id:    event.organisation_id,
        quality_score:      null,
        review_status:      'approved',
        photographer,
        photographer_id,
        folder_id,
        display_path:       null,  // populated asynchronously below
      })
      .select()
      .single()

    if (dbError) {
      console.error('[complete] DB insert error:', dbError.message, { storage_path })
      // Roll back — remove the already-uploaded file from storage
      await supabase.storage.from('media').remove([storage_path])
      return NextResponse.json(
        { error: `Database insert failed: ${dbError.message}` },
        { status: 500 },
      )
    }

    const fileId = (mediaFile as { id: string }).id

    // Audit log
    await writeAudit(supabase, {
      userId:     auth.user.id,
      action:     'photo_uploaded',
      entityType: 'photo',
      entityId:   fileId,
      metadata: {
        filename:          archive_filename,
        original_filename,
        event_id,
        photographer:      photographer ?? 'unknown',
        file_hash,
        file_size,
      },
    })

    // Backup copy — fire-and-forget
    ;(async () => {
      try {
        const { data: fileData, error: dlError } = await supabase.storage
          .from('media')
          .download(storage_path)

        if (dlError || !fileData) {
          console.error('[complete/backup] download failed:', dlError?.message)
          return
        }

        const { error: backupError } = await supabase.storage
          .from('media-backup')
          .upload(storage_path, fileData, { upsert: true })

        if (backupError) {
          console.error('[complete/backup] upload failed:', backupError.message)
          return
        }

        const { error: updateError } = await supabase
          .from('media_files')
          .update({ backup_storage_path: storage_path })
          .eq('id', fileId)

        if (updateError) {
          console.error('[complete/backup] DB update failed:', updateError.message)
        }
      } catch (err) {
        console.error('[complete/backup] unexpected:', err)
      }
    })()

    // waitUntil keeps the Vercel function context alive for the derivative
    // pipeline after the HTTP response is sent. Without this, the async IIFE
    // is killed mid-execution and display_path stays null on uploaded rows.
    //
    // Two derivatives: _display.jpg (full-size for modal), _thumb.jpg (600x600 smart-crop for grid)
    // Both run inside the waitUntil block; row gets a single combined update at the end.
    if (getFileType(mime_type) === 'image') {
      waitUntil((async () => {
        try {
          const { data: fileData, error: dlError } = await supabase.storage
            .from('media')
            .download(storage_path)

          if (dlError || !fileData) {
            console.error('[complete/derivative] download failed:', dlError?.message)
            return
          }

          const originalBuffer = Buffer.from(await fileData.arrayBuffer())

          // Generate both derivatives from the same buffer in parallel
          const [display, thumbResult] = await Promise.all([
            generateDisplayDerivative(originalBuffer, storage_path),
            generateThumbnailDerivative(originalBuffer, storage_path).catch((err: unknown) => {
              console.error('[complete/derivative] thumb generation failed:', err instanceof Error ? err.message : err)
              return null
            }),
          ])

          // Upload display derivative (required — bail if this fails)
          const { error: displayUploadError } = await supabase.storage
            .from('media')
            .upload(display.path, display.buffer, { contentType: 'image/jpeg', upsert: true })

          if (displayUploadError) {
            console.error('[complete/derivative] display upload failed:', displayUploadError.message)
            return
          }

          // Upload thumbnail derivative (optional — log failure but continue)
          let thumbPath: string | null = null
          if (thumbResult) {
            const { error: thumbUploadError } = await supabase.storage
              .from('media')
              .upload(thumbResult.path, thumbResult.buffer, { contentType: 'image/jpeg', upsert: true })

            if (thumbUploadError) {
              console.error('[complete/derivative] thumb upload failed:', thumbUploadError.message)
            } else {
              thumbPath = thumbResult.path
            }
          }

          // Single combined DB update
          const updatePayload: Record<string, string | null> = { display_path: display.path }
          if (thumbPath) updatePayload.thumbnail_url = thumbPath

          const { error: updateError } = await supabase
            .from('media_files')
            .update(updatePayload)
            .eq('id', fileId)

          if (updateError) {
            console.error('[complete/derivative] DB update failed:', updateError.message)
            return
          }

          console.log(`[complete/derivative] ok — display=${display.path} thumb=${thumbPath ?? 'skipped'} display_size=${display.buffer.length}`)
        } catch (err) {
          console.error('[complete/derivative] unexpected:', err instanceof Error ? err.message : err)
          // Row stays display_path=null — falls back to storage_path for display
        }
      })())
    }

    return NextResponse.json({ mediaFile }, { status: 201 })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[complete] Unexpected error:', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
