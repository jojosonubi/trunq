import {
  BedrockRuntimeClient,
  InvokeModelCommand,
} from '@aws-sdk/client-bedrock-runtime'
import sharp from 'sharp'

const MODEL_ID  = 'amazon.titan-embed-image-v1'
const EMBED_DIM = 1024

// Titan Multimodal is not available in eu-west-2 (this project's Rekognition
// region) — pin us-east-1 explicitly and never inherit AWS_REGION.
const BEDROCK_REGION = 'us-east-1'

// Titan MM text input is capped at ~128 tokens; truncate defensively.
const MAX_TEXT_CHARS = 512

// Titan MM image input caps at 2048px / 25MB; 768px inside-fit is ample for
// retrieval quality and keeps payloads ~50-100KB.
const EMBED_IMAGE_PX = 768

// Singleton — reused across warm invocations (same pattern as rekognition.ts)
let _client: BedrockRuntimeClient | null = null

function getClient(): BedrockRuntimeClient {
  if (!_client) {
    _client = new BedrockRuntimeClient({
      region:      BEDROCK_REGION,
      credentials: {
        accessKeyId:     process.env.AWS_ACCESS_KEY_ID!,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
      },
      maxAttempts: 5,
      retryMode:   'adaptive', // absorbs ThrottlingException bursts
    })
  }
  return _client
}

async function invoke(body: Record<string, unknown>): Promise<number[]> {
  const res = await getClient().send(new InvokeModelCommand({
    modelId:     MODEL_ID,
    contentType: 'application/json',
    accept:      'application/json',
    body: JSON.stringify({ ...body, embeddingConfig: { outputEmbeddingLength: EMBED_DIM } }),
  }))
  const parsed = JSON.parse(new TextDecoder().decode(res.body)) as {
    embedding?: number[]
    message?:   string
  }
  if (!parsed.embedding || parsed.embedding.length !== EMBED_DIM) {
    throw new Error(`[bedrock] bad embedding response: ${parsed.message ?? 'missing embedding'}`)
  }
  return parsed.embedding
}

/** Embed a base64-encoded JPEG into the Titan joint text+image space. */
export async function embedImage(base64Jpeg: string): Promise<number[]> {
  return invoke({ inputImage: base64Jpeg })
}

/** Embed a text query into the same space as embedImage. */
export async function embedText(text: string): Promise<number[]> {
  return invoke({ inputText: text.slice(0, MAX_TEXT_CHARS) })
}

/**
 * Normalise raw image bytes for embedding: honour EXIF orientation, resize to
 * a full-frame 768px inside fit (NOT the 600x600 attention-crop thumbnail —
 * that crop can discard subjects at frame edges), and return base64 JPEG.
 */
export async function prepareImageForEmbedding(buf: Buffer): Promise<string> {
  const jpeg = await sharp(buf)
    .rotate()
    .resize({ width: EMBED_IMAGE_PX, height: EMBED_IMAGE_PX, fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 80 })
    .toBuffer()
  return jpeg.toString('base64')
}
