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

  for (const [from, to] of [
    ['/storage/v1/object/public/', '/storage/v1/render/image/public/'],
    ['/storage/v1/object/sign/',   '/storage/v1/render/image/sign/'],
  ] as const) {
    const rendered = url.replace(from, to)
    if (rendered !== url) {
      try {
        const u = new URL(rendered)
        u.searchParams.set('width', String(width))
        u.searchParams.set('quality', String(quality))
        return u.toString()
      } catch {
        return url
      }
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
 * Return the public URL for a single path.
 * Async signature kept for call-site compatibility. expiresIn is ignored.
 */
export async function signStoragePath(storagePath: string, _expiresIn?: number): Promise<string> {
  return getPublicUrl(storagePath)
}

/**
 * Build a Map of storagePath → public URL for an array of paths.
 * expiresIn is accepted but ignored — public URLs don't expire.
 */
export async function signStoragePaths(
  paths: string[],
  _expiresIn?: number,
): Promise<Map<string, string>> {
  if (paths.length === 0) return new Map()
  const supabase = createServiceClient()
  const map = new Map<string, string>()
  for (const path of paths) {
    map.set(path, supabase.storage.from(MEDIA_BUCKET).getPublicUrl(path).data.publicUrl)
  }
  return map
}

/**
 * Attach a `signed_url` field (now a permanent public URL) to every file.
 * Drop-in replacement for the old signed implementation.
 * expiresIn is accepted but ignored — public URLs don't expire.
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
