import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { requireAuth } from '@/lib/auth'
import { signStoragePathsThumbnail } from '@/lib/supabase/storage'
import UserMenu from '@/components/UserMenu'
import EventsPageClient from './EventsPageClient'
import type { Event } from '@/types'
import { Plus, ImageIcon, Calendar, HardDrive, Smartphone } from 'lucide-react'

export const revalidate = 0

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmtStorage(bytes: number): string {
  if (bytes === 0) return '0 B'
  if (bytes < 1_024)           return `${bytes} B`
  if (bytes < 1_048_576)       return `${(bytes / 1_024).toFixed(0)} KB`
  if (bytes < 1_073_741_824)   return `${(bytes / 1_048_576).toFixed(1)} MB`
  return `${(bytes / 1_073_741_824).toFixed(2)} GB`
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default async function EventsPage() {
  const profile = await requireAuth()
  const supabase = createClient()

  const [eventsResult, mediaResult, foldersResult, recentViewsResult] = await Promise.all([
    supabase.from('events').select('*').is('deleted_at', null).order('date', { ascending: false }),
    supabase
      .from('media_files')
      .select('event_id, file_size, storage_path')
      .is('deleted_at', null)
      .order('created_at', { ascending: true })
      .limit(20000),
    supabase.from('folders').select('event_id'),
    supabase
      .from('event_views')
      .select('event_id, viewed_at')
      .eq('user_id', profile.id)
      .order('viewed_at', { ascending: false })
      .limit(6),
  ])

  if (eventsResult.error) console.error('Failed to fetch events:', eventsResult.error)

  const rawEvents: Event[]    = eventsResult.data ?? []
  const latestEventId: string | null = rawEvents[0]?.id ?? null
  const mediaRows            = mediaResult.data ?? []

  // Actual photo count from rows (media_count column may not be maintained)
  const totalPhotos       = mediaRows.length
  const totalStorageBytes = mediaRows.reduce((s, f) => s + (f.file_size ?? 0), 0)

  // Per-event photo count and fallback cover path (first uploaded photo)
  const fallbackCoverPathMap: Record<string, string> = {}
  const photoCountMap: Record<string, number> = {}
  for (const f of mediaRows) {
    if (!f.event_id) continue
    photoCountMap[f.event_id] = (photoCountMap[f.event_id] ?? 0) + 1
    if (f.storage_path && !fallbackCoverPathMap[f.event_id]) {
      fallbackCoverPathMap[f.event_id] = f.storage_path
    }
  }

  // Build set of paths to sign: custom thumbnails take priority
  const coverPathMap: Record<string, string> = {}
  for (const e of rawEvents) {
    const path = e.thumbnail_storage_path ?? fallbackCoverPathMap[e.id]
    if (path) coverPathMap[e.id] = path
  }

  const coverPaths = Object.values(coverPathMap)
  const coverSignedUrls = coverPaths.length > 0 ? await signStoragePathsThumbnail(coverPaths, { width: 600 }) : new Map<string, string>()
  const coverMap: Record<string, string> = {}
  for (const [eventId, path] of Object.entries(coverPathMap)) {
    const signed = coverSignedUrls.get(path)
    if (signed) coverMap[eventId] = signed
  }

  // Per-event folder count
  const folderCountMap: Record<string, number> = {}
  for (const f of foldersResult.data ?? []) {
    if (f.event_id) folderCountMap[f.event_id] = (folderCountMap[f.event_id] ?? 0) + 1
  }

  // Enrich events with cover URLs
  const eventList = rawEvents.map((e) => ({
    ...e,
    cover_image_url: coverMap[e.id] ?? null,
  }))

  // Recently viewed: resolve event IDs to full enriched event objects (max 6, preserve order)
  const recentViewedIds: string[] = (recentViewsResult.data ?? []).map(
    (r: { event_id: string }) => r.event_id
  )
  const eventById = new Map(eventList.map((e) => [e.id, e]))
  const recentEvents = recentViewedIds
    .map((id) => eventById.get(id))
    .filter((e): e is typeof eventList[number] => !!e)

  const stats = [
    { label: 'Events',  value: eventList.length.toLocaleString(),  icon: Calendar  },
    { label: 'Photos',  value: totalPhotos.toLocaleString(),        icon: ImageIcon },
    { label: 'Storage', value: fmtStorage(totalStorageBytes),       icon: HardDrive },
  ]

  return (
    <div className="min-h-screen bg-surface-0">

      {/* ── Top nav ─────────────────────────────────────────────────────── */}
      <header className="border-b border-[#1a1a1a] bg-surface-0 sticky top-0 z-20">
        <div className="max-w-7xl mx-auto px-6 h-14 flex items-center justify-between">
          {/* Wordmark */}
          <div className="flex items-center gap-2.5">
            {/* Logo mark */}
            <div className="w-6 h-6 rounded bg-white flex items-center justify-center shrink-0">
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <rect x="1" y="1" width="5" height="5" rx="1" fill="#0a0a0a" />
                <rect x="8" y="1" width="5" height="5" rx="1" fill="#0a0a0a" />
                <rect x="1" y="8" width="5" height="5" rx="1" fill="#0a0a0a" />
                <rect x="8" y="8" width="5" height="5" rx="1" fill="#0a0a0a" opacity="0.35" />
              </svg>
            </div>
            <span className="font-semibold text-white text-sm tracking-tight">Trunq</span>
          </div>

          <div className="flex items-center gap-2">
            {profile.role === 'admin' && latestEventId && (
              <Link
                href={`/events/${latestEventId}/live`}
                className="inline-flex items-center gap-1.5 text-[#555] hover:text-white text-xs px-2.5 py-2 rounded-lg border border-[#1f1f1f] hover:border-[#333] hover:bg-white/5 transition-colors"
              >
                <Smartphone size={13} />
                Event Mode
              </Link>
            )}
            {profile.role !== 'photographer' && (
              <Link
                href="/events/new"
                className="inline-flex items-center gap-1.5 bg-white text-black text-xs font-semibold px-3.5 py-2 rounded-lg hover:bg-white/90 transition-colors"
              >
                <Plus size={13} />
                New event
              </Link>
            )}
            <UserMenu profile={profile} />
          </div>
        </div>
      </header>

      {/* ── Stats bar ───────────────────────────────────────────────────── */}
      {eventList.length > 0 && (
        <div className="border-b border-[#141414] bg-[#0c0c0c]">
          <div className="max-w-7xl mx-auto px-6 py-0 flex divide-x divide-[#1a1a1a]">
            {stats.map(({ label, value, icon: Icon }) => (
              <div key={label} className="flex items-center gap-3 px-8 py-4 first:pl-0 last:pr-0">
                <div className="w-7 h-7 rounded-lg bg-surface-0 border border-[#1f1f1f] flex items-center justify-center shrink-0">
                  <Icon size={13} className="text-[#555]" />
                </div>
                <div>
                  <p className="text-white text-base font-semibold tabular-nums leading-none">{value}</p>
                  <p className="text-[#555] text-[10px] uppercase tracking-wider mt-1">{label}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Main content ─────────────────────────────────────────────────── */}
      <main>
        {eventList.length === 0 ? (
          /* ── Empty state ──────────────────────────────────────────────── */
          <div className="max-w-7xl mx-auto px-6 py-10">
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
                Your event media archive. Upload photos from any photographer, review and approve selects, then deliver to clients — all in one place.
              </p>
              <p className="text-[#444] text-xs mb-10">Start by creating your first event.</p>

              <Link
                href="/events/new"
                className="inline-flex items-center gap-2 bg-white text-black text-sm font-semibold px-5 py-2.5 rounded-lg hover:bg-white/90 transition-colors"
              >
                <Plus size={15} />
                Create your first event
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
          <EventsPageClient
            events={eventList}
            recentEvents={recentEvents}
            photoCountMap={photoCountMap}
            folderCountMap={folderCountMap}
            role={profile.role}
          />
        )}
      </main>
    </div>
  )
}
