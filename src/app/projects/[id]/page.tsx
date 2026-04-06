import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { requireAuth } from '@/lib/auth'
import { signMediaFiles } from '@/lib/supabase/storage'
import DropZone from '@/components/DropZone'
import EventTabs from '@/components/EventTabs'
import EventHeader from '@/components/EventHeader'
import Navbar from '@/components/layout/Navbar'
import ViewTracker from '@/components/ViewTracker'
import type { Event, MediaFileWithTags, Folder, Performer, Brand } from '@/types'
import { ArrowLeft, ImageIcon } from 'lucide-react'

export const revalidate = 0

interface Props {
  params: { id: string }
  searchParams?: { photo?: string; tab?: string }
}

export default async function ProjectDetailPage({ params, searchParams }: Props) {
  const profile = await requireAuth()
  const supabase = createClient()

  const [eventResult, mediaResult, deliveryResult, foldersResult, performersResult, brandsResult] = await Promise.all([
    supabase.from('events').select('*').eq('id', params.id).is('deleted_at', null).single(),
    supabase
      .from('media_files')
      .select('*, tags(*), performer_tags(*, performers(*)), brand_tags(*, brands(*))')
      .eq('event_id', params.id)
      .is('deleted_at', null)
      .order('created_at', { ascending: false }),
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
  ])

  if (eventResult.error || !eventResult.data) {
    notFound()
  }

  const event = eventResult.data as Event
  const mediaFiles = await signMediaFiles((mediaResult.data ?? []) as MediaFileWithTags[])
  const untaggedImages = mediaFiles.filter(
    (f) => f.file_type === 'image' && (!f.tags || f.tags.length === 0)
  )
  const photoCount    = mediaFiles.filter((f) => f.file_type === 'image').length
  const existingToken = deliveryResult.data?.token ?? null
  const folders    = (foldersResult.data    ?? []) as Folder[]
  const performers = (performersResult.data ?? []) as Performer[]
  const brands     = (brandsResult.data     ?? []) as Brand[]

  const openPhotoId = searchParams?.photo ?? null
  const initialTab  = (searchParams?.tab === 'performers' || searchParams?.tab === 'review')
    ? (searchParams.tab as 'performers' | 'review')
    : 'gallery'

  return (
    <div className="min-h-screen" style={{ background: 'var(--surface-base)' }}>
      <ViewTracker eventId={event.id} />
      <Navbar
        profile={profile}
        eventModeHref={profile.role === 'admin' ? `/projects/${event.id}/live` : undefined}
      />

      <main className="max-w-7xl mx-auto page-px py-8">
        {/* Back link */}
        <Link
          href="/projects"
          className="inline-flex items-center gap-2 text-sm hover:text-white transition-colors mb-8"
          style={{ color: 'var(--text-secondary)' }}
        >
          <ArrowLeft size={14} />
          All projects
        </Link>

        {/* Project header — inline-editable details */}
        <EventHeader event={event} photoCount={photoCount} role={profile.role} />

        {/* Upload zone */}
        <div className="mb-10">
          <DropZone eventId={event.id} photographers={event.photographers ?? []} initialFolders={folders} />
        </div>

        {/* Gallery + Review tabs */}
        <div id="gallery">
          {mediaFiles.length > 0 ? (
            <EventTabs
              files={mediaFiles}
              untaggedImages={untaggedImages}
              eventId={event.id}
              existingToken={existingToken}
              event={event}
              initialFolders={folders}
              initialPerformers={performers}
              initialBrands={brands}
              initialTab={initialTab}
              initialOpenPhotoId={openPhotoId}
              role={profile.role}
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
  )
}
