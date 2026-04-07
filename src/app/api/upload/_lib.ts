/**
 * Shared utilities for the upload pipeline.
 * Used by /api/upload, /api/upload/presign, and /api/upload/complete.
 */

import { createServiceClient } from '@/lib/supabase/service'

export type ServiceClient = ReturnType<typeof createServiceClient>

export function getFileType(mimeType: string): 'image' | 'video' | 'graphic' {
  if (mimeType.startsWith('video/')) return 'video'
  if (mimeType.startsWith('image/')) return 'image'
  return 'graphic'
}

export function getExtension(filename: string): string {
  const parts = filename.split('.')
  return parts.length > 1 ? parts[parts.length - 1].toLowerCase() : 'bin'
}

/**
 * Builds the archive-standard filename:
 *   YYYYMMDD_EventSlug_Photographer_NNNN.ext
 */
export function buildArchiveFilename(
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

/**
 * Resolves a unique archive filename for this event.
 * If baseFilename already exists in media_files, appends _v2, _v3 … until unique.
 * Returns { filename, isBase } — isBase is true when no suffix was needed.
 */
export async function resolveUniqueFilename(
  supabase: ServiceClient,
  eventId: string,
  baseFilename: string,
): Promise<{ filename: string; isBase: boolean }> {
  const ext  = baseFilename.includes('.') ? baseFilename.slice(baseFilename.lastIndexOf('.')) : ''
  const stem = baseFilename.slice(0, baseFilename.length - ext.length)

  const { data } = await supabase
    .from('media_files')
    .select('filename')
    .eq('event_id', eventId)
    .like('filename', `${stem}%`)

  const existing = new Set((data ?? []).map((r: { filename: string }) => r.filename))

  if (!existing.has(baseFilename)) return { filename: baseFilename, isBase: true }

  for (let v = 2; v <= 999; v++) {
    const candidate = `${stem}_v${v}${ext}`
    if (!existing.has(candidate)) return { filename: candidate, isBase: false }
  }

  return { filename: `${stem}_${Date.now()}${ext}`, isBase: false }
}
