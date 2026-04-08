'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import {
  Search, X, Loader2, ImageIcon, SlidersHorizontal, ArrowLeft,
  ChevronLeft, ChevronRight, ExternalLink, Tag, Calendar, Camera, Palette,
} from 'lucide-react'
import clsx from 'clsx'
import type { FullPhotoResult } from '@/app/api/search/full/route'

// ─── Colour palette (matches GalleryWithSearch and tag API) ──────────────────

const COLOUR_SWATCHES = [
  { name: 'red',    bg: '#ef4444', ring: '#f87171' },
  { name: 'orange', bg: '#f97316', ring: '#fb923c' },
  { name: 'yellow', bg: '#eab308', ring: '#fbbf24' },
  { name: 'green',  bg: '#22c55e', ring: '#4ade80' },
  { name: 'teal',   bg: '#14b8a6', ring: '#2dd4bf' },
  { name: 'blue',   bg: '#3b82f6', ring: '#60a5fa' },
  { name: 'purple', bg: '#a855f7', ring: '#c084fc' },
  { name: 'pink',   bg: '#ec4899', ring: '#f472b6' },
  { name: 'white',  bg: '#e5e7eb', ring: '#f3f4f6' },
  { name: 'black',  bg: '#1f2937', ring: '#374151' },
  { name: 'grey',   bg: '#6b7280', ring: '#9ca3af' },
  { name: 'brown',  bg: '#92400e', ring: '#b45309' },
]

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtDate(dateStr: string): string {
  if (!dateStr) return ''
  return new Date(dateStr).toLocaleDateString('en-GB', {
    day: 'numeric', month: 'short', year: 'numeric',
  })
}

interface Filters {
  event_name:   string
  venue:        string
  photographer: string
  location:     string
  date_from:    string
  date_to:      string
  colour:       string
  file_type:    string
}

const EMPTY_FILTERS: Filters = {
  event_name: '', venue: '', photographer: '', location: '',
  date_from: '', date_to: '', colour: '', file_type: '',
}

function buildParams(q: string, f: Filters): URLSearchParams {
  const params = new URLSearchParams()
  if (q)            params.set('q',            q)
  if (f.event_name) params.set('event_name',   f.event_name)
  if (f.venue)      params.set('venue',         f.venue)
  if (f.photographer) params.set('photographer', f.photographer)
  if (f.location)   params.set('location',     f.location)
  if (f.date_from)  params.set('date_from',    f.date_from)
  if (f.date_to)    params.set('date_to',      f.date_to)
  if (f.colour)     params.set('colour',       f.colour)
  if (f.file_type)  params.set('file_type',    f.file_type)
  return params
}

// ─── Active filter pills ──────────────────────────────────────────────────────

const FILTER_LABELS: Record<keyof Filters, string> = {
  event_name:   'Project',
  venue:        'Venue',
  photographer: 'Photographer',
  location:     'Location',
  date_from:    'From',
  date_to:      'To',
  colour:       'Colour',
  file_type:    'Type',
}

// ─── SearchPageClient ─────────────────────────────────────────────────────────

interface Props { initialQuery: string }

