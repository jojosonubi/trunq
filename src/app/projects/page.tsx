import { createClient } from '@/lib/supabase/server'
import { requireAuth } from '@/lib/auth'
import { signStoragePaths } from '@/lib/supabase/storage'
import Navbar from '@/components/layout/Navbar'
import ProjectsPageClient from './ProjectsPageClient'
import type { Event } from '@/types'

export const revalidate = 0

// ─── Page ─────────────────────────────────────────────────────────────────────

export default async function ProjectsPage() {
  const profile = await requireAuth()
  const supabase = createClient()

  const [eventsResult, mediaResult, foldersResult] = await Promise.all([
    supabase.from('events').select('*').is('deleted_at', null).order('date', { ascending: false }),
    supabase
      .from('media_files')
      .select('event_id, file_size, storage_path')
      .is('deleted_at', null)
      .order('created_at', { ascending: true }),
    supabase.from('folders').select('event_id'),
  ])

  if (eventsResult.error) console.error('Failed to fetch projects:', eventsResult.error)

  const rawEvents: Event[] = eventsResult.data ?? []
  const mediaRows          = mediaResult.data ?? []

  const fallbackCoverPathMap: Record<string, string> = {}
  const photoCountMap: Record<string, number> = {}
  for (const f of mediaRows) {
    if (!f.event_id) continue
    photoCountMap[f.event_id] = (photoCountMap[f.event_id] ?? 0) + 1
    if (f.storage_path && !fallbackCoverPathMap[f.event_id]) {
      fallbackCoverPathMap[f.event_id] = f.storage_path
    }
  }

  const coverPathMap: Record<string, string> = {}
  for (const e of rawEvents) {
    const path = e.thumbnail_storage_path ?? fallbackCoverPathMap[e.id]
    if (path) coverPathMap[e.id] = path
  }

  const coverPaths = Object.values(coverPathMap)
  const coverSignedUrls = coverPaths.length > 0 ? await signStoragePaths(coverPaths) : new Map<string, string>()
  const coverMap: Record<string, string> = {}
  for (const [eventId, path] of Object.entries(coverPathMap)) {
    const signed = coverSignedUrls.get(path)
    if (signed) coverMap[eventId] = signed
  }

  const folderCountMap: Record<string, number> = {}
  for (const f of foldersResult.data ?? []) {
    if (f.event_id) folderCountMap[f.event_id] = (folderCountMap[f.event_id] ?? 0) + 1
  }

  const eventList = rawEvents.map((e) => ({
    ...e,
    cover_image_url: coverMap[e.id] ?? null,
  }))

  return (
    <div className="min-h-screen bg-surface-0">

      <Navbar profile={profile} />

      {/* ── Main content ─────────────────────────────────────────────────── */}
      <main>
        <ProjectsPageClient
          events={eventList}
          photoCountMap={photoCountMap}
          folderCountMap={folderCountMap}
          role={profile.role}
        />
      </main>
    </div>
  )
}
