import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { getShareSession } from '@/lib/share-session'
import { signMediaFiles } from '@/lib/supabase/storage'

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const session = await getShareSession(id)
  if (!session) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  const supabase = createServiceClient()

  // Validate the link
  const { data: link } = await supabase
    .from('share_links')
    .select('id, project_id, folder_id, is_active, expires_at')
    .eq('id', id)
    .single()

  if (!link || !link.is_active) {
    return NextResponse.json({ error: 'Link not found' }, { status: 404 })
  }
  if (link.expires_at && new Date(link.expires_at) < new Date()) {
    return NextResponse.json({ error: 'Link expired' }, { status: 410 })
  }

  // Fetch media
  let query = supabase
    .from('media_files')
    .select('id, storage_path, original_filename, score, tagging_status, folder_id, photographer')
    .eq('project_id', link.project_id)
    .is('deleted_at', null)
    .order('sequence_number', { ascending: true })

  if (link.folder_id) {
    query = query.eq('folder_id', link.folder_id)
  }

  const { data: files, error } = await query
  if (error || !files) {
    return NextResponse.json({ error: 'Failed to load media' }, { status: 500 })
  }

  const signed = await signMediaFiles(files)

  // Attach any existing reviews for this session's email
  const reviewerEmail = session.email
  let reviewMap: Record<string, { status: string; comment: string | null }> = {}

  if (reviewerEmail) {
    const { data: reviews } = await supabase
      .from('image_reviews')
      .select('media_id, status, comment')
      .eq('share_link_id', id)
      .eq('reviewer_email', reviewerEmail)

    if (reviews) {
      for (const r of reviews) {
        reviewMap[r.media_id] = { status: r.status, comment: r.comment }
      }
    }
  }

  const result = signed.map((f) => ({
    ...f,
    review: reviewMap[f.id] ?? null,
  }))

  return NextResponse.json({
    media:          result,
    hasWriteAccess: session.hasWriteAccess,
    email:          session.email,
  })
}
