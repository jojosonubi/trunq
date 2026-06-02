import sharp from 'sharp'

const MAX_DISPLAY_BYTES = 20 * 1024 * 1024  // 20 MB
const LONG_EDGE         = 4000

/**
 * Derive a derivative storage path by inserting a suffix before the extension.
 * e.g. ("event/uuid.jpg", "_display") → "event/uuid_display.jpg"
 *      ("event/uuid.jpg", "_thumb")   → "event/uuid_thumb.jpg"
 */
function derivePath(originalPath: string, suffix: string): string {
  const lastDot = originalPath.lastIndexOf('.')
  if (lastDot === -1) return `${originalPath}${suffix}`
  return `${originalPath.slice(0, lastDot)}${suffix}${originalPath.slice(lastDot)}`
}

/**
 * Generates a downscaled JPEG derivative suitable for Supabase image transforms.
 *
 * - Resizes to ≤4000px long edge, aspect preserved, never upscales
 * - Encodes at JPEG quality 85; retries at 80 then 75 if result exceeds 20 MB
 * - Returns { buffer, path } where path has `_display` inserted before the extension
 *
 * Throws if sharp fails to process the image (corrupt / unsupported format).
 */
export async function generateDisplayDerivative(
  originalBuffer: Buffer,
  originalPath: string,
): Promise<{ buffer: Buffer; path: string }> {
  const path = derivePath(originalPath, '_display')

  for (const quality of [85, 80, 75]) {
    const buffer = await sharp(originalBuffer)
      .rotate()                        // auto-apply EXIF orientation before resize
      .resize({
        width:             LONG_EDGE,
        height:            LONG_EDGE,
        fit:               'inside',
        withoutEnlargement: true,
      })
      .jpeg({ quality })
      .toBuffer()

    if (buffer.length <= MAX_DISPLAY_BYTES || quality === 75) {
      return { buffer, path }
    }
    // else retry at lower quality
  }

  // TypeScript unreachable — loop always exits on quality === 75
  throw new Error('unreachable')
}

/**
 * Generates a 600×600 square JPEG thumbnail using Sharp's attention-based
 * smart crop. The algorithm finds the most visually interesting region
 * (faces, high-entropy areas) and centres the crop there.
 *
 * Returns { buffer, path } where path has `_thumb` inserted before the extension.
 * Throws if sharp fails to process the image (corrupt / unsupported format).
 */
export async function generateThumbnailDerivative(
  originalBuffer: Buffer,
  originalPath: string,
): Promise<{ buffer: Buffer; path: string }> {
  const path   = derivePath(originalPath, '_thumb')
  const buffer = await sharp(originalBuffer)
    .rotate()                                    // honour EXIF orientation first
    .resize(600, 600, { fit: 'cover', position: 'attention' })
    .jpeg({ quality: 80 })
    .toBuffer()
  return { buffer, path }
}
