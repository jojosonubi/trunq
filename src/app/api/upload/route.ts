import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { randomUUID } from 'crypto'
import type { ExifData } from '@/lib/exif'
import { requireApiUser } from '@/lib/api-auth'

function getServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  )
}

function getFileType(mimeType: string): 'image' | 'video' | 'graphic' {
  if (mimeType.startsWith('video/')) return 'video'
  if (mimeType.startsWith('image/')) return 'image'
  return 'graphic'
}

function getExtension(filename: string): string {
  const parts = filename.split('.')
  return parts.length > 1 ? parts[parts.length - 1].toLowerCase() : 'bin'
}

export async function POST(request: NextRequest) {
  const auth = await requireApiUser()
  if (auth.response) return auth.response

  try {
    const formData = await request.formData()

    const file         = formData.get('file')         as File | null
    const eventId      = formData.get('event_id')     as string | null
    const exifRaw      = formData.get('exif_data')    as string | null
    const photographerRaw = formData.get('photographer') as string | null
    const photographer    = photographerRaw?.trim() || null
    const folderIdRaw     = formData.get('folder_id')   as string | null
    const folderId        = folderIdRaw?.trim() || null

    if (!file || !eventId) {
      return NextResponse.json(
        { error: 'Missing required fields: file and event_id' },
        { status: 400 }
      )
    }

    let exif: ExifData = {
      dateTaken: null,
      gpsLat: null,
      gpsLng: null,
      cameraMake: null,
      cameraModel: null,
      iso: null,
      aperture: null,
      shutterSpeed: null,
      focalLength: null,
      width: null,
      height: null,
    }

    if (exifRaw) {
      try {
        exif = JSON.parse(exifRaw) as ExifData
      } catch {
        // Proceed with empty EXIF if parse fails
      }
    }

    const supabase = getServiceClient()
    const uuid = randomUUID()
    const ext = getExtension(file.name)
    const storagePath = `${eventId}/${uuid}.${ext}`

    const { error: uploadError } = await supabase.storage
      .from('media')
      .upload(storagePath, file, {
        contentType: file.type,
        upsert: false,
      })

    if (uploadError) {
      console.error('Storage upload error:', uploadError)
      return NextResponse.json(
        { error: `Storage upload failed: ${uploadError.message}` },
        { status: 500 }
      )
    }

    const { data: mediaFile, error: dbError } = await supabase
      .from('media_files')
      .insert({
        event_id: eventId,
        filename: file.name,
        storage_path: storagePath,
        public_url: storagePath, // storage_path kept here for legacy column; use storage_path for signed URLs
        file_type: getFileType(file.type),
        file_size: file.size,
        width: exif.width,
        height: exif.height,
        exif_date_taken: exif.dateTaken,
        exif_gps_lat: exif.gpsLat,
        exif_gps_lng: exif.gpsLng,
        exif_camera_make: exif.cameraMake,
        exif_camera_model: exif.cameraModel,
        exif_iso: exif.iso,
        exif_aperture: exif.aperture,
        exif_shutter_speed: exif.shutterSpeed,
        exif_focal_length: exif.focalLength,
        quality_score: null,
        photographer,
        folder_id: folderId,
      })
      .select()
      .single()

    if (dbError) {
      console.error('DB insert error:', dbError)
      // Attempt to clean up the uploaded file
      await supabase.storage.from('media').remove([storagePath])
      return NextResponse.json(
        { error: `Database insert failed: ${dbError.message}` },
        { status: 500 }
      )
    }

    // ── Backup copy (fire-and-forget, never blocks the response) ─────────────
    // Re-use the same in-memory file bytes — no round-trip download needed.
    ;(async () => {
      try {
        const { error: backupError } = await supabase.storage
          .from('media-backup')
          .upload(storagePath, file, {
            contentType: file.type,
            upsert: true, // overwrite if a retry already landed it
          })

        if (backupError) {
          console.error('[backup] Storage copy failed:', backupError.message)
          return
        }

        // Record successful backup path in DB
        const { error: updateError } = await supabase
          .from('media_files')
          .update({ backup_storage_path: storagePath })
          .eq('id', (mediaFile as { id: string }).id)

        if (updateError) {
          console.error('[backup] DB update failed:', updateError.message)
        }
      } catch (err) {
        console.error('[backup] Unexpected error:', err)
      }
    })()

    return NextResponse.json({ mediaFile }, { status: 201 })
  } catch (err) {
    console.error('Unexpected upload error:', err)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
