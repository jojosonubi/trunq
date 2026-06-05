// Called by recess.land /api/public/hero-pool to refresh signed URLs for hero pool photos.
// Uses a shared secret (X-Recess-Auth header) rather than user session auth.
import { NextRequest, NextResponse } from 'next/server'
import { signStoragePathThumbnail } from '@/lib/supabase/storage'

const TTL          = 7200  // 2 hours — outlives recess.land 5 min revalidation + CDN windows
const MAX_PATHS    = 100
const MEDIA_PREFIX = 'media/'

function isSafePath(path: string): boolean {
  // Reject traversal attempts and absolute paths before any Supabase call.
  if (path.startsWith('/'))        return false
  if (path.includes('..'))        return false
  if (!path.startsWith(MEDIA_PREFIX)) return false
  // TODO: validate that the second path segment (event UUID) matches a known
  // event in the DB. Skipped for now to keep scope tight; add when the
  // set of valid events can be cheaply enumerated or cached.
  return true
}

export async function POST(req: NextRequest) {
  // ── 1. Auth ───────────────────────────────────────────────────────────────────
  const expectedSecret = process.env.RECESS_LAND_SHARED_SECRET
  const providedSecret = req.headers.get('x-recess-auth')

  if (!expectedSecret || !providedSecret || providedSecret !== expectedSecret) {
    const ip = req.headers.get('x-forwarded-for') ?? req.headers.get('x-real-ip') ?? 'unknown'
    console.warn('[external/sign-media] 401 — auth failed | ip:', ip, '| header present:', !!providedSecret)
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // ── 2. Parse + validate body ──────────────────────────────────────────────────
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  if (
    typeof body !== 'object' || body === null ||
    !('paths' in body) ||
    !Array.isArray((body as { paths: unknown }).paths)
  ) {
    return NextResponse.json({ error: '`paths` must be a non-empty array' }, { status: 400 })
  }

  const paths = (body as { paths: unknown[] }).paths

  if (paths.length === 0) {
    return NextResponse.json({ error: '`paths` must not be empty' }, { status: 400 })
  }
  if (paths.length > MAX_PATHS) {
    return NextResponse.json({ error: `Too many paths — max ${MAX_PATHS}` }, { status: 400 })
  }
  if (paths.some((p) => typeof p !== 'string')) {
    return NextResponse.json({ error: 'All items in `paths` must be strings' }, { status: 400 })
  }

  const stringPaths = paths as string[]

  // Validate each path before signing anything.
  const invalidPath = stringPaths.find((p) => !isSafePath(p))
  if (invalidPath) {
    return NextResponse.json(
      { error: `Invalid path: "${invalidPath}". All paths must start with "media/", must not start with "/" or contain ".."` },
      { status: 400 },
    )
  }

  // ── 3. Sign in parallel ───────────────────────────────────────────────────────
  // Strip the "media/" bucket prefix before passing to the storage client.
  // Validation above requires it; the client already scopes to the media bucket,
  // so the path argument must be the object path within the bucket only.
  // Promise.allSettled — one signing failure must not abort the rest.
  const results = await Promise.allSettled(
    stringPaths.map((path) =>
      signStoragePathThumbnail(
        path.slice(MEDIA_PREFIX.length),
        { width: 800, quality: 80, resize: 'contain' },
        TTL,
      )
    )
  )

  // ── 4. Shape response — order preserved ───────────────────────────────────────
  let failCount = 0
  const signed = results.map((result, i) => {
    const path = stringPaths[i]
    if (result.status === 'fulfilled' && result.value) {
      return { path, url: result.value }
    }
    // Rejected or returned null/empty — log and return null so callers can fall back.
    const reason = result.status === 'rejected' ? String(result.reason) : 'signStoragePathThumbnail returned null'
    console.error('[external/sign-media] signing failed for path:', path, '|', reason)
    failCount++
    return { path, url: null }
  })

  console.log(`[external/sign-media] signed ${stringPaths.length - failCount}/${stringPaths.length} paths`)

  return NextResponse.json({ signed })
}
