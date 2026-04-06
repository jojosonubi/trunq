import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { requireAuth } from '@/lib/auth'
import { signStoragePaths } from '@/lib/supabase/storage'
import Navbar from '@/components/layout/Navbar'
import ProjectsPageClient from './ProjectsPageClient'
import type { Event } from '@/types'
import { Plus, ImageIcon } from 'lucide-react'

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
        {eventList.length === 0 ? (
          <div className="max-w-7xl mx-auto page-px py-8">
            <div className="flex flex-col items-center justify-center py-32 text-center">
              <div className="relative mb-8">
                <div className="w-24 h-24 rounded-full bg-white/3 border border-[#1f1f1f] flex items-center justify-center">
                  <div className="w-16 h-16 rounded-full bg-surface-0 border border-[#2a2a2a] flex items-center justify-center">
                    <ImageIcon size={24} className="text-[#555]" />
                  </div>
                </div>
              </div>

              <h2 className="text-white text-xl font-semibold mb-3">Welcome to Trunq</h2>
              <p className="text-[#666] text-sm mb-2 max-w-sm leading-relaxed">
                Your media archive. Upload photos from any photographer, review and approve selects, then deliver to clients — all in one place.
              </p>
              <p className="text-[#444] text-xs mb-10">Start by creating your first project.</p>

              <Link
                href="/projects/new"
                className="inline-flex items-center gap-2 bg-white text-black text-sm font-semibold px-5 py-2.5 rounded-lg hover:bg-white/90 transition-colors"
              >
                <Plus size={15} />
                Create your first project
              </Link>

              <div className="mt-16 grid grid-cols-3 gap-6 max-w-lg text-left">
                {[
                  { title: 'Multi-photographer upload', body: 'Tag each batch by photographer on upload.' },
                  { title: 'Review & approve', body: 'Approve, hold, or reject — then deliver with one link.' },
                  { title: 'AI tagging', body: 'Auto-tag scene, mood, and subjects. Search by keyword.' },
                ].map((f) => (
                  <div key={f.title} className="space-y-1.5">
                    <div className="w-5 h-px bg-surface-2" />
                    <p className="text-white text-xs font-medium">{f.title}</p>
                    <p className="text-[#444] text-[11px] leading-relaxed">{f.body}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <ProjectsPageClient
            events={eventList}
            photoCountMap={photoCountMap}
            folderCountMap={folderCountMap}
            role={profile.role}
          />
        )}
      </main>
    </div>
  )
}
