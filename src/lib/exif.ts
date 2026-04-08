import exifr from 'exifr'

/**
 * Set the EXIF Orientation tag to 1 (normal/no-rotation) inside a JPEG file.
 * Operates on the raw bytes — does NOT re-encode or re-compress the image.
 * Returns the original File unchanged if:
 *   - the file is not a JPEG
 *   - no EXIF APP1 segment is found
 *   - the Orientation tag is already 1 or absent
 */
export async function neutralizeOrientation(file: File): Promise<File> {
  if (file.type !== 'image/jpeg' && file.type !== 'image/jpg') return file

  const buf   = await file.arrayBuffer()
  const view  = new DataView(buf)
  const bytes = new Uint8Array(buf)

  // Must start with JPEG SOI marker FF D8
  if (view.getUint16(0, false) !== 0xFFD8) return file

  let offset = 2
  while (offset + 4 <= bytes.length) {
    if (bytes[offset] !== 0xFF) break
    const marker = bytes[offset + 1]
    if (marker === 0xDA) break // SOS — image data begins, stop scanning

    const segLen = view.getUint16(offset + 2, false) // big-endian, includes length bytes

    if (marker === 0xE1 && offset + 10 <= bytes.length) {
      // Check for "Exif\0\0" identifier
      const id = String.fromCharCode(bytes[offset+4], bytes[offset+5], bytes[offset+6], bytes[offset+7], bytes[offset+8])
      if (id === 'Exif\0') {
        const tiff = offset + 10
        const le   = view.getUint16(tiff, false) === 0x4949 // 'II' = little-endian
        const ifd0 = tiff + view.getUint32(tiff + 4, le)
        const n    = view.getUint16(ifd0, le)

        for (let i = 0; i < n; i++) {
          const entry = ifd0 + 2 + i * 12
          if (view.getUint16(entry, le) === 0x0112) { // Orientation tag
            if (view.getUint16(entry + 8, le) === 1) return file // already normal
            view.setUint16(entry + 8, 1, le) // set to 1 = normal
            return new File([buf], file.name, { type: file.type, lastModified: file.lastModified })
          }
        }
      }
    }

    offset += 2 + segLen
  }

  return file
}

export interface ExifData {
  dateTaken: string | null
  gpsLat: number | null
  gpsLng: number | null
  cameraMake: string | null
  cameraModel: string | null
  iso: number | null
  aperture: number | null
  shutterSpeed: string | null
  focalLength: number | null
  width: number | null
  height: number | null
}

export async function extractExif(file: File): Promise<ExifData> {
  try {
    const data = await exifr.parse(file, {
      tiff: true,
      exif: true,
      gps: true,
    })
    if (!data) return emptyExif()

    let shutterSpeed: string | null = null
    if (data.ExposureTime) {
      const et = data.ExposureTime
      shutterSpeed = et < 1 ? `1/${Math.round(1 / et)}` : `${et}`
    }

    return {
      dateTaken: data.DateTimeOriginal ? new Date(data.DateTimeOriginal).toISOString() : null,
      gpsLat: data.latitude ?? null,
      gpsLng: data.longitude ?? null,
      cameraMake: data.Make ?? null,
      cameraModel: data.Model ?? null,
      iso: data.ISO ?? null,
      aperture: data.FNumber ?? null,
      shutterSpeed,
      focalLength: data.FocalLength ?? null,
      width: data.ImageWidth ?? data.ExifImageWidth ?? null,
      height: data.ImageHeight ?? data.ExifImageHeight ?? null,
    }
  } catch {
    return emptyExif()
  }
}

function emptyExif(): ExifData {
  return {
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
}
