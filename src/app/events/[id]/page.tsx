import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { requireAuth } from '@/lib/auth'
import { signMediaFiles } from '@/lib/supabase/storage'
import DropZone from '@/components/DropZone'
import EventTabs from '@/components/EventTabs'
import EventHeader from '@/components/EventHeader'
import UserMenu from '@/components/UserMenu'
import ViewTracker from '@/components/ViewTracker'
import type { Event, MediaFileWithTags, Folder, Performer, Brand } from '@/types'
import { ArrowLeft, ImageIcon, Smartphone } from 'lucide-react'

export const revalidate = 0

const FIRST_PAGE = 60

interface Props {
  params: { id: string }
  searchParams?: { photo?: string; tab?: string }
}

export default async function EventDetailPage({ params, searchParams }: Props) {
  const profile = await requireAuth()
  const supabase = createClient()

  const [eventResult, mediaResult, photoCountResult, deliveryResult, foldersResult, performersResult, brandsResult, distinctPhotographers, initialFolderCounts] = await Promise.all([
    supabase.from('events').select('*').eq('id', params.id).is('deleted_at', null).single(),

    supabase
      .from('media_files')
      .select('*, tags(*), performer_tags(*, performers(*)), brand_tags(*, brands(*))')
      .eq('event_id', params.id)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .limit(FIRST_PAGE),

    supabase
      .from('media_files')
      .select('id', { count: 'exact', head: true })
      .eq('event_id', params.id)
      .is('deleted_at', null)
      .eq('file_type', 'image'),

    supabase
      .from('delivery_links')
      .select('token')
      .eq('event_id', params.id)
      .maybeSingle(),
    supabase
      .from('folders')
      .select('*')
      .eq('event_id', params.id)
      .order('created_at', { ascending: true }),
    supabase
      .from('performers')
      .select('*')
      .eq('event_id', params.id)
      .order('created_at', { ascending: true }),
    supabase
      .from('brands')
      .select('*')
      .eq('event_id', params.id)
      .order('created_at', { ascending: true }),

    (async () => {
      const PAGE = 1000
      let from = 0
      const names = new Set<string>()
      for (;;) {
        const { data } = await supabase
          .from('media_files')
          .select('photographer')
          .eq('event_id', params.id)
          .is('deleted_at', null)
          .eq('file_type', 'image')
          .not('photographer', 'is', null)
          .range(from, from + PAGE - 1)
        if (!data || data.length === 0) break
        for (const r of data) if (r.photographer) names.add(r.photographer)
        if (data.length < PAGE) break
        from += PAGE
      }
      return [...names].sort()
    })(),

    (async () => {
      const PAGE = 1000
      let from = 0
      const counts: Record<string, number> = {}
      for (;;) {
        const { data } = await supabase
          .from('media_files')
          .select('folder_id')
          .eq('event_id', params.id)
          .is('deleted_at', null)
          .not('folder_id', 'is', null)
          .range(from, from + PAGE - 1)
        if (!data || data.length === 0) break
        for (const r of data) if (r.folder_id) counts[r.folder_id] = (counts[r.folder_id] ?? 0) + 1
        if (data.length < PAGE) break
        from += PAGE
      }
      return counts
    })(),
  ])

  if (eventResult.error || !eventResult.data) {
    notFound()
  }

  const event         = eventResult.data as Event
  const rawFiles      = (mediaResult.data ?? []) as MediaFileWithTags[]
  const initialFiles  = await signMediaFiles(rawFiles)
  const photoCount    = photoCountResult.count ?? 0
  const existingToken = deliveryResult.data?.token ?? null
  const folders       = (foldersResult.data    ?? []) as Folder[]
  const performers    = (performersResult.data ?? []) as Performer[]
  const brands        = (brandsResult.data     ?? []) as Brand[]

  const lastRow       = rawFiles[rawFiles.length - 1]
  const initialCursor = rawFiles.length === FIRST_PAGE && lastRow
    ? Buffer.from(JSON.stringify({ t: new Date(lastRow.created_at).getTime(), id: lastRow.id })).toString('base64url')
    : null

  const openPhotoId = searchParams?.photo ?? null
  const initialTab  = searchParams?.tab === 'performers'
    ? 'performers' as const
    : 'gallery' as const

  return (
    <div className="min-h-screen bg-surface-0">
      <ViewTracker eventId={event.id} />
      {/* ── Sticky header ─────────────────────────────────────────────────── */}
      <header className="border-b border-[#1a1a1a] bg-surface-0 sticky top-0 z-20">
        <div className="max-w-7xl mx-auto px-6 h-14 flex items-center justify-between gap-4">
          {/* Logo */}
          <div className="flex items-center gap-2.5 shrink-0">
            <div className="w-6 h-6 rounded bg-white flex items-center justify-center shrink-0">
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <rect x="1" y="1" width="5" height="5" rx="1" fill="#0a0a0a" />
                <rect x="8" y="1" width="5" height="5" rx="1" fill="#0a0a0a" />
                <rect x="1" y="8" width="5" height="5" rx="1" fill="#0a0a0a" />
                <rect x="8" y="8" width="5" height="5" rx="1" fill="#0a0a0a" opacity="0.35" />
              </svg>
            </div>
            <span className="font-semibold text-white text-base tracking-tight truncate max-w-[200px]">
              {event.name}
            </span>
          </div>

          {/* Right side actions */}
          <div className="flex items-center gap-2 shrink-0">
            {profile.role === 'admin' && (
              <Link
                href={`/events/${event.id}/live`}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[#2a2a2a] text-[#888] text-sm hover:text-white hover:border-[#444] transition-colors"
              >
                <Smartphone size={12} />
                Event Mode
              </Link>
            )}
            <UserMenu profile={profile} />
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-10">
        {/* Back link */}
        <Link
          href="/events"
          className="inline-flex items-center gap-2 text-[#888888] text-base hover:text-white transition-colors mb-8"
        >
          <ArrowLeft size={14} />
          All events
        </Link>

        {/* Event header — inline-editable details */}
        <EventHeader event={event} photoCount={photoCount} role={profile.role} />

        {/* Upload zone */}
        <div className="mb-10">
          <DropZone eventId={event.id} photographers={event.photographers ?? []} initialFolders={folders} />
        </div>

        {/* Gallery + Review tabs */}
        <div id="gallery">
          {photoCount > 0 || initialFiles.length > 0 ? (
            <EventTabs
              initialFiles={initialFiles}
              initialCursor={initialCursor}
              initialFolderCounts={initialFolderCounts}
              totalCount={photoCount}
              eventId={event.id}
              event={event}
              initialFolders={folders}
              initialPerformers={performers}
              initialBrands={brands}
              initialTab={initialTab}
              initialOpenPhotoId={openPhotoId}
              role={profile.role}
              distinctPhotographers={distinctPhotographers}
            />
          ) : (
            <div className="flex flex-col items-center justify-center py-20 text-center border border-dashed border-[#1f1f1f] rounded-lg">
              <ImageIcon size={32} className="text-[#333] mb-4" />
              <p className="text-[#888888] text-base">No media uploaded yet.</p>
              <p className="text-[#555] text-base mt-1">Drop files above to get started.</p>
            </div>
          )}
        </div>
      </main>
    </div>
  )
}
