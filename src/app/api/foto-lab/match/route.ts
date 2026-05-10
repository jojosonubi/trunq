/**
 * POST /api/foto-lab/match
 *
 * Public endpoint (no auth). Kiosk sends a selfie, we return matching photos
 * from the Recess archive using AWS Rekognition SearchFacesByImage.
 *
 * PRIVACY: selfie bytes are NEVER persisted — they go to Rekognition and
 * are discarded. Only metadata (match count, similarity, duration, hashed IP)
 * is written to foto_lab_searches.
 */

import { NextRequest, NextResponse } from 'next/server'
import {
  RekognitionClient,
  SearchFacesByImageCommand,
  InvalidParameterException,
  InvalidImageFormatException,
  ImageTooLargeException,
  ProvisionedThroughputExceededException,
} from '@aws-sdk/client-rekognition'
import { createHash } from 'crypto'
import sharp from 'sharp'
import { createServiceClient } from '@/lib/supabase/service'
import { signStoragePath } from '@/lib/supabase/storage'

// ─── Constants ────────────────────────────────────────────────────────────────

const COLLECTION_ID       = 'recess-archive'
const RECESS_ORG_ID       = '2b557660-6bb3-4d41-9b49-71e860681b9c'
const SIMILARITY_THRESHOLD = Number(process.env.FOTO_LAB_SIMILARITY_THRESHOLD ?? 75)
const MAX_FACES_RETURNED  = 100
const MAX_PHOTOS_RETURNED = 50
const SIGNED_URL_TTL      = 3600  // 1 hour
const RESIZE_THRESHOLD    = 4 * 1024 * 1024  // 4MB

// ─── Rekognition singleton ────────────────────────────────────────────────────

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

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Hash the client IP with a daily rotating salt for analytics without tracking. */
function hashIp(ip: string): string {
  const salt = new Date().toISOString().slice(0, 10)  // 'YYYY-MM-DD' UTC
  return createHash('sha256').update(ip + salt).digest('hex')
}

