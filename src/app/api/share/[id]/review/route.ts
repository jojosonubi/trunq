import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { getShareSession } from '@/lib/share-session'

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const session = await getShareSession(id)

  if (!session || !session.hasWriteAccess) {
    return NextResponse.json({ error: 'Write access required' }, { status: 403 })
  }
  if (!session.email) {
    return NextResponse.json({ error: 'Email required for reviews' }, { status: 403 })
  }

  const { mediaId, status, comment } = await req.json() as {
    mediaId: string
    status:  'approved' | 'rejected' | 'pending'
    comment?: string
  }

  if (!mediaId || !['approved', 'rejected', 'pending'].includes(status)) {
    return NextResponse.json({ error: 'Invalid payload' }, { status: 400 })
  }

  const supabase = createServiceClient()

  const { error } = await supabase
    .from('image_reviews')
    .upsert(
      {
        media_id:       mediaId,
        share_link_id:  id,
        reviewer_email: session.email,
        status,
        comment:        comment ?? null,
        updated_at:     new Date().toISOString(),
      },
      { onConflict: 'media_id,share_link_id,reviewer_email' }
    )

  if (error) {
    return NextResponse.json({ error: 'Failed to save review' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
