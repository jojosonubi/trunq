import {
  RekognitionClient,
  IndexFacesCommand,
  InvalidImageFormatException,
  ImageTooLargeException,
  ProvisionedThroughputExceededException,
  InvalidParameterException,
  ResourceNotFoundException,
} from '@aws-sdk/client-rekognition'
import { createServiceClient } from '@/lib/supabase/service'
import { signStoragePath } from '@/lib/supabase/storage'

const COLLECTION_ID = 'recess-archive'

// Singleton — reused across warm invocations
let _client: RekognitionClient | null = null

function getClient(): RekognitionClient {
  if (!_client) {
    _client = new RekognitionClient({
      region:      process.env.AWS_REGION ?? 'eu-west-2',
      credentials: {
        accessKeyId:     process.env.AWS_ACCESS_KEY_ID!,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
      },
    })
  }
  return _client
}

/**
 * Index faces in a single media file into the Rekognition collection.
 * Downloads the image bytes via signed URL so the private bucket is never
 * exposed to Rekognition directly.
 *
 * Returns the list of FaceIds indexed (may be empty if no faces detected).
 * Throws with a descriptive message on failure.
 */
export async function indexFaceForMediaFile(mediaFileId: string): Promise<{ faceIds: string[] }> {
  const supabase = createServiceClient()

  const { data: mediaFile, error: fetchErr } = await supabase
    .from('media_files')
    .select('storage_path')
    .eq('id', mediaFileId)
    .single()

  if (fetchErr || !mediaFile) {
    throw new Error(`[rekognition] Media file not found: ${mediaFileId}`)
  }

  const signedUrl = await signStoragePath(mediaFile.storage_path, 300)
  if (!signedUrl) {
    throw new Error(`[rekognition] Failed to sign storage path for: ${mediaFileId}`)
  }

  // Download image bytes — Rekognition needs raw bytes, not a URL
  const imageRes = await fetch(signedUrl)
  if (!imageRes.ok) {
    throw new Error(`[rekognition] Image download failed (${imageRes.status}) for: ${mediaFileId}`)
  }
  const imageBytes = new Uint8Array(await imageRes.arrayBuffer())

  try {
    const cmd = new IndexFacesCommand({
      CollectionId:        COLLECTION_ID,
      ExternalImageId:     mediaFileId,
      Image:               { Bytes: imageBytes },
      MaxFaces:            15,
      QualityFilter:       'AUTO',
      DetectionAttributes: [],
    })

    const result = await getClient().send(cmd)
    const faceIds = (result.FaceRecords ?? [])
      .map(r => r.Face?.FaceId)
      .filter((id): id is string => !!id)

    return { faceIds }

  } catch (err) {
    if (err instanceof InvalidImageFormatException) {
      throw new Error(`[rekognition] Invalid image format for: ${mediaFileId}`)
    }
    if (err instanceof ImageTooLargeException) {
      throw new Error(`[rekognition] Image too large for: ${mediaFileId}`)
    }
    if (err instanceof ProvisionedThroughputExceededException) {
      throw new Error(`[rekognition] Throughput exceeded — back off and retry: ${mediaFileId}`)
    }
    if (err instanceof InvalidParameterException) {
      throw new Error(`[rekognition] Invalid parameter for: ${mediaFileId} — ${(err as Error).message}`)
    }
    if (err instanceof ResourceNotFoundException) {
      throw new Error(`[rekognition] Collection '${COLLECTION_ID}' not found`)
    }
    throw err
  }
}
