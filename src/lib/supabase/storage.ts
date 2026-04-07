import { createServiceClient } from './service'

const MEDIA_BUCKET = 'media'
// 7-day TTL — covers the longest realistic working session; avoids mid-session expiry
const DEFAULT_EXPIRY = 7 * 24 * 60 * 60

/**
 * Append Supabase image transformation params to a URL.
 * Handles both signed URLs and public object URLs (future-proof for if the
 * bucket is ever made public).
 *
 * Signed:  /storage/v1/object/sign/   → /storage/v1/render/image/sign/
 * Public:  /storage/v1/object/public/ → /storage/v1/render/image/public/
 *
 * Never apply to download/export paths — those must stay full resolution.
 */
export function transformUrl(url: string, width: number, quality = 75): string {
  if (!url) return url

  for (const [from, to] of [
    ['/storage/v1/object/sign/',   '/storage/v1/render/image/sign/'],
    ['/storage/v1/object/public/', '/storage/v1/render/image/public/'],
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
 * Generate a signed URL for a single storage path.
 * Throws if Supabase returns an error.
 */
export async function signStoragePath(
  storagePath: string,
  expiresIn = DEFAULT_EXPIRY,
): Promise<string> {
  const supabase = createServiceClient()
  const { data, error } = await supabase.storage
    .from(MEDIA_BUCKET)
    .createSignedUrl(storagePath, expiresIn)
  if (error || !data) throw new Error(`Failed to sign path "${storagePath}": ${error?.message}`)
  return data.signedUrl
}

/**
 * Batch-sign an array of storage paths.
 * Returns a Map of storagePath → signedUrl.
 * Missing entries (e.g. Supabase returned no URL for a path) are omitted.
 */
export async function signStoragePaths(
  paths: string[],
  expiresIn = DEFAULT_EXPIRY,
): Promise<Map<string, string>> {
  if (paths.length === 0) return new Map()
  const supabase = createServiceClient()
  const { data, error } = await supabase.storage
    .from(MEDIA_BUCKET)
    .createSignedUrls(paths, expiresIn)
  if (error || !data) throw new Error(`Failed to batch-sign paths: ${error?.message}`)
  const map = new Map<string, string>()
  for (const item of data) {
    if (item.signedUrl && item.path) map.set(item.path, item.signedUrl)
  }
  return map
}

/**
 * Attach a `signed_url` field to every file in the array using a single
 * batch request. Files whose storage_path cannot be signed get an empty string.
 */
export async function signMediaFiles<T extends { storage_path: string }>(
  files: T[],
  expiresIn = DEFAULT_EXPIRY,
): Promise<(T & { signed_url: string })[]> {
  if (files.length === 0) return []
  const paths = files.map((f) => f.storage_path)
  const urlMap = await signStoragePaths(paths, expiresIn)
  return files.map((f) => ({
    ...f,
    signed_url: urlMap.get(f.storage_path) ?? '',
  }))
}
