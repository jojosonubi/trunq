import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { signStoragePathSized, type ThumbSize } from '@/lib/supabase/storage'

// Same-origin image proxy for public shares. The page never exposes Supabase
// URLs — every image is served from this share-scoped route, so:
//   - revoking the share kills every image URL instantly
//   - a copied URL pasted into a new tab (Sec-Fetch-Dest: document) redirects
//     to the gallery instead of serving the file
//   - other sites can't hotlink (cross-site fetch metadata + CORP header)
// Screenshots/DevTools can't be prevented — this blocks casual URL copying.

function isBlockedFetch(req: NextRequest): 'navigate' | 'hotlink' | null {
  const dest = req.headers.get('sec-fetch-dest')
  const site = req.headers.get('sec-fetch-site')
  if (dest === 'document') return 'navigate'          // pasted/opened directly
  if (site === 'cross-site') return 'hotlink'         // embedded on another site
  if (!dest) {
    // No fetch metadata (older browsers/tools): fall back to referer host check.
    const ref = req.headers.get('referer')
    if (ref) {
      try { if (new URL(ref).host !== req.nextUrl.host) return 'hotlink' } catch { /* ignore */ }
    }
  }
  return null
}

export async function GET(
  req: NextRequest,
  { params }: { params: { token: string; photoId: string } }
) {
  const blocked = isBlockedFetch(req)
  if (blocked === 'navigate') {
    return NextResponse.redirect(new URL(`/s/${params.token}`, req.nextUrl.origin))
  }
  if (blocked === 'hotlink') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const size: ThumbSize = req.nextUrl.searchParams.get('size') === 'full' ? 'full' : 'card'

  const supabase = createServiceClient()
  const { data: share } = await supabase
    .from('public_shares')
    .select('kind, target_id')
    .eq('token', params.token)
    .is('revoked_at', null)
    .maybeSingle()
  if (!share) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // Membership check: the photo must belong to the shared target.
  let row: { storage_path: string; display_path: string | null } | null = null
  if (share.kind === 'collection') {
    const { data } = await supabase
      .from('collection_items')
      .select('media_files(storage_path, display_path)')
      .eq('collection_id', share.target_id)
      .eq('media_file_id', params.photoId)
      .maybeSingle()
    row = (data?.media_files as unknown as typeof row) ?? null
  } else {
    const { data } = await supabase
      .from('media_files')
      .select('storage_path, display_path')
      .eq('id', params.photoId)
      .eq('event_id', share.target_id)
      .is('deleted_at', null)
      .maybeSingle()
    row = data ?? null
  }
  if (!row) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // Sign a short-lived internal URL and stream the bytes through.
  const signed = await signStoragePathSized(row, size, { aspect: 'preserve' }, 300)
  if (!signed) return NextResponse.json({ error: 'Failed to load image' }, { status: 502 })

  const upstream = await fetch(signed)
  if (!upstream.ok || !upstream.body) {
    return NextResponse.json({ error: 'Failed to load image' }, { status: 502 })
  }

  return new NextResponse(upstream.body, {
    headers: {
      'Content-Type':                upstream.headers.get('content-type') ?? 'image/jpeg',
      // Browser-only caching: keeps repeat views fast without letting a shared
      // cache serve images after the share is revoked.
      'Cache-Control':               'private, max-age=3600',
      'Cross-Origin-Resource-Policy': 'same-origin',
      'X-Content-Type-Options':      'nosniff',
      'Content-Disposition':         'inline',
    },
  })
}
