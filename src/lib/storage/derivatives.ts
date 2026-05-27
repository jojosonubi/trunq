import sharp from 'sharp'

const MAX_DISPLAY_BYTES = 20 * 1024 * 1024  // 20 MB
const LONG_EDGE         = 4000

/**
 * Derive the display-derivative storage path from the original path.
 * e.g. "event-id/20260523_foo_0001.jpg" → "event-id/20260523_foo_0001_display.jpg"
 */
function deriveDisplayPath(originalPath: string): string {
  const lastDot = originalPath.lastIndexOf('.')
  if (lastDot === -1) return `${originalPath}_display`
  return `${originalPath.slice(0, lastDot)}_display${originalPath.slice(lastDot)}`
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
  const path = deriveDisplayPath(originalPath)

  for (const quality of [85, 80, 75]) {
    const buffer = await sharp(originalBuffer)
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
