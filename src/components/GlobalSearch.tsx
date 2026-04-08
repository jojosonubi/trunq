'use client'

import { useState, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import { Search, X, Calendar, Users, Loader2, ImageIcon } from 'lucide-react'
import type { SearchResults, EventResult, PhotoResult, PerformerResult } from '@/app/api/search/route'

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-GB', {
    day: 'numeric', month: 'short', year: 'numeric',
  })
}

// ─── Section header ───────────────────────────────────────────────────────────

function SectionHeader({ label, hasBorder }: { label: string; hasBorder: boolean }) {
  return (
    <div className={hasBorder ? 'border-t border-[#161616] pt-1' : ''}>
      <p className="px-4 pt-3 pb-1.5 text-[10px] text-[#444] uppercase tracking-wider font-medium">
        {label}
      </p>
    </div>
  )
}

// ─── Result rows ──────────────────────────────────────────────────────────────

function EventRow({ event, onClick }: { event: EventResult; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-3 w-full text-left px-4 py-2.5 hover:bg-white/4 transition-colors group/row"
    >
      <div className="w-8 h-8 rounded-lg bg-surface-0 border border-[#222] flex items-center justify-center shrink-0">
        <Calendar size={13} className="text-[#555]" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-white text-sm truncate group-hover/row:text-white/90">{event.name}</p>
        <p className="text-[#555] text-xs mt-0.5 truncate">
          {formatDate(event.date)}
          {event.venue ? ` · ${event.venue}` : ''}
          {event.location ? ` · ${event.location}` : ''}
        </p>
      </div>
    </button>
  )
}

function PhotoRow({ photo, onClick }: { photo: PhotoResult; onClick: () => void }) {
  const imgSrc = photo.signed_url ?? photo.public_url
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-3 w-full text-left px-4 py-2 hover:bg-white/4 transition-colors group/row"
    >
      <div className="w-12 h-12 rounded-lg overflow-hidden bg-surface-0 shrink-0 relative">
        {imgSrc ? (
          <Image src={imgSrc} alt="" fill className="object-cover" unoptimized sizes="48px" />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <ImageIcon size={14} className="text-[#444]" />
          </div>
        )}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-white text-sm truncate group-hover/row:text-white/90">{photo.event_name}</p>
        <p className="text-[#555] text-xs mt-0.5 truncate">
          {photo.event_date ? formatDate(photo.event_date) : ''}
        </p>
      </div>
    </button>
  )
}

