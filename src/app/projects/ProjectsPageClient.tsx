'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Plus } from 'lucide-react'
import EventCard from '@/components/EventCard'
import Sidebar from '@/components/layout/Sidebar'
import FolderDrawer, { type FolderItem, type SortBy } from '@/components/archive/FolderDrawer'
import type { Event } from '@/types'

interface Props {
  events:        (Event & { cover_image_url: string | null })[]
  photoCountMap: Record<string, number>
  folderCountMap: Record<string, number>
  role:          string
}

function getYear(dateStr: string): number {
  return new Date(dateStr).getFullYear()
}

function sortEvents(
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
    // 'year' → date descending
    return new Date(b.date).getTime() - new Date(a.date).getTime()
  })
}

export default function ProjectsPageClient({
  events,
  photoCountMap,
  folderCountMap,
  role,
}: Props) {
  const years = [...new Set(events.map((e) => getYear(e.date)))].sort((a, b) => b - a)

  const byYear: Record<number, typeof events> = {}
  for (const e of events) {
    const y = getYear(e.date)
    if (!byYear[y]) byYear[y] = []
    byYear[y].push(e)
  }

  const [activeYear, setActiveYear] = useState<number>(years[0])
  const [sortBy, setSortBy]         = useState<SortBy>('year')

  const folders: FolderItem[] = years.map((year) => ({
    id:     String(year),
    label:  String(year),
    name:   String(year),
    count:  byYear[year].length,
    active: year === activeYear,
  }))

  const activeEvents = sortEvents(byYear[activeYear] ?? [], sortBy)

  return (
    <div style={{ display: 'flex', alignItems: 'flex-start' }}>
      {/* ── Sidebar ───────────────────────────────────────────────────────── */}
      <Sidebar />

      {/* ── Main content ──────────────────────────────────────────────────── */}
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
            <Link
              href="/projects/new"
              style={{
                display:        'inline-flex',
                alignItems:     'center',
                gap:            5,
                fontSize:       10,
                fontWeight:     600,
                letterSpacing:  '0.04em',
                padding:        '3px 9px',
                background:     'var(--accent)',
                color:          '#ffffff',
                borderRadius:   2,
                textDecoration: 'none',
              }}
            >
              <Plus size={10} />
              New project
            </Link>
          )}
        </div>

        {/* Folder drawer */}
        <div style={{ marginBottom: 24 }}>
          <FolderDrawer
            folders={folders}
            sortBy={sortBy}
            onSelect={(id) => setActiveYear(Number(id))}
            onSortChange={setSortBy}
          />
        </div>

        {/* Event grid */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
          {activeEvents.map((event) => (
            <EventCard
              key={event.id}
              event={event}
              photoCount={photoCountMap[event.id] ?? 0}
              folderCount={folderCountMap[event.id] ?? 0}
              role={role}
            />
          ))}
        </div>
      </main>
    </div>
  )
}
