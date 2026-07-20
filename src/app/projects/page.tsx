import { createClient } from '@/lib/supabase/server'
import { requireAuth } from '@/lib/auth'
import { signStoragePathsSized } from '@/lib/supabase/storage'
import { fetchAllMediaRows } from '@/lib/supabase/media'
import Navbar from '@/components/layout/Navbar'
import ProjectsPageClient from './ProjectsPageClient'
import type { Event } from '@/types'

export const revalidate = 0

// ─── Page ─────────────────────────────────────────────────────────────────────

export default async function ProjectsPage() {
  const profile = await requireAuth()
  const supabase = createClient()

  const [eventsResult, mediaRows, foldersResult] = await Promise.all([
    supabase.from('events').select('*').is('deleted_at', null).order('date', { ascending: false }),
    fetchAllMediaRows(supabase),
    supabase.from('folders').select('event_id'),
  ])

  if (eventsResult.error) console.error('Failed to fetch projects:', eventsResult.error)

  const rawEvents: Event[] = eventsResult.data ?? []

  const fallbackCoverPathMap: Record<string, string> = {}
  const photoCountMap: Record<string, number> = {}
  const displayPathByStoragePath = new Map<string, string | null>()
  for (const f of mediaRows) {
    if (f.storage_path) displayPathByStoragePath.set(f.storage_path, f.display_path)
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

  // Sign via display derivatives where available — transforming a full-res
  // original past Supabase's render limits 422s and leaves the card blank.
  const coverRefs = Object.values(coverPathMap).map((path) => ({
    storage_path: path,
    display_path: displayPathByStoragePath.get(path) ?? null,
  }))
  const coverSignedUrls = await signStoragePathsSized(coverRefs, 'card', { aspect: 'preserve' })
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