function PerformerRow({ performer, onClick }: { performer: PerformerResult; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-3 w-full text-left px-4 py-2.5 hover:bg-white/4 transition-colors group/row"
    >
      <div className="w-8 h-8 rounded-full overflow-hidden bg-surface-0 border border-[#222] flex items-center justify-center shrink-0 relative">
        {performer.reference_url ? (
          <Image
            src={performer.reference_url}
            alt=""
            fill
            className="object-cover"
            unoptimized
            sizes="32px"
          />
        ) : (
          <Users size={13} className="text-[#555]" />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-white text-sm truncate group-hover/row:text-white/90">{performer.name}</p>
        <p className="text-[#555] text-xs mt-0.5 truncate">
          {performer.role ? `${performer.role} · ` : ''}{performer.event_name}
        </p>
      </div>
    </button>
  )
}

// ─── GlobalSearch ─────────────────────────────────────────────────────────────

export default function GlobalSearch({ upward = false }: { upward?: boolean }) {
  const router = useRouter()

  const [query, setQuery]     = useState('')
  const [results, setResults] = useState<SearchResults | null>(null)
  const [loading, setLoading] = useState(false)
  const [open, setOpen]       = useState(false)

  const containerRef  = useRef<HTMLDivElement>(null)
  const inputRef      = useRef<HTMLInputElement>(null)
  const debounceRef   = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Debounced fetch
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)

    const q = query.trim()
    if (q.length < 2) {
      setResults(null)
      setLoading(false)
      return
    }

    setLoading(true)
    debounceRef.current = setTimeout(async () => {
      try {
        const res  = await fetch(`/api/search?q=${encodeURIComponent(q)}`)
        const data = await res.json() as SearchResults
        setResults(data)
      } catch {
        setResults(null)
      } finally {
        setLoading(false)
      }
    }, 300)

    return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
  }, [query])

  // Close panel on outside click
  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [])

  // Keyboard: Escape closes, Enter navigates to full results
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') { setOpen(false); inputRef.current?.blur() }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])

  function goToFullResults() {
    const q = query.trim()
    if (!q) return
    navigate(`/search?q=${encodeURIComponent(q)}`)
  }

  function clear() {
    setQuery('')
    setResults(null)
    setLoading(false)
    inputRef.current?.focus()
  }

  function navigate(path: string) {
    setOpen(false)
    setQuery('')
    setResults(null)
    router.push(path)
  }

  const showPanel   = open && query.trim().length >= 2
  const hasResults  = results && (results.events.length + results.photos.length + results.performers.length) > 0
  const isEmpty     = results && !hasResults && !loading

  return (
    <div ref={containerRef} className="relative w-full">
      {/* ── Input ─────────────────────────────────────────────────────────── */}
      <div className="relative">
        <Search
          size={15}
          className="absolute left-4 top-1/2 -translate-y-1/2 text-[#3a3a3a] pointer-events-none"
        />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => setOpen(true)}
          onKeyDown={(e) => { if (e.key === 'Enter') goToFullResults() }}
          placeholder="Search across all projects, photos, tags…"
          className="w-full bg-surface-0 border border-[#1a1a1a] focus:border-[#2a2a2a] rounded-xl pl-11 pr-10 py-3 text-white text-sm placeholder:text-[#2a2a2a] focus:outline-none transition-colors"
          autoComplete="off"
        />
        <div className="absolute right-3.5 top-1/2 -translate-y-1/2">
          {loading ? (
            <Loader2 size={14} className="text-[#3a3a3a] animate-spin" />
          ) : query ? (
            <button onClick={clear} className="text-[#3a3a3a] hover:text-[#888] transition-colors" aria-label="Clear">
              <X size={14} />
            </button>
          ) : null}
        </div>
      </div>

      {/* ── Results panel ─────────────────────────────────────────────────── */}
      {showPanel && (
        <div className={`absolute left-0 right-0 bg-surface-0 border border-[#1f1f1f] rounded-xl shadow-2xl z-50 overflow-hidden overflow-y-auto ${upward ? 'bottom-full mb-2 max-h-[60vh]' : 'top-full mt-2 max-h-[540px]'}`}>

          {/* Loading skeleton */}
          {loading && !results && (
            <div className="flex items-center justify-center py-10">
              <Loader2 size={16} className="text-[#3a3a3a] animate-spin" />
            </div>
          )}

          {/* Empty state */}
          {isEmpty && (
            <div className="flex flex-col items-center py-10 px-6 text-center">
              <Search size={22} className="text-[#222] mb-3" />
              <p className="text-[#555] text-sm">
                No results for <span className="text-[#888]">"{query}"</span>
              </p>
              <p className="text-[#333] text-xs mt-1.5 max-w-xs leading-relaxed">
                Try an event name, location, photographer, AI tag, or performer name
              </p>
            </div>
          )}

          {/* Results */}
          {hasResults && results && (
            <div>
              {/* Events */}
              {results.events.length > 0 && (
                <>
                  <SectionHeader label="Projects" hasBorder={false} />
                  {results.events.map((ev) => (
                    <EventRow
                      key={ev.id}
                      event={ev}
                      onClick={() => navigate(`/projects/${ev.id}`)}
                    />
                  ))}
                </>
              )}

              {/* Photos — max 5 in dropdown */}
              {results.photos.length > 0 && (
                <>
                  <SectionHeader label="Photos" hasBorder={results.events.length > 0} />
                  {results.photos.slice(0, 5).map((ph) => (
                    <PhotoRow
                      key={ph.id}
                      photo={ph}
                      onClick={() => navigate(`/projects/${ph.event_id}?photo=${ph.id}`)}
                    />
                  ))}
                </>
              )}

              {/* Performers */}
              {results.performers.length > 0 && (
                <>
                  <SectionHeader
                    label="Performers"
                    hasBorder={results.events.length > 0 || results.photos.length > 0}
                  />
                  {results.performers.map((p) => (
                    <PerformerRow
                      key={p.id}
                      performer={p}
                      onClick={() => navigate(`/projects/${p.event_id}?tab=performers`)}
                    />
                  ))}
                </>
              )}
            </div>
          )}

          {/* See all results footer — always shown when query is long enough */}
          {!loading && query.trim().length >= 2 && (
            <div className="border-t border-[#161616]">
              <button
                onClick={goToFullResults}
                className="w-full text-left px-4 py-3 text-xs text-[#555] hover:text-white hover:bg-white/4 transition-colors flex items-center gap-2"
              >
                <Search size={11} />
                See all results for <span className="text-white font-medium">"{query.trim()}"</span>
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
