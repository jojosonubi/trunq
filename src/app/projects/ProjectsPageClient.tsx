'use client'

import { useState, useRef } from 'react'
import EventCard from '@/components/EventCard'
import GlobalSearch from '@/components/GlobalSearch'
import type { Event } from '@/types'
import { ChevronDown, ChevronRight } from 'lucide-react'

interface Props {
  events: (Event & { cover_image_url: string | null })[]
  recentEvents: (Event & { cover_image_url: string | null })[]
  photoCountMap: Record<string, number>
  folderCountMap: Record<string, number>
  role: string
}

function getYear(dateStr: string): number {
  return new Date(dateStr).getFullYear()
}

export default function ProjectsPageClient({
  events,
  recentEvents,
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

  const [collapsed, setCollapsed] = useState<Record<number, boolean>>({})
  const sectionRefs = useRef<Record<number, HTMLElement | null>>({})

  function toggleYear(year: number) {
    setCollapsed((prev) => ({ ...prev, [year]: !prev[year] }))
  }

  function scrollToYear(year: number) {
    const el = sectionRefs.current[year]
    if (!el) return
    setCollapsed((prev) => ({ ...prev, [year]: false }))
    setTimeout(() => {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }, 50)
  }

  return (
    <div className="max-w-7xl mx-auto page-px py-8">
      {/* Search */}
      <div className="mb-8">
        <GlobalSearch />
      </div>

      {/* Recently viewed */}
      {recentEvents.length > 0 && (
        <section className="mb-8">
          <h2
            className="uppercase font-medium mb-4"
            style={{
              fontSize: 9,
              letterSpacing: '0.14em',
              color: 'var(--text-dim)',
              paddingBottom: 8,
              borderBottom: 'var(--border-rule)',
            }}
          >
            Recently viewed
          </h2>
          <div className="flex gap-3 overflow-x-auto pb-2">
            {recentEvents.map((event) => (
              <div key={event.id} className="w-56 shrink-0">
                <EventCard
                  event={event}
                  photoCount={photoCountMap[event.id] ?? 0}
                  folderCount={folderCountMap[event.id] ?? 0}
                  role={role}
                />
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Year sidebar + grid */}
      <div className="flex gap-8">
        {/* Sidebar */}
        {years.length > 1 && (
          <aside className="w-24 shrink-0">
            <div className="sticky top-20 flex flex-col gap-1">
              <p className="text-[10px] uppercase track-label mb-2 font-medium" style={{ color: 'var(--text-dim)' }}>Years</p>
              {years.map((year) => (
                <button
                  key={year}
                  onClick={() => scrollToYear(year)}
                  className="flex items-center justify-between w-full px-2 py-2 rounded text-xs transition-colors hover:text-white"
                  style={{ color: 'var(--text-muted)' }}
                >
                  <span className="font-medium">{year}</span>
                  <span className="tabular-nums text-[10px]" style={{ color: 'var(--text-dim)' }}>{byYear[year].length}</span>
                </button>
              ))}
            </div>
          </aside>
        )}

        {/* Project sections */}
        <div className="flex-1 min-w-0 space-y-12">
          {years.map((year, yi) => {
            const isCollapsed = !!collapsed[year]
            const eventsForYear = byYear[year]
            return (
              <section
                key={year}
                ref={(el) => { sectionRefs.current[year] = el }}
                className="scroll-mt-20"
              >
                {yi > 0 && <hr className="mb-8" />}

                {/* Year header */}
                <button
                  onClick={() => toggleYear(year)}
                  className="flex items-center gap-2 mb-4 group/year"
                >
                  <h2 className="text-lg font-semibold track-heading transition-colors group-hover/year:opacity-70" style={{ color: 'var(--text-primary)' }}>
                    {year}
                  </h2>
                  <span className="text-xs tabular-nums" style={{ color: 'var(--text-dim)' }}>
                    {eventsForYear.length} project{eventsForYear.length !== 1 ? 's' : ''}
                  </span>
                  {isCollapsed
                    ? <ChevronRight size={14} className="ml-auto" style={{ color: 'var(--text-dim)' }} />
                    : <ChevronDown size={14} className="ml-auto" style={{ color: 'var(--text-dim)' }} />
                  }
                </button>

                {!isCollapsed && (
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
                    {eventsForYear.map((event) => (
                      <EventCard
                        key={event.id}
                        event={event}
                        photoCount={photoCountMap[event.id] ?? 0}
                        folderCount={folderCountMap[event.id] ?? 0}
                        role={role}
                      />
                    ))}
                  </div>
                )}
              </section>
            )
          })}
        </div>
      </div>
    </div>
  )
}
