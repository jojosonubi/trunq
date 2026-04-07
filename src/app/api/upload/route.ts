import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createHash } from 'crypto'
import type { ExifData } from '@/lib/exif'
import { requireApiUser } from '@/lib/api-auth'
import { createServiceClient } from '@/lib/supabase/service'
import { writeAudit } from '@/lib/audit'

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

/**
 * Builds the archive-standard filename:
 *   YYYYMMDD_EventSlug_Photographer_NNNN.ext
 */
function buildArchiveFilename(
  eventDate: string,
  eventName: string,
  photographer: string | null,
  sequenceNumber: number,
  ext: string,
): string {
  const dateStr          = eventDate.replace(/-/g, '')
  const eventSlug        = eventName.toLowerCase().replace(/[^a-z0-9]/g, '') || 'event'
  const photographerSlug = photographer
    ? photographer.toLowerCase().replace(/[^a-z0-9]/g, '') || 'unknown'
    : 'unknown'
  const seqStr           = sequenceNumber.toString().padStart(4, '0')
  return `${dateStr}_${eventSlug}_${photographerSlug}_${seqStr}.${ext}`
}

export async function POST(request: NextRequest) {
  const auth = await requireApiUser()
  if (auth.response) return auth.response

  try {
    const contentLength = request.headers.get('content-length')
    console.log(`[upload] incoming request — content-length: ${contentLength ?? 'unknown'}`)

    const formData = await request.formData()

    const file            = formData.get('file')         as File | null
    const eventId         = formData.get('event_id')     as string | null
    const exifRaw         = formData.get('exif_data')    as string | null
    const photographerRaw = formData.get('photographer') as string | null
    const photographer    = photographerRaw?.trim() || null
    const folderIdRaw     = formData.get('folder_id')    as string | null
    const folderId        = folderIdRaw?.trim() || null

    if (!file || !eventId) {
      return NextResponse.json(
        { error: 'Missing required fields: file and event_id' },
        { status: 400 }
      )
    }

    console.log(`[upload] file="${file.name}" size=${file.size} type=${file.type} event=${eventId}`)

    let exif: ExifData = {
      dateTaken: null, gpsLat: null, gpsLng: null,
      cameraMake: null, cameraModel: null, iso: null,
      aperture: null, shutterSpeed: null, focalLength: null,
      width: null, height: null,
    }

    if (exifRaw) {
      try { exif = JSON.parse(exifRaw) as ExifData } catch { /* ignore */ }
    }

    const supabase = getServiceClient()
    const ext      = getExtension(file.name)

    // ── Buffer file bytes for checksum + upload ───────────────────────────────
    const fileBuffer = Buffer.from(await file.arrayBuffer())
    const fileHash   = createHash('sha256').update(fileBuffer).digest('hex')

    // ── Fetch event metadata + current file count in parallel ─────────────────
    const [eventRes, countRes] = await Promise.all([
      supabase.from('events').select('date, name').eq('id', eventId).single(),
      // Count ALL files ever uploaded to this event (including soft-deleted) so
      // the sequence number never collides with a storage path already in use.
      supabase
        .from('media_files')
        .select('id', { count: 'exact', head: true })
        .eq('event_id', eventId),
    ])

    const eventDate = eventRes.data?.date ?? new Date().toISOString().slice(0, 10)
    const eventName = eventRes.data?.name ?? 'event'
    const seq       = (countRes.count ?? 0) + 1

    // ── Build archive-standard filename and storage path ──────────────────────
    const originalFilename = file.name
    const archiveFilename  = buildArchiveFilename(eventDate, eventName, photographer, seq, ext)
    const storagePath      = `${eventId}/${archiveFilename}`

    // ── Upload to primary storage bucket ─────────────────────────────────────
    const { error: uploadError } = await supabase.storage
      .from('media')
      .upload(storagePath, fileBuffer, {
        contentType: file.type,
        upsert: false,
      })

    if (uploadError) {
      console.error('[upload] Storage upload error:', uploadError.message, { storagePath, fileSize: file.size })
      return NextResponse.json(
        { error: `Storage upload failed: ${uploadError.message}` },
        { status: 500 }
      )
    }

    console.log(`[upload] storage ok — path=${storagePath}`)

    // ── Insert media_files record ─────────────────────────────────────────────
    const { data: mediaFile, error: dbError } = await supabase
      .from('media_files')
      .insert({
        event_id:          eventId,
        filename:          archiveFilename,
        original_filename: originalFilename,
        file_hash:         fileHash,
        storage_path:      storagePath,
        public_url:        storagePath,
        file_type:         getFileType(file.type),
        file_size:         file.size,
        width:             exif.width,
        height:            exif.height,
        exif_date_taken:   exif.dateTaken,
        exif_gps_lat:      exif.gpsLat,
        exif_gps_lng:      exif.gpsLng,
        exif_camera_make:  exif.cameraMake,
        exif_camera_model: exif.cameraModel,
        exif_iso:          exif.iso,
        exif_aperture:     exif.aperture,
        exif_shutter_speed: exif.shutterSpeed,
        exif_focal_length: exif.focalLength,
        quality_score:     null,
        photographer,
        folder_id:         folderId,
      })
      .select()
      .single()

    if (dbError) {
      console.error('[upload] DB insert error:', dbError.message, { storagePath })
      await supabase.storage.from('media').remove([storagePath])
      return NextResponse.json(
        { error: `Database insert failed: ${dbError.message}` },
        { status: 500 }
      )
    }

    const fileId = (mediaFile as { id: string }).id

    // ── Audit log ─────────────────────────────────────────────────────────────
    const service = createServiceClient()
    await writeAudit(service, {
      userId:     auth.user.id,
      action:     'photo_uploaded',
      entityType: 'photo',
      entityId:   fileId,
      metadata: {
        filename:          archiveFilename,
        original_filename: originalFilename,
        event_id:          eventId,
        photographer:      photographer ?? 'unknown',
        file_hash:         fileHash,
        file_size:         file.size,
      },
    })

    // ── Backup copy (fire-and-forget) ─────────────────────────────────────────
    ;(async () => {
      try {
        const { error: backupError } = await supabase.storage
          .from('media-backup')
          .upload(storagePath, fileBuffer, {
            contentType: file.type,
            upsert: true,
          })

        if (backupError) {
          console.error('[backup] Storage copy failed:', backupError.message)
          return
        }

        const { error: updateError } = await supabase
          .from('media_files')
          .update({ backup_storage_path: storagePath })
          .eq('id', fileId)

        if (updateError) {
          console.error('[backup] DB update failed:', updateError.message)
        }
      } catch (err) {
        console.error('[backup] Unexpected error:', err)
      }
    })()

    return NextResponse.json({ mediaFile }, { status: 201 })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[upload] Unexpected error:', message, err)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
