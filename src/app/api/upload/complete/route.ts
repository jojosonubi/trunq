import { NextRequest, NextResponse } from 'next/server'
import { requireApiUser } from '@/lib/api-auth'
import { createServiceClient } from '@/lib/supabase/service'
import { writeAudit } from '@/lib/audit'
import { getFileType } from '../_lib'
import type { ExifData } from '@/lib/exif'

export async function POST(request: NextRequest) {
  const auth = await requireApiUser()
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
        quality_score:      null,
        photographer,
        folder_id,
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

    return NextResponse.json({ mediaFile }, { status: 201 })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[complete] Unexpected error:', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