function getClientIp(request: NextRequest): string | null {
  const forwarded = request.headers.get('x-forwarded-for')
  if (forwarded) return forwarded.split(',')[0].trim()
  const real = request.headers.get('x-real-ip')
  return real ?? null
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface MatchResult {
  media_file_id: string
  similarity:    number
  thumbnail_url: string
  full_url:      string
  photographer:  string | null
  taken_at:      string | null
  event_id:      string | null
}

// ─── Handler ──────────────────────────────────────────────────────────────────

export async function POST(request: NextRequest): Promise<NextResponse> {
  const startMs  = Date.now()
  const service  = createServiceClient()
  const clientIp = getClientIp(request)
  const ipHash   = clientIp ? hashIp(clientIp) : null

  // Helper: insert one row into foto_lab_searches on every exit path
  async function logSearch(fields: {
    no_face_detected: boolean
    match_count:      number
    top_similarity:   number | null
    error:            string | null
  }): Promise<string | null> {
    const duration = Date.now() - startMs
    const { data, error } = await service
      .from('foto_lab_searches')
      .insert({
        organisation_id:  RECESS_ORG_ID,
        client_ip_hash:   ipHash,
        no_face_detected: fields.no_face_detected,
        match_count:      fields.match_count,
        top_similarity:   fields.top_similarity,
        threshold_used:   SIMILARITY_THRESHOLD,
        duration_ms:      duration,
        error:            fields.error,
      })
      .select('id')
      .single()
    if (error) console.error('[foto-lab/match] log insert failed:', error)
    return data?.id ?? null
  }

  // ── 1. Parse body ───────────────────────────────────────────────────────────
  let body: { image?: unknown }
  try {
    body = await request.json()
  } catch {
    const searchId = await logSearch({ no_face_detected: false, match_count: 0, top_similarity: null, error: 'Invalid JSON body' })
    return NextResponse.json({ error: 'Invalid JSON body', search_id: searchId }, { status: 400 })
  }

  if (typeof body.image !== 'string' || !body.image) {
    const searchId = await logSearch({ no_face_detected: false, match_count: 0, top_similarity: null, error: 'Missing or invalid image field' })
    return NextResponse.json({ error: 'Missing or invalid image field', search_id: searchId }, { status: 400 })
  }

  // ── 2. Decode base64, strip data URL prefix ─────────────────────────────────
  let base64 = body.image
  const dataUrlMatch = base64.match(/^data:[^;]+;base64,/)
  if (dataUrlMatch) base64 = base64.slice(dataUrlMatch[0].length)

  let imageBytes: Uint8Array
  try {
    imageBytes = new Uint8Array(Buffer.from(base64, 'base64'))
  } catch {
    const searchId = await logSearch({ no_face_detected: false, match_count: 0, top_similarity: null, error: 'Failed to decode base64 image' })
    return NextResponse.json({ error: 'Failed to decode base64 image', search_id: searchId }, { status: 400 })
  }

  // ── 3. Resize if over 4MB ───────────────────────────────────────────────────
  if (imageBytes.length > RESIZE_THRESHOLD) {
    try {
      const resized = await sharp(imageBytes)
        .resize({ width: 2400, height: 2400, fit: 'inside', withoutEnlargement: true })
        .jpeg({ quality: 85 })
        .toBuffer()
      imageBytes = new Uint8Array(resized)
    } catch {
      const searchId = await logSearch({ no_face_detected: false, match_count: 0, top_similarity: null, error: 'Image resize failed' })
      return NextResponse.json({ error: 'Image resize failed', search_id: searchId }, { status: 400 })
    }
  }

  // ── 4–6. SearchFacesByImage ─────────────────────────────────────────────────
  let faceMatches: { FaceId?: string; Similarity?: number }[] = []

  try {
    const cmd = new SearchFacesByImageCommand({
      CollectionId:       COLLECTION_ID,
      Image:              { Bytes: imageBytes },
      FaceMatchThreshold: SIMILARITY_THRESHOLD,
      MaxFaces:           MAX_FACES_RETURNED,
      QualityFilter:      'AUTO',
    })
    const result = await getClient().send(cmd)
    faceMatches = result.FaceMatches ?? []
    console.log('[foto-lab/match] AWS returned face matches:', faceMatches.length)
    console.log('[foto-lab/match] First 3 face IDs:', faceMatches.slice(0, 3).map(m => m.FaceId))
  } catch (err) {
    // InvalidParameterException = no face detected in the selfie
    if (err instanceof InvalidParameterException) {
      const searchId = await logSearch({ no_face_detected: true, match_count: 0, top_similarity: null, error: null })
      return NextResponse.json({
        search_id:        searchId,
        matches:          [],
        total_matches:    0,
        no_face_detected: true,
        duration_ms:      Date.now() - startMs,
      })
    }
    if (err instanceof InvalidImageFormatException) {
      const msg = 'Invalid image format'
      const searchId = await logSearch({ no_face_detected: false, match_count: 0, top_similarity: null, error: msg })
      return NextResponse.json({ error: msg, search_id: searchId }, { status: 400 })
    }
    if (err instanceof ImageTooLargeException) {
      const msg = 'Image too large'
      const searchId = await logSearch({ no_face_detected: false, match_count: 0, top_similarity: null, error: msg })
      return NextResponse.json({ error: msg, search_id: searchId }, { status: 400 })
    }
    if (err instanceof ProvisionedThroughputExceededException) {
      const msg = 'Service busy — try again shortly'
      const searchId = await logSearch({ no_face_detected: false, match_count: 0, top_similarity: null, error: msg })
      return NextResponse.json({ error: msg, search_id: searchId }, { status: 503 })
    }
    const msg = (err instanceof Error ? err.message : String(err)).slice(0, 500)
    console.error('[foto-lab/match] Rekognition error:', msg)
    const searchId = await logSearch({ no_face_detected: false, match_count: 0, top_similarity: null, error: msg })
    return NextResponse.json({ error: 'Search failed', search_id: searchId }, { status: 500 })
  }

  // ── 7. No matches ───────────────────────────────────────────────────────────
  if (faceMatches.length === 0) {
    const searchId = await logSearch({ no_face_detected: false, match_count: 0, top_similarity: null, error: null })
    return NextResponse.json({
      search_id:        searchId,
      matches:          [],
      total_matches:    0,
      no_face_detected: false,
      duration_ms:      Date.now() - startMs,
    })
  }

  // Build faceId → best similarity map (a photo can have multiple faces indexed)
  const faceSimMap = new Map<string, number>()
  for (const m of faceMatches) {
    if (m.FaceId) faceSimMap.set(m.FaceId, m.Similarity ?? 0)
  }
  const matchedFaceIds = [...faceSimMap.keys()]

  // ── 8. Query media_files ────────────────────────────────────────────────────
  console.log('[foto-lab/match] Querying media_files with', matchedFaceIds.length, 'face IDs')
  console.log('[foto-lab/match] First 3 IDs being queried:', matchedFaceIds.slice(0, 3))
  const { data: photos, error: photosErr } = await service
    .from('media_files')
    .select('id, storage_path, rekognition_face_ids, photographer, exif_date_taken, event_id, thumbnail_url')
    .overlaps('rekognition_face_ids', matchedFaceIds)
    .is('deleted_at', null)
    .eq('file_type', 'image')
  console.log('[foto-lab/match] media_files query result:', {
    photoCount:   photos?.length ?? 0,
    error:        photosErr?.message,
    errorCode:    photosErr?.code,
    errorDetails: photosErr?.details,
  })

  if (!photos || photos.length === 0) {
    const searchId = await logSearch({ no_face_detected: false, match_count: 0, top_similarity: null, error: null })
    return NextResponse.json({
      search_id:        searchId,
      matches:          [],
      total_matches:    0,
      no_face_detected: false,
      duration_ms:      Date.now() - startMs,
    })
  }

  // ── 9–10. Score and sort ────────────────────────────────────────────────────
  const scored = photos
    .map((photo) => {
      const facesOnPhoto: string[] = photo.rekognition_face_ids ?? []
      // Use the highest similarity among all faces on this photo
      const bestSim = facesOnPhoto.reduce((max, fid) => {
        const sim = faceSimMap.get(fid) ?? 0
        return sim > max ? sim : max
      }, 0)
      return { photo, similarity: bestSim }
    })
    .filter(({ similarity }) => similarity > 0)
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, MAX_PHOTOS_RETURNED)

  const topSimilarity = scored[0]?.similarity ?? null

  // ── 11. Sign URLs ───────────────────────────────────────────────────────────
  const matches: MatchResult[] = await Promise.all(
    scored.map(async ({ photo, similarity }) => {
      const fullUrl      = await signStoragePath(photo.storage_path, SIGNED_URL_TTL)
      const thumbnailUrl = photo.thumbnail_url
        ? await signStoragePath(photo.thumbnail_url, SIGNED_URL_TTL)
        : fullUrl
      return {
        media_file_id: photo.id,
        similarity:    Math.round(similarity * 100) / 100,
        thumbnail_url: thumbnailUrl,
        full_url:      fullUrl,
        photographer:  photo.photographer ?? null,
        taken_at:      photo.exif_date_taken ?? null,
        event_id:      photo.event_id ?? null,
      }
    })
  )

  // ── 12–13. Log search and respond ───────────────────────────────────────────
  const searchId = await logSearch({
    no_face_detected: false,
    match_count:      matches.length,
    top_similarity:   topSimilarity !== null ? Math.round(topSimilarity * 100) / 100 : null,
    error:    null,
  })

  return NextResponse.json({
    search_id:        searchId,
    matches,
    total_matches:    matches.length,
    no_face_detected: false,
    duration_ms:      Date.now() - startMs,
  })
}
