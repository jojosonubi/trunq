import { createServiceClient } from './service'

const MEDIA_BUCKET = 'media'

/**
 * Append Supabase image transformation params to a storage URL.
 * Handles both public object URLs and legacy signed URLs.
 *
 * Public:  /storage/v1/object/public/ → /storage/v1/render/image/public/
 * Signed:  /storage/v1/object/sign/   → /storage/v1/render/image/sign/
 *
 * Never apply to download/export paths — those must stay full resolution.
 */
export function transformUrl(url: string, width: number, quality = 75): string {
  if (!url) return url

  // Public URL path (preferred — no expiry)
  const pub = url.replace('/storage/v1/object/public/', '/storage/v1/render/image/public/')
  if (pub !== url) {
    try {
      const u = new URL(pub)
      u.searchParams.set('width', String(width))
      u.searchParams.set('quality', String(quality))
      return u.toString()
    } catch {
      return url
    }
  }

  // Legacy signed URL path (fallback for any signed URLs still in the DB)
  const signed = url.replace('/storage/v1/object/sign/', '/storage/v1/render/image/sign/')
  if (signed !== url) {
    try {
      const u = new URL(signed)
      u.searchParams.set('width', String(width))
      u.searchParams.set('quality', String(quality))
      return u.toString()
    } catch {
      return url
    }
  }

  return url
}

/**
 * Get the permanent public URL for a single storage path.
 * Synchronous — no network call, no expiry.
 */
export function getPublicUrl(storagePath: string): string {
  const supabase = createServiceClient()
  return supabase.storage.from(MEDIA_BUCKET).getPublicUrl(storagePath).data.publicUrl
}

/**
 * Get a public URL for a single storage path (async signature kept for
 * call-site compatibility with the old signStoragePath).
 * The expiresIn parameter is accepted but ignored — public URLs don't expire.
 */
export async function signStoragePath(storagePath: string, _expiresIn?: number): Promise<string> {
  return getPublicUrl(storagePath)
}

/**
 * Build a Map of storagePath → public URL for an array of paths.
 * Replaces the old batch-signed implementation — no Supabase API call needed.
 * The expiresIn parameter is accepted but ignored — public URLs don't expire.
 */
export async function signStoragePaths(paths: string[], _expiresIn?: number): Promise<Map<string, string>> {
  if (paths.length === 0) return new Map()
  const supabase = createServiceClient()
  const map = new Map<string, string>()
  for (const path of paths) {
    map.set(path, supabase.storage.from(MEDIA_BUCKET).getPublicUrl(path).data.publicUrl)
  }
  return map
}

/**
 * Attach a `signed_url` field (now a permanent public URL) to every file
 * in the array. Drop-in replacement for the old signed implementation.
 */
export async function signMediaFiles<T extends { storage_path: string }>(
  files: T[],
  _expiresIn?: number,
): Promise<(T & { signed_url: string })[]> {
  if (files.length === 0) return []
  const supabase = createServiceClient()
  return files.map((f) => ({
    ...f,
    signed_url: supabase.storage.from(MEDIA_BUCKET).getPublicUrl(f.storage_path).data.publicUrl,
  }))
}
