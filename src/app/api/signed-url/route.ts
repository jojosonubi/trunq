import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { signStoragePaths } from '@/lib/supabase/storage'

/**
 * POST /api/signed-url
 * Body: { paths: string[] }
 * Returns: { [storagePath]: signedUrl }
 *
 * Used by client components (e.g. LiveFeedClient) that need signed URLs
 * for real-time or dynamically loaded files. Requires an authenticated session.
 */
export async function POST(request: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json() as { paths?: unknown }
  if (!Array.isArray(body.paths) || body.paths.length === 0) {
    return NextResponse.json({ error: 'Missing or empty paths array' }, { status: 400 })
  }

  const paths = (body.paths as unknown[]).filter((p): p is string => typeof p === 'string')
  const urlMap = await signStoragePaths(paths)
  return NextResponse.json(Object.fromEntries(urlMap))
}
