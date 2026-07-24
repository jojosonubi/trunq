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
// Supabase createSignedUrls silently caps at 1000 paths per call.
// Chunk to avoid the cap; Promise.all preserves chunk order.
const CHUNK_SIZE = 1000

export async function signStoragePaths(
  paths: string[],
  expiresIn = DEFAULT_TTL,
): Promise<Map<string, string>> {
  if (paths.length === 0) return new Map()
  const supabase = createServiceClient()

  const chunks: string[][] = []
  for (let i = 0; i < paths.length; i += CHUNK_SIZE) {
    chunks.push(paths.slice(i, i + CHUNK_SIZE))
  }

  const responses = await Promise.all(
    chunks.map((batch) => supabase.storage.from(MEDIA_BUCKET).createSignedUrls(batch, expiresIn))
  )

  const map = new Map<string, string>()
  for (const { data, error } of responses) {
    if (error) { console.error('[storage] signStoragePaths chunk failed:', error.message); continue }
    for (const item of (data ?? [])) {
      if (item.signedUrl && item.path) map.set(item.path, item.signedUrl)
    }
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
        // Only include height when explicitly provided.
        // Callers that want a square crop (aspect:'square') pass height:width explicitly
        // via signStoragePathsSized, so those are unaffected.
        ...(options.height != null ? { height: options.height } : {}),
        quality: options.quality ?? 75,
        // Width-only + 'cover' does NOT preserve aspect ratio: Supabase keeps the
        // original height and crops a width-px-wide full-height slice (verified:
        // 3089x2048 source → 800x2048). Width-only must use 'contain', which
        // scales to the width and preserves aspect (→ 800x530).
        resize:  options.height != null ? (options.resize ?? 'cover') : 'contain',
      },
    })
  if (error || !data?.signedUrl) {
    console.error('[storage] signStoragePathThumbnail failed:', path, error?.message)
    return null
  }
  return data.signedUrl
}


// ─── Named thumbnail sizes ────────────────────────────────────────────────────

/**
 * Named thumbnail sizes used across the app.
 * Always reference these by name — never pass ad-hoc width/quality numbers.
 *
 *   tiny  — ≤80px cells (search results 48px, social strip 40px)
 *   thumb — 120–250px cells (cover picker, share grid, recent strip)
 *   card  — grid cards at ~25–50vw on desktop (project/event covers, media grid, queue, delivery, search results)
 *   full  — lightbox / max-display (fullscreen viewing)
 */
export const THUMB_SIZES = {
  tiny:  { width: 120,  quality: 75 },
  thumb: { width: 400,  quality: 80 },
  card:  { width: 800,  quality: 80 },
  full:  { width: 2000, quality: 85 },
} as const

export type ThumbSize = keyof typeof THUMB_SIZES

/** A media_files row (or minimal subset) that carries an optional display derivative. */
export interface MediaFileRef {
  storage_path: string
  display_path: string | null
}

/**
 * Returns the path that should be used for display / image transforms.
 * Falls back to storage_path when display_path is null (old rows, non-image files).
 */
export function getDisplayPath(row: MediaFileRef): string {
  return row.display_path ?? row.storage_path
}

/** Accepts a bare path string or a MediaFileRef. Normalises to the display path. */
type PathOrRef = string | MediaFileRef

function resolveDisplayPath(input: PathOrRef): string {
  if (typeof input === 'string') return input
  return getDisplayPath(input)
}

/**
 * Whether the input carries a usable display derivative (a small, transform-safe
 * image). When false, resolveDisplayPath falls back to the full-resolution
 * original, which can exceed Supabase's render limits (25MB / 50MP) and 422.
 * Bare path strings are assumed already-resolved and transform-safe.
 */
function hasDisplayDerivative(input: PathOrRef): boolean {
  if (typeof input === 'string') return true
  return input.display_path != null
}

/**
 * For signStoragePathsSized the map is keyed by storage_path so callers can
 * look up URLs by storage_path regardless of whether a display derivative exists.
 */
export async function signStoragePathSized(
  pathOrRef: PathOrRef,
  size: ThumbSize,
  options: { resize?: 'cover' | 'contain'; aspect?: 'square' | 'preserve' } = {},
  expiresIn?: number,
): Promise<string | null> {
  const { width, quality } = THUMB_SIZES[size]
  // No display derivative → the source is the full-resolution original, which can
  // exceed Supabase's render limits and 422. Serve a plain (untransformed) signed
  // object URL so it degrades to a working, heavier image instead of a broken one.
  if (!hasDisplayDerivative(pathOrRef)) {
    return (await signStoragePath(resolveDisplayPath(pathOrRef), expiresIn ?? DEFAULT_TTL)) || null
  }
  return signStoragePathThumbnail(
    resolveDisplayPath(pathOrRef),
    {
      width,
      quality,
      ...(options.aspect === 'preserve' ? {} : { height: width }),
      resize: options.resize ?? 'cover',
    },
    expiresIn,
  )
}

/**
 * Batch-sign an array of paths or MediaFileRef objects.
 * The returned Map is always keyed by storage_path, so existing callers
 * that look up by storage_path continue to work unchanged.
 */
export async function signStoragePathsSized(
  inputs: PathOrRef[],
  size: ThumbSize,
  options: { resize?: 'cover' | 'contain'; aspect?: 'square' | 'preserve' } = {},
  expiresIn?: number,
): Promise<Map<string, string>> {
  if (inputs.length === 0) return new Map()

  const { width, quality } = THUMB_SIZES[size]
  const thumbOpts = {
    width,
    quality,
    ...(options.aspect === 'preserve' ? {} : { height: width }),
    resize: options.resize ?? ('cover' as const),
  }

  const results = await Promise.all(
    inputs.map(async (input) => {
      const storagePath  = typeof input === 'string' ? input : input.storage_path
      const displayPath  = resolveDisplayPath(input)
      // No display derivative → avoid transforming the oversized original (would
      // 422 past Supabase's 25MB/50MP limit); serve a plain signed object URL.
      const url = hasDisplayDerivative(input)
        ? await signStoragePathThumbnail(displayPath, thumbOpts, expiresIn)
        : (await signStoragePath(displayPath, expiresIn ?? DEFAULT_TTL)) || null
      return [storagePath, url] as const
    })
  )

  const map = new Map<string, string>()
  for (const [storagePath, url] of results) {
    if (url) map.set(storagePath, url)
  }
  return map
}

export function transformUrlSized(url: string, size: ThumbSize): string {
  return transformUrl(url, THUMB_SIZES[size].width, THUMB_SIZES[size].quality)
}

// ─────────────────────────────────────────────────────────────────────────────

/**
 * Attach a signed `signed_url` field to every file.
 * Signs display_path when available (avoids >25MB transform failures on raw originals).
 * The urlMap is keyed by display_path (or storage_path as fallback), so the lookup
 * below uses the same key used for signing.
 */
export async function signMediaFiles<T extends { storage_path: string; display_path?: string | null }>(
  files: T[],
  expiresIn = DEFAULT_TTL,
): Promise<(T & { signed_url: string })[]> {
  if (files.length === 0) return []
  const paths = files.map((f) => f.display_path ?? f.storage_path)
  const urlMap = await signStoragePaths(paths, expiresIn)
  return files.map((f) => ({
    ...f,
    signed_url: urlMap.get(f.display_path ?? f.storage_path) ?? '',
  }))
}
