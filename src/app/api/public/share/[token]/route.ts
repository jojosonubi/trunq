import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { signStoragePathsSized } from '@/lib/supabase/storage'

interface SharePhoto {
  id: string
  event_id: string
  event_name: string
  event_date: string
  card_url: string
  full_url: string
  description: string | null
}

function fmtDate(d?: string | null): string {
  if (!d) return ''
  return new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

// GET /api/public/share/[token]  — no-auth: resolve a public share to its gallery.
export async function GET(_req: NextRequest, { params }: { params: { token: string } }) {
  const supabase = createServiceClient()

  const { data: share } = await supabase
    .from('public_shares')
    .select('kind, target_id')
    .eq('token', params.token)
    .is('revoked_at', null)
    .maybeSingle()

  if (!share) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // ── Resolve title + the media rows for this target ──────────────────────────
  let title = ''
  let subtitle = ''
  type Row = {
    id: string; event_id: string; storage_path: string; display_path: string | null
    description: string | null; events: { name?: string; date?: string } | null
  }
  let rows: Row[] = []

  const MEDIA_SELECT = 'id, event_id, storage_path, display_path, description, events(name, date)'

  if (share.kind === 'collection') {
    const { data: col } = await supabase.from('collections').select('name').eq('id', share.target_id).maybeSingle()
    if (!col) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    title = col.name

    const { data: items } = await supabase
      .from('collection_items')
      .select(`added_at, media_files(${MEDIA_SELECT})`)
      .eq('collection_id', share.target_id)
      .order('added_at', { ascending: true })
    rows = ((items ?? []) as unknown as { media_files: Row | null }[]).map((i) => i.media_files).filter((r): r is Row => !!r)
  } else {
    const { data: ev } = await supabase.from('events').select('name, date, venue').eq('id', share.target_id).is('deleted_at', null).maybeSingle()
    if (!ev) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    title = ev.name
    subtitle = [fmtDate(ev.date), ev.venue].filter(Boolean).join(' · ')

    const { data: media } = await supabase
      .from('media_files')
      .select(MEDIA_SELECT)
      .eq('event_id', share.target_id)
      .is('deleted_at', null)
      .eq('file_type', 'image')
      .order('created_at', { ascending: true })
      .limit(2000)
    rows = (media ?? []) as unknown as Row[]
  }

  if (share.kind === 'collection') subtitle = `${rows.length} photo${rows.length !== 1 ? 's' : ''}`

  // ── Sign card + full URLs ───────────────────────────────────────────────────
  const refs = rows.map((r) => ({ storage_path: r.storage_path, display_path: r.display_path }))
  const [cardMap, fullMap] = await Promise.all([
    signStoragePathsSized(refs, 'card', { aspect: 'preserve' }),
    signStoragePathsSized(refs, 'full', { aspect: 'preserve' }),
  ])

  const photos: SharePhoto[] = rows.map((r) => ({
    id:          r.id,
    event_id:    r.event_id,
    event_name:  r.events?.name ?? '',
    event_date:  fmtDate(r.events?.date),
    card_url:    cardMap.get(r.storage_path) ?? '',
    full_url:    fullMap.get(r.storage_path) ?? '',
    description: r.description,
  })).filter((p) => p.card_url)

  return NextResponse.json({ kind: share.kind, title, subtitle, count: photos.length, photos })
}
