'use client'

import { useState } from 'react'
import { Plus } from 'lucide-react'
import EventCard from '@/components/EventCard'
import Sidebar from '@/components/layout/Sidebar'
import FolderDrawer, { type FolderItem, type SortBy } from '@/components/archive/FolderDrawer'
import NewProjectModal from '@/components/archive/NewProjectModal'
import type { Event } from '@/types'

interface Props {
  events:         (Event & { cover_image_url: string | null })[]
  photoCountMap:  Record<string, number>
  folderCountMap: Record<string, number>
  role:           string
}

function getYear(dateStr: string): number {
  return new Date(dateStr).getFullYear()
}

function sortedEvents(
  evts: (Event & { cover_image_url: string | null })[],
  sortBy: SortBy,
): (Event & { cover_image_url: string | null })[] {
  return [...evts].sort((a, b) => {
    if (sortBy === 'project')
      return a.name.localeCompare(b.name)
    if (sortBy === 'client')
      return (a.venue ?? '').localeCompare(b.venue ?? '')
    if (sortBy === 'photographer')
      return (a.photographers?.[0] ?? '').localeCompare(b.photographers?.[0] ?? '')
    // 'year' → most recent first
    return new Date(b.date).getTime() - new Date(a.date).getTime()
  })
}

export default function ProjectsPageClient({
  events,
  photoCountMap,
  folderCountMap,
  role,
}: Props) {
  const [activeId, setActiveId]     = useState<string>(events[0]?.id ?? '')
  const [sortBy, setSortBy]         = useState<SortBy>('year')
  const [modalOpen, setModalOpen]   = useState(false)

  const sorted = sortedEvents(events, sortBy)

  // One row per project — tab label = year, body = project name
  const folders: FolderItem[] = sorted.map((event) => ({
    id:     event.id,
    label:  String(getYear(event.date)),
    name:   event.name,
    count:  photoCountMap[event.id] ?? 0,
    active: event.id === activeId,
  }))

  const activeEvent = events.find((e) => e.id === activeId)

  return (
    <div style={{ display: 'flex', alignItems: 'flex-start' }}>
      {/* ── Sidebar ─────────────────────────────────────────────────────────── */}
      <Sidebar />

      {/* ── Main content ────────────────────────────────────────────────────── */}
      <main style={{ flex: 1, minWidth: 0, padding: '20px 24px', minHeight: 'calc(100vh - 44px)' }}>

        {/* Section header */}
        <div style={{
          display:        'flex',
          alignItems:     'center',
          justifyContent: 'space-between',
          marginBottom:   12,
          paddingBottom:  8,
          borderBottom:   'var(--border-rule)',
        }}>
          <p style={{
            fontSize:      9,
            textTransform: 'uppercase',
            letterSpacing: '0.14em',
            color:         'var(--text-muted)',
          }}>
            Archive
          </p>
          {role !== 'photographer' && (
            <button onClick={() => setModalOpen(true)} className="btn-new-project">
              <Plus size={10} />
              New project
            </button>
          )}
        </div>

        {/* Folder drawer — one row per project */}
        <div style={{ marginBottom: 24 }}>
          <FolderDrawer
            folders={folders}
            sortBy={sortBy}
            onSelect={setActiveId}
            onSortChange={setSortBy}
          />
        </div>

        {/* New project modal */}
        <NewProjectModal isOpen={modalOpen} onClose={() => setModalOpen(false)} />

        {/* Active project card */}
        {activeEvent && (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
            <EventCard
              event={activeEvent}
              photoCount={photoCountMap[activeEvent.id] ?? 0}
              folderCount={folderCountMap[activeEvent.id] ?? 0}
              role={role}
            />
          </div>
        )}
      </main>
    </div>
  )
}
