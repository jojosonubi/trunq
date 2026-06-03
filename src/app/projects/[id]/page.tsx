import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { requireAuth } from '@/lib/auth'
import { signMediaFiles } from '@/lib/supabase/storage'
import DropZone from '@/components/DropZone'
import EventTabs from '@/components/EventTabs'
import EventHeader from '@/components/EventHeader'
import Navbar from '@/components/layout/Navbar'
import Sidebar from '@/components/layout/Sidebar'
import ViewTracker from '@/components/ViewTracker'
import type { Event, MediaFileWithTags, Folder, Performer, Brand } from '@/types'
import { ImageIcon } from 'lucide-react'

export const revalidate = 0

const FIRST_PAGE = 60

interface Props {
  params: { id: string }
  searchParams?: { photo?: string; tab?: string }
}

export default async function ProjectDetailPage({ params, searchParams }: Props) {
  const profile = await requireAuth()
  const supabase = createClient()

  const [eventResult, mediaResult, photoCountResult, deliveryResult, foldersResult, performersResult, brandsResult, distinctPhotographers, initialFolderCounts] = await Promise.all([
    supabase.from('events').select('*').eq('id', params.id).is('deleted_at', null).single(),

    // First page only — GalleryWithSearch fetches subsequent pages via /api/events/[id]/media
    supabase
      .from('media_files')
      .select('*, tags(*), performer_tags(*, performers(*)), brand_tags(*, brands(*))')
      .eq('event_id', params.id)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .limit(FIRST_PAGE),

    // Total image count for EventHeader (lightweight HEAD request)
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

    // Paginated distinct photographer names — volume-proof (PGRST123: aggregates not enabled)
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

    // Lightweight folder-assignment counts — only folder_id column, paginated
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

  // Cursor for GalleryWithSearch to fetch page 2 onwards
  const lastRow      = rawFiles[rawFiles.length - 1]
  const initialCursor = rawFiles.length === FIRST_PAGE && lastRow
    ? Buffer.from(JSON.stringify({ t: new Date(lastRow.created_at).getTime(), id: lastRow.id })).toString('base64url')
    : null

  const openPhotoId = searchParams?.photo ?? null
  const initialTab  = searchParams?.tab === 'performers'
    ? 'performers' as const
    : 'gallery' as const

  return (
    <div className="min-h-screen" style={{ background: 'var(--surface-0)' }}>
      <ViewTracker eventId={event.id} />
      <Navbar profile={profile} />

      <div style={{ display: 'flex', alignItems: 'flex-start' }}>
        <Sidebar />

        <main className="main-content" style={{ flex: 1, minWidth: 0, padding: '20px 24px', minHeight: 'calc(100vh - 44px)' }}>
          {/* Project header */}
          <EventHeader event={event} photoCount={photoCount} role={profile.role} existingToken={existingToken} eventId={event.id} folders={folders} />

          {/* Upload zone */}
          <div style={{ marginBottom: 24 }}>
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
              <div className="flex flex-col items-center justify-center py-12 text-center" style={{ border: 'var(--border-subtle)', borderStyle: 'dashed', borderRadius: 4 }}>
                <ImageIcon size={32} className="mb-4" style={{ color: 'var(--text-dim)' }} />
                <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>No media uploaded yet.</p>
                <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>Drop files above to get started.</p>
              </div>
            )}
          </div>
        </main>
      </div>
    </div>
  )
}
