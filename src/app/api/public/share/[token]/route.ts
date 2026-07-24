import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'

// Public no-auth share resolution. Paginated; returns same-origin PROXY image
// paths (/api/public/share/<token>/img/<id>) rather than signed Supabase URLs —
// no storage URL ever reaches the page, revoking kills every image instantly,
// and no signing happens at page-build time (see img/[photoId]/route.ts).
const PAGE_SIZE = 60

interface SharePhoto {
  id: string
  event_name: string
  event_date: string
  card_url: string
  description: string | null
}

function fmtDate(d?: string | null): string {
  if (!d) return ''
  return new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

type MediaRow = {
  id: string; event_id: string; storage_path: string; display_path: string | null
  description: string | null; events: { name?: string; date?: string } | null
}
const MEDIA_SELECT = 'id, event_id, storage_path, display_path, description, events(name, date)'

export async function GET(req: NextRequest, { params }: { params: { token: string } }) {
  const supabase = createServiceClient()

  const { data: share } = await supabase
    .from('public_shares')
    .select('kind, target_id')
    .eq('token', params.token)
    .is('revoked_at', null)
    .maybeSingle()

  if (!share) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const page = Math.max(0, Number(req.nextUrl.searchParams.get('page')) || 0)
  const from = page * PAGE_SIZE
  const to   = from + PAGE_SIZE - 1

  let title = ''
  let subtitle = ''
  let count = 0
  let rows: MediaRow[] = []

  if (share.kind === 'collection') {
    const { data: col } = await supabase.from('collections').select('name').eq('id', share.target_id).maybeSingle()
    if (!col) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    title = col.name

    const { count: total } = await supabase
      .from('collection_items')
      .select('media_file_id', { count: 'exact', head: true })
      .eq('collection_id', share.target_id)
    count = total ?? 0
    subtitle = `${count} photo${count !== 1 ? 's' : ''}`

    const { data: items } = await supabase
      .from('collection_items')
      .select(`added_at, media_files(${MEDIA_SELECT})`)
      .eq('collection_id', share.target_id)
      .order('added_at', { ascending: true })
      .range(from, to)
    rows = ((items ?? []) as unknown as { media_files: MediaRow | null }[])
      .map((i) => i.media_files)
      .filter((r): r is MediaRow => !!r)
  } else {
    const { data: ev } = await supabase.from('events').select('name, date, venue').eq('id', share.target_id).is('deleted_at', null).maybeSingle()
    if (!ev) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    title = ev.name
    subtitle = [fmtDate(ev.date), ev.venue].filter(Boolean).join(' · ')

    const { count: total } = await supabase
      .from('media_files')
      .select('id', { count: 'exact', head: true })
      .eq('event_id', share.target_id)
      .is('deleted_at', null)
      .eq('file_type', 'image')
    count = total ?? 0

    const { data: media } = await supabase
      .from('media_files')
      .select(MEDIA_SELECT)
      .eq('event_id', share.target_id)
      .is('deleted_at', null)
      .eq('file_type', 'image')
      .order('created_at', { ascending: true })
      .order('id', { ascending: true })
      .range(from, to)
    rows = (media ?? []) as unknown as MediaRow[]
  }

  const photos: SharePhoto[] = rows.map((r) => ({
    id:          r.id,
    event_name:  r.events?.name ?? '',
    event_date:  fmtDate(r.events?.date),
    card_url:    `/api/public/share/${params.token}/img/${r.id}?size=card`,
    description: r.description,
  }))

  return NextResponse.json({
    kind: share.kind,
    title,
    subtitle,
    count,
    page,
    hasMore: to + 1 < count,
    photos,
  })
}