export default function SearchPageClient({ initialQuery }: Props) {
  const [query,   setQuery]   = useState(initialQuery)
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS)
  const [photos,  setPhotos]  = useState<FullPhotoResult[]>([])
  const [total,   setTotal]   = useState<number | null>(null)
  const [loading, setLoading] = useState(false)
  const [filtersOpen, setFiltersOpen] = useState(true)
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null)

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const inputRef    = useRef<HTMLInputElement>(null)

  // ── Fetch results ────────────────────────────────────────────────────────────

  const fetchResults = useCallback(async (q: string, f: Filters) => {
    if (q.trim().length < 2 && Object.values(f).every((v) => !v)) {
      setPhotos([])
      setTotal(null)
      setLoading(false)
      return
    }
    setLoading(true)
    try {
      const params = buildParams(q.trim(), f)
      const res  = await fetch(`/api/search/full?${params}`)
      const data = await res.json() as { photos: FullPhotoResult[]; total: number }
      setPhotos(data.photos ?? [])
      setTotal(data.total ?? 0)
    } catch {
      setPhotos([])
      setTotal(0)
    } finally {
      setLoading(false)
    }
  }, [])

  // Debounce every change
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => fetchResults(query, filters), 300)
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
  }, [query, filters, fetchResults])

  // ── Filter helpers ────────────────────────────────────────────────────────────

  function setFilter<K extends keyof Filters>(key: K, value: string) {
    setFilters((prev) => ({ ...prev, [key]: value }))
  }

  function clearFilter(key: keyof Filters) {
    setFilters((prev) => ({ ...prev, [key]: '' }))
  }

  function clearAll() {
    setFilters(EMPTY_FILTERS)
  }

  const activeFilterKeys = (Object.keys(filters) as (keyof Filters)[]).filter((k) => filters[k] !== '')
  const hasActiveFilters = activeFilterKeys.length > 0

  // ── Lightbox keyboard nav ─────────────────────────────────────────────────────

  function handleSearchKey(e: React.KeyboardEvent) {
    if (e.key === 'Enter') {
      const q = query.trim()
      if (q) window.history.replaceState(null, '', `/search?q=${encodeURIComponent(q)}`)
    }
  }

  useEffect(() => {
    if (lightboxIndex === null) return
    const idx = lightboxIndex
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape')     { setLightboxIndex(null); return }
      if (e.key === 'ArrowLeft'  && idx > 0)              setLightboxIndex(idx - 1)
      if (e.key === 'ArrowRight' && idx < photos.length - 1) setLightboxIndex(idx + 1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [lightboxIndex, photos.length])

  useEffect(() => {
    if (lightboxIndex !== null) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }
    return () => { document.body.style.overflow = '' }
  }, [lightboxIndex])

  // ── Input field ───────────────────────────────────────────────────────────────

  const inputField = (
    key: keyof Filters,
    placeholder: string,
    type: 'text' | 'date' = 'text'
  ) => (
    <input
      type={type}
      value={filters[key]}
      onChange={(e) => setFilter(key, e.target.value)}
      placeholder={placeholder}
      className={clsx(
        'w-full bg-surface-0 border border-[#1f1f1f] rounded-lg px-3 py-2 text-white text-xs placeholder:text-[#3a3a3a] focus:outline-none focus:border-[#333] transition-colors',
        type === 'date' && '[color-scheme:dark]'
      )}
    />
  )

  // ─────────────────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-surface-0">

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <header className="border-b border-[#1a1a1a] bg-surface-0 sticky top-0 z-20">
        <div className="max-w-7xl mx-auto px-6 h-14 flex items-center gap-4">
          <Link
            href="/projects"
            className="shrink-0 text-[#555] hover:text-white transition-colors"
            aria-label="Back to projects"
          >
            <ArrowLeft size={16} />
          </Link>

          {/* Search bar */}
          <div className="relative flex-1 max-w-xl">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#3a3a3a] pointer-events-none" />
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={handleSearchKey}
              placeholder="Search photos, projects, tags…"
              autoComplete="off"
              className="w-full bg-surface-0 border border-[#1f1f1f] rounded-lg pl-9 pr-8 py-2.5 text-white text-sm placeholder:text-[#2a2a2a] focus:outline-none focus:border-[#333] transition-colors"
            />
            {query && (
              <button
                onClick={() => setQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-[#3a3a3a] hover:text-[#888] transition-colors"
                aria-label="Clear"
              >
                <X size={13} />
              </button>
            )}
          </div>

          {/* Filters toggle */}
          <button
            onClick={() => setFiltersOpen((v) => !v)}
            className={clsx(
              'shrink-0 inline-flex items-center gap-1.5 px-3 py-2 border text-xs rounded-lg transition-all',
              hasActiveFilters || filtersOpen
                ? 'border-white/30 text-white bg-white/8'
                : 'border-[#1f1f1f] text-[#555] hover:text-white hover:border-[#333]'
            )}
          >
            <SlidersHorizontal size={13} />
            Filters
            {hasActiveFilters && (
              <span className="w-1.5 h-1.5 rounded-full bg-white inline-block" />
            )}
          </button>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-6 py-8">

        {/* ── Active filter pills ──────────────────────────────────────────── */}
        {hasActiveFilters && (
          <div className="flex items-center gap-2 flex-wrap mb-5">
            {activeFilterKeys.map((key) => (
              <span
                key={key}
                className="inline-flex items-center gap-1.5 bg-white/8 border border-white/15 text-white text-xs px-2.5 py-1 rounded-full"
              >
                <span className="text-[#888]">{FILTER_LABELS[key]}:</span>
                {key === 'colour' ? (
                  <span className="capitalize">{filters[key]}</span>
                ) : (
                  <span>{filters[key]}</span>
                )}
                <button
                  onClick={() => clearFilter(key)}
                  className="text-[#555] hover:text-white transition-colors ml-0.5"
                  aria-label={`Remove ${FILTER_LABELS[key]} filter`}
                >
                  <X size={10} />
                </button>
              </span>
            ))}
            <button
              onClick={clearAll}
              className="text-xs text-[#555] hover:text-white transition-colors ml-1"
            >
              Clear all
            </button>
          </div>
        )}

        <div className="flex gap-8 items-start">

          {/* ── Filter sidebar ──────────────────────────────────────────────── */}
          {filtersOpen && (
            <aside className="w-56 shrink-0 space-y-5">

              <div>
                <p className="text-[#444] text-[10px] uppercase tracking-wider mb-2">Project name</p>
                {inputField('event_name', 'e.g. Recessland')}
              </div>

              <div>
                <p className="text-[#444] text-[10px] uppercase tracking-wider mb-2">Venue</p>
                {inputField('venue', 'e.g. Fabric')}
              </div>

              <div>
                <p className="text-[#444] text-[10px] uppercase tracking-wider mb-2">Photographer</p>
                {inputField('photographer', 'Name…')}
              </div>

              <div>
                <p className="text-[#444] text-[10px] uppercase tracking-wider mb-2">Location</p>
                {inputField('location', 'e.g. London')}
              </div>

              <div>
                <p className="text-[#444] text-[10px] uppercase tracking-wider mb-2">Date range</p>
                <div className="space-y-1.5">
                  {inputField('date_from', 'From', 'date')}
                  {inputField('date_to',   'To',   'date')}
                </div>
              </div>

              <div>
                <p className="text-[#444] text-[10px] uppercase tracking-wider mb-2">Colour</p>
                <div className="flex flex-wrap gap-2">
                  {COLOUR_SWATCHES.map((s) => {
                    const isActive = filters.colour === s.name
                    return (
                      <button
                        key={s.name}
                        title={s.name}
                        onClick={() => setFilter('colour', isActive ? '' : s.name)}
                        className={clsx(
                          'w-5 h-5 rounded-full border-2 transition-all shrink-0',
                          isActive
                            ? 'scale-125 border-white shadow-lg'
                            : 'border-transparent hover:scale-110 hover:border-white/40',
                        )}
                        style={{
                          backgroundColor: s.bg,
                          boxShadow: isActive ? `0 0 0 2px ${s.ring}` : undefined,
                        }}
                        aria-label={s.name}
                        aria-pressed={isActive}
                      />
                    )
                  })}
                </div>
                {filters.colour && (
                  <p className="text-[#555] text-xs mt-1.5 capitalize">{filters.colour}</p>
                )}
              </div>

              <div>
                <p className="text-[#444] text-[10px] uppercase tracking-wider mb-2">File type</p>
                <div className="flex gap-1.5 flex-wrap">
                  {(['image', 'video', 'graphic'] as const).map((ft) => (
                    <button
                      key={ft}
                      onClick={() => setFilter('file_type', filters.file_type === ft ? '' : ft)}
                      className={clsx(
                        'text-xs px-2.5 py-1 rounded-full border transition-all capitalize',
                        filters.file_type === ft
                          ? 'bg-white/10 border-white/20 text-white'
                          : 'border-[#2a2a2a] text-[#555] hover:border-[#444] hover:text-[#888]',
                      )}
                    >
                      {ft}
                    </button>
                  ))}
                </div>
              </div>

              {hasActiveFilters && (
                <button
                  onClick={clearAll}
                  className="text-xs text-[#555] hover:text-white transition-colors"
                >
                  Clear all filters
                </button>
              )}
            </aside>
          )}

          {/* ── Results area ────────────────────────────────────────────────── */}
          <div className="flex-1 min-w-0">

            {/* Result count / status */}
            <div className="flex items-center gap-3 mb-5 min-h-[20px]">
              {loading ? (
                <Loader2 size={14} className="text-[#444] animate-spin" />
              ) : total !== null ? (
                <p className="text-[#555] text-sm">
                  <span className="text-white font-medium tabular-nums">{total}</span>
                  {' '}result{total !== 1 ? 's' : ''}
                  {query.trim() && (
                    <> for <span className="text-white">"{query.trim()}"</span></>
                  )}
                </p>
              ) : (
                <p className="text-[#333] text-sm">Type a search query to get started</p>
              )}
            </div>

            {/* Photo grid */}
            {photos.length > 0 && (
              <div className="columns-2 sm:columns-3 lg:columns-4 gap-2 space-y-2">
                {photos.map((photo, i) => (
                  <PhotoCard key={photo.id} photo={photo} onOpen={() => setLightboxIndex(i)} />
                ))}
              </div>
            )}

            {/* Empty state */}
            {!loading && total === 0 && (
              <div className="flex flex-col items-center justify-center py-24 text-center border border-dashed border-[#1f1f1f] rounded-lg">
                <Search size={28} className="text-[#333] mb-3" />
                <p className="text-[#555] text-sm">No results found</p>
                {hasActiveFilters && (
                  <button
                    onClick={clearAll}
                    className="mt-2 text-xs text-[#444] hover:text-white transition-colors underline underline-offset-2"
                  >
                    Clear filters
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Lightbox ─────────────────────────────────────────────────────────── */}
      {lightboxIndex !== null && (
        <SearchLightbox
          photos={photos}
          index={lightboxIndex}
          onClose={() => setLightboxIndex(null)}
          onNavigate={setLightboxIndex}
        />
      )}
    </div>
  )
}

// ─── Photo card ───────────────────────────────────────────────────────────────

function PhotoCard({ photo, onOpen }: { photo: FullPhotoResult; onOpen: () => void }) {
  const imgSrc = photo.signed_url ?? photo.public_url

  return (
    <div
      className="break-inside-avoid overflow-hidden rounded-lg bg-surface-0 border border-[#1a1a1a] cursor-pointer hover:border-[#333] transition-colors group"
      onClick={onOpen}
    >
      {imgSrc ? (
        <Image
          src={imgSrc}
          alt={photo.description ?? ''}
          width={400}
          height={300}
          className="w-full h-auto object-cover"
          unoptimized
        />
      ) : (
        <div className="aspect-video flex items-center justify-center">
          <ImageIcon size={20} className="text-[#333]" />
        </div>
      )}
      <div className="px-2.5 py-2">
        <p className="text-white text-xs font-medium truncate group-hover:underline underline-offset-1">
          {photo.event_name}
        </p>
        <p className="text-[#555] text-[10px] mt-0.5 tabular-nums">
          {fmtDate(photo.event_date)}
        </p>
      </div>
    </div>
  )
}

// ─── Search lightbox ──────────────────────────────────────────────────────────

function SearchLightbox({
  photos,
  index,
  onClose,
  onNavigate,
}: {
  photos: FullPhotoResult[]
  index: number
  onClose: () => void
  onNavigate: (i: number) => void
}) {
  const photo   = photos[index]
  const hasPrev = index > 0
  const hasNext = index < photos.length - 1
  const imgSrc = photo.signed_url ?? photo.public_url

  return (
    <div
      className="fixed inset-0 z-50 bg-black/90 flex"
      onClick={onClose}
    >
      {/* ── Image pane ──────────────────────────────────────────────────────── */}
      <div
        className="relative flex-1 flex items-center justify-center bg-[#080808]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 z-10 w-8 h-8 flex items-center justify-center text-white/50 hover:text-white bg-white/5 hover:bg-white/10 rounded-full transition-all"
          aria-label="Close"
        >
          <X size={18} />
        </button>

        {/* Prev */}
        {hasPrev && (
          <button
            onClick={() => onNavigate(index - 1)}
            className="absolute left-4 top-1/2 -translate-y-1/2 z-10 w-9 h-9 flex items-center justify-center text-white/50 hover:text-white bg-white/5 hover:bg-white/10 rounded-full transition-all"
            aria-label="Previous"
          >
            <ChevronLeft size={22} />
          </button>
        )}

        {/* Next */}
        {hasNext && (
          <button
            onClick={() => onNavigate(index + 1)}
            className="absolute right-4 top-1/2 -translate-y-1/2 z-10 w-9 h-9 flex items-center justify-center text-white/50 hover:text-white bg-white/5 hover:bg-white/10 rounded-full transition-all"
            aria-label="Next"
          >
            <ChevronRight size={22} />
          </button>
        )}

        {/* Counter */}
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 text-white/30 text-xs tabular-nums">
          {index + 1} / {photos.length}
        </div>

        {/* Photo */}
        <div className="relative w-full h-full">
          <Image
            src={imgSrc}
            alt={photo.description ?? photo.event_name}
            fill
            sizes="(min-width: 1024px) 70vw, 100vw"
            className="object-contain"
            priority
            unoptimized
          />
        </div>
      </div>

      {/* ── Detail pane ─────────────────────────────────────────────────────── */}
      <div
        className="w-72 shrink-0 bg-surface-0 border-l border-[#1a1a1a] flex flex-col overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 py-5 space-y-5">

          {/* Event */}
          <div>
            <p className="text-[#444] text-[10px] uppercase tracking-wider mb-1.5">Event</p>
            <p className="text-white text-sm font-medium leading-snug">{photo.event_name}</p>
            {photo.event_date && (
              <div className="flex items-center gap-1.5 mt-1">
                <Calendar size={11} className="text-[#555] shrink-0" />
                <p className="text-[#666] text-xs tabular-nums">{fmtDate(photo.event_date)}</p>
              </div>
            )}
          </div>

          {/* Photographer */}
          {photo.photographer && (
            <div>
              <p className="text-[#444] text-[10px] uppercase tracking-wider mb-1.5">Photographer</p>
              <div className="flex items-center gap-1.5">
                <Camera size={11} className="text-[#555] shrink-0" />
                <p className="text-white text-sm">{photo.photographer}</p>
              </div>
            </div>
          )}

          {/* Description */}
          {photo.description && (
            <div>
              <p className="text-[#444] text-[10px] uppercase tracking-wider mb-1.5">Description</p>
              <p className="text-[#888] text-xs leading-relaxed">{photo.description}</p>
            </div>
          )}

          {/* Matched tag */}
          {photo.matched_tag && (
            <div>
              <p className="text-[#444] text-[10px] uppercase tracking-wider mb-1.5">Matched tag</p>
              <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-white/8 border border-white/10 text-[#aaa]">
                <Tag size={9} />
                {photo.matched_tag}
              </span>
            </div>
          )}

          {/* Dominant colours */}
          {photo.dominant_colours?.length > 0 && (
            <div>
              <p className="text-[#444] text-[10px] uppercase tracking-wider mb-1.5">Colours</p>
              <div className="flex items-center gap-1.5 flex-wrap">
                <Palette size={11} className="text-[#555] shrink-0" />
                {photo.dominant_colours.map((c) => (
                  <span
                    key={c}
                    className="text-xs text-[#666] capitalize bg-white/5 px-1.5 py-px rounded"
                  >
                    {c}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* File type */}
          <div>
            <p className="text-[#444] text-[10px] uppercase tracking-wider mb-1.5">Type</p>
            <p className="text-[#555] text-xs uppercase tracking-wide">{photo.file_type}</p>
          </div>
        </div>

        {/* Footer — open in event */}
        <div className="mt-auto border-t border-[#1a1a1a] px-5 py-4">
          <Link
            href={`/projects/${photo.event_id}?photo=${photo.id}`}
            className="flex items-center justify-center gap-2 w-full px-3 py-2 text-xs text-[#888] hover:text-white border border-[#222] hover:border-[#444] rounded-lg transition-colors"
            onClick={onClose}
          >
            <ExternalLink size={12} />
            Open in project
          </Link>
        </div>
      </div>
    </div>
  )
}
