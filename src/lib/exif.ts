import exifr from 'exifr'

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
