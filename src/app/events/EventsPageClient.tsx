'use client'

import { useState, useRef } from 'react'
import EventCard from '@/components/EventCard'
import GlobalSearch from '@/components/GlobalSearch'
import type { Event } from '@/types'
import { ChevronDown, ChevronRight, Clock } from 'lucide-react'

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

export default function EventsPageClient({
  events,
  recentEvents,
  photoCountMap,
  folderCountMap,
  role,
}: Props) {
  // Group events by year (descending)
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
    // Expand if collapsed
    setCollapsed((prev) => ({ ...prev, [year]: false }))
    setTimeout(() => {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }, 50)
  }

  return (
    <div className="max-w-7xl mx-auto px-6 py-10">
      {/* Search */}
      <div className="mb-10">
        <GlobalSearch />
      </div>

      {/* Recently viewed */}
      {recentEvents.length > 0 && (
        <section className="mb-10">
          <div className="flex items-center gap-2 mb-4">
            <Clock size={13} className="text-[#444]" />
            <h2 className="text-[#888] text-xs font-medium uppercase tracking-wider">Recently viewed</h2>
          </div>
          <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-hide">
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
            <div className="sticky top-20 space-y-0.5">
              <p className="text-[#333] text-[10px] uppercase tracking-wider mb-2 font-medium">Years</p>
              {years.map((year) => (
                <button
                  key={year}
                  onClick={() => scrollToYear(year)}
                  className="flex items-center justify-between w-full px-2.5 py-1.5 rounded-lg text-[#555] hover:text-white hover:bg-white/5 transition-colors text-xs"
                >
                  <span className="font-medium">{year}</span>
                  <span className="text-[#333] tabular-nums text-[10px]">{byYear[year].length}</span>
                </button>
              ))}
            </div>
          </aside>
        )}

        {/* Event sections */}
        <div className="flex-1 min-w-0 space-y-12">
          {years.map((year) => {
            const isCollapsed = !!collapsed[year]
            const eventsForYear = byYear[year]
            return (
              <section
                key={year}
                ref={(el) => { sectionRefs.current[year] = el }}
                className="scroll-mt-20"
              >
                {/* Year header */}
                <button
                  onClick={() => toggleYear(year)}
                  className="flex items-center gap-2 mb-5 group/year"
                >
                  <h2 className="text-white text-lg font-semibold group-hover/year:text-white/80 transition-colors">
                    {year}
                  </h2>
                  <span className="text-[#333] text-xs tabular-nums">
                    {eventsForYear.length} event{eventsForYear.length !== 1 ? 's' : ''}
                  </span>
                  {isCollapsed
                    ? <ChevronRight size={14} className="text-[#444] ml-auto" />
                    : <ChevronDown size={14} className="text-[#444] ml-auto" />
                  }
                </button>

                {!isCollapsed && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
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
