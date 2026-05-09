import { createServiceClient } from './service'

const MEDIA_BUCKET = 'media'
const DEFAULT_TTL  = 60 * 60 * 24 * 7  // 7 days in seconds

/**
 * Append Supabase image transformation params to a storage URL.
 * Handles both public object URLs and signed URLs.
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
 * Return a signed URL for a single storage path.
 */
export async function signStoragePath(storagePath: string, expiresIn = DEFAULT_TTL): Promise<string> {
  const supabase = createServiceClient()
  const { data, error } = await supabase.storage
    .from(MEDIA_BUCKET)
    .createSignedUrl(storagePath, expiresIn)
  if (error || !data?.signedUrl) {
    console.error('[storage] signStoragePath failed:', storagePath, error?.message)
    return ''
  }
  return data.signedUrl
}

/**
 * Build a Map of storagePath → signed URL for an array of paths.
 * Uses the batch createSignedUrls API for efficiency.
 */
export async function signStoragePaths(
  paths: string[],
  expiresIn = DEFAULT_TTL,
): Promise<Map<string, string>> {
  if (paths.length === 0) return new Map()
  const supabase = createServiceClient()
  const { data, error } = await supabase.storage
    .from(MEDIA_BUCKET)
    .createSignedUrls(paths, expiresIn)
  if (error || !data) {
    console.error('[storage] signStoragePaths failed:', error?.message)
    return new Map()
  }
  const map = new Map<string, string>()
  for (const item of data) {
    if (item.signedUrl && item.path) map.set(item.path, item.signedUrl)
  }
  return map
}

// ─── Thumbnail helpers (Supabase image transform) ─────────────────────────────

interface ThumbnailOptions {
  width?:   number  // default 600
  height?:  number  // default 600
  quality?: number  // default 75
  resize?:  'cover' | 'contain' | 'fill'  // default 'cover'
}

/**
 * Sign a single storage path via the Supabase render (image transform) endpoint.
 * Returns null on failure rather than '' so callers can fall back to a full-res URL.
 */
export async function signStoragePathThumbnail(
  path: string,
  options: ThumbnailOptions = {},
  expiresIn = DEFAULT_TTL,
): Promise<string | null> {
  const supabase = createServiceClient()
  const { data, error } = await supabase.storage
    .from(MEDIA_BUCKET)
    .createSignedUrl(path, expiresIn, {
      transform: {
        width:   options.width   ?? 600,
        height:  options.height  ?? 600,
        quality: options.quality ?? 75,
        resize:  options.resize  ?? 'cover',
      },
    })
  if (error || !data?.signedUrl) {
    console.error('[storage] signStoragePathThumbnail failed:', path, error?.message)
    return null
  }
  return data.signedUrl
}

/**
 * Batch sign storage paths via the Supabase render (image transform) endpoint.
 * Falls back gracefully — paths that fail to sign are omitted from the map.
 */
export async function signStoragePathsThumbnail(
  paths: string[],
  options: ThumbnailOptions = {},
  expiresIn = DEFAULT_TTL,
): Promise<Map<string, string>> {
  if (paths.length === 0) return new Map()

  // Supabase's batch API doesn't support transform options, so we sign individually
  // but in parallel to keep latency low.
  const results = await Promise.all(
    paths.map(async (path) => {
      const url = await signStoragePathThumbnail(path, options, expiresIn)
      return [path, url] as const
    })
  )
  const map = new Map<string, string>()
  for (const [path, url] of results) {
    if (url) map.set(path, url)
  }
  return map
}

/**
 * Attach a signed `signed_url` field to every file.
 * Uses the batch createSignedUrls API.
 */
export async function signMediaFiles<T extends { storage_path: string }>(
  files: T[],
  expiresIn = DEFAULT_TTL,
): Promise<(T & { signed_url: string })[]> {
  if (files.length === 0) return []
  const paths = files.map((f) => f.storage_path)
  const urlMap = await signStoragePaths(paths, expiresIn)
  return files.map((f) => ({
    ...f,
    signed_url: urlMap.get(f.storage_path) ?? '',
  }))
}
