'use client'

import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import {
  Search, X, Loader2, ImageIcon, SlidersHorizontal, ArrowLeft,
  ChevronLeft, ChevronRight, ExternalLink, Tag, Calendar, Camera, Palette,
  Check, FolderPlus, Sparkles,
} from 'lucide-react'
import AddToCollectionModal from '@/components/AddToCollectionModal'
import Lightbox, { type LightboxFile } from '@/components/Lightbox'
import SelectionBar from '@/components/SelectionBar'
import Button from '@/components/ui/Button'
import { toast } from '@/components/ui/Toast'
import clsx from 'clsx'
import type { FullPhotoResult } from '@/app/api/search/full/route'
import { formatDate as fmtDate } from '@/lib/format'
import { COLOUR_SWATCHES } from '@/lib/colours'


// ─── Helpers ──────────────────────────────────────────────────────────────────
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
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [collectModalOpen, setCollectModalOpen] = useState(false)
  const [mode, setMode] = useState<'keyword' | 'semantic'>('keyword')

  // Full-detail lightbox files: full-size image URL + DD/MM/YYYY event date.
  const lightboxFiles = useMemo<LightboxFile[]>(() => photos.map((p) => ({
    ...p,
    signed_url: p.full_url ?? p.signed_url,
    event_date: fmtDate(p.event_date),
  })), [photos])

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const inputRef    = useRef<HTMLInputElement>(null)
  const runIdRef    = useRef(0)

  // ── Fetch results ────────────────────────────────────────────────────────────

  const fetchResults = useCallback(async (q: string, f: Filters, m: 'keyword' | 'semantic') => {
    // Monotonic run id: a slow earlier response must never clobber the
    // results of a later query (classic debounced-search race).
    const runId = ++runIdRef.current
    // Semantic mode is pure vector similarity on the query text — the structured
    // filter sidebar doesn't apply, so it only needs q (≥2 chars).
    if (m === 'semantic') {
      if (q.trim().length < 2) { setPhotos([]); setTotal(null); setLoading(false); return }
    } else if (q.trim().length < 2 && Object.values(f).every((v) => !v)) {
      setPhotos([]); setTotal(null); setLoading(false); return
    }
    setLoading(true)
    try {
      const url = m === 'semantic'
        ? `/api/search/semantic?q=${encodeURIComponent(q.trim())}`
        : `/api/search/full?${buildParams(q.trim(), f)}`
      const res  = await fetch(url)
      const data = await res.json() as { photos: FullPhotoResult[]; total: number }
      if (runId !== runIdRef.current) return
      setPhotos(data.photos ?? [])
      setTotal(data.total ?? 0)
    } catch {
      if (runId !== runIdRef.current) return
      setPhotos([])
      setTotal(0)
      toast('Search failed — try again', 'error')
    } finally {
      if (runId === runIdRef.current) setLoading(false)
    }
  }, [])

  // Debounce every change
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => fetchResults(query, filters, mode), 300)
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
  }, [query, filters, mode, fetchResults])

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

  // ── Selection (persists across searches so picks can be gathered from several queries) ──

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function selectAllResults() {
    setSelected((prev) => {
      const next = new Set(prev)
      for (const p of photos) next.add(p.id)
      return next
    })
  }

  // ── Lightbox keyboard nav ─────────────────────────────────────────────────────

  function handleSearchKey(e: React.KeyboardEvent) {
    if (e.key === 'Enter') {
      const q = query.trim()
      if (q) window.history.replaceState(null, '', `/search?q=${encodeURIComponent(q)}`)
    }
  }

  // Keyboard nav + body scroll lock live inside the shared <Lightbox> —
  // duplicating them here would double-fire arrow navigation.

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
        'w-full bg-surface-0 border border-[#1f1f1f] rounded-lg px-3 py-2 text-white text-sm placeholder:text-[#3a3a3a] focus:outline-none focus:border-[#333] transition-colors',
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
              placeholder={mode === 'semantic' ? 'Describe a vibe — "euphoric golden hour crowd"…' : 'Search photos, projects, tags…'}
              autoComplete="off"
              className="w-full bg-surface-0 border border-[#1f1f1f] rounded-lg pl-9 pr-8 py-2.5 text-white text-base placeholder:text-[#2a2a2a] focus:outline-none focus:border-[#333] transition-colors"
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

          {/* Keyword / Semantic mode toggle */}
          <div className="shrink-0 flex items-center rounded-lg border border-[#1f1f1f] overflow-hidden text-sm">
            {(['keyword', 'semantic'] as const).map((m) => (
              <button
                key={m}
                onClick={() => setMode(m)}
                className={clsx(
                  'px-3 py-2 transition-colors capitalize',
                  mode === m ? 'bg-white/10 text-white' : 'text-[#555] hover:text-white'
                )}
                title={m === 'semantic' ? 'Search by meaning & visual similarity' : 'Match tags, descriptions, filters'}
              >
                {m === 'semantic' ? 'Vibe' : 'Keyword'}
              </button>
            ))}
          </div>

          {/* Filters toggle — keyword mode only (semantic ignores structured filters) */}
          {mode === 'keyword' && (
            <button
              onClick={() => setFiltersOpen((v) => !v)}
              className={clsx(
                'shrink-0 inline-flex items-center gap-1.5 px-3 py-2 border text-sm rounded-lg transition-all',
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
          )}
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-6 py-8">

        {/* ── Active filter pills ──────────────────────────────────────────── */}
        {hasActiveFilters && (
          <div className="flex items-center gap-2 flex-wrap mb-5">
            {activeFilterKeys.map((key) => (
              <span
                key={key}
                className="inline-flex items-center gap-1.5 bg-white/8 border border-white/15 text-white text-sm px-2.5 py-1 rounded-full"
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
              className="text-sm text-[#555] hover:text-white transition-colors ml-1"
            >
              Clear all
            </button>
          </div>
        )}

        <div className="flex gap-8 items-start">

          {/* ── Filter sidebar ──────────────────────────────────────────────── */}
          {mode === 'keyword' && filtersOpen && (
            <aside className="w-56 shrink-0 space-y-5">

              <div>
                <p className="text-[#444] text-xs uppercase tracking-wider mb-2">Project name</p>
                {inputField('event_name', 'e.g. Recessland')}
              </div>

              <div>
                <p className="text-[#444] text-xs uppercase tracking-wider mb-2">Venue</p>
                {inputField('venue', 'e.g. Fabric')}
              </div>

              <div>
                <p className="text-[#444] text-xs uppercase tracking-wider mb-2">Photographer</p>
                {inputField('photographer', 'Name…')}
              </div>

              <div>
                <p className="text-[#444] text-xs uppercase tracking-wider mb-2">Location</p>
                {inputField('location', 'e.g. London')}
              </div>

              <div>
                <p className="text-[#444] text-xs uppercase tracking-wider mb-2">Date range</p>
                <div className="space-y-1.5">
                  {inputField('date_from', 'From', 'date')}
                  {inputField('date_to',   'To',   'date')}
                </div>
              </div>

              <div>
                <p className="text-[#444] text-xs uppercase tracking-wider mb-2">Colour</p>
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
                  <p className="text-[#555] text-sm mt-1.5 capitalize">{filters.colour}</p>
                )}
              </div>

              <div>
                <p className="text-[#444] text-xs uppercase tracking-wider mb-2">File type</p>
                <div className="flex gap-1.5 flex-wrap">
                  {(['image', 'video', 'graphic'] as const).map((ft) => (
                    <button
                      key={ft}
                      onClick={() => setFilter('file_type', filters.file_type === ft ? '' : ft)}
                      className={clsx(
                        'text-sm px-2.5 py-1 rounded-full border transition-all capitalize',
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
                  className="text-sm text-[#555] hover:text-white transition-colors"
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
                <p className="text-[#555] text-base">
                  <span className="text-white font-medium tabular-nums">{total}</span>
                  {' '}result{total !== 1 ? 's' : ''}
                  {query.trim() && (
                    <> for <span className="text-white">"{query.trim()}"</span></>
                  )}
                  {mode === 'semantic' && total > 0 && (
                    <span className="text-[#444]"> · ranked by similarity</span>
                  )}
                </p>
              ) : (
                <p className="text-[#333] text-base">
                  {mode === 'semantic' ? 'Describe what you’re looking for' : 'Type a search query to get started'}
                </p>
              )}
            </div>

            {/* Photo grid */}
            {photos.length > 0 && (
              <div className="columns-2 sm:columns-3 lg:columns-4 gap-2 space-y-2">
                {photos.map((photo, i) => (
                  <PhotoCard
                    key={photo.id}
                    photo={photo}
                    onOpen={() => setLightboxIndex(i)}
                    selected={selected.has(photo.id)}
                    selectionActive={selected.size > 0}
                    onToggleSelect={() => toggleSelect(photo.id)}
                  />
                ))}
              </div>
            )}

            {/* Empty state */}
            {!loading && total === 0 && (
              <div className="flex flex-col items-center justify-center py-24 text-center border border-dashed border-[#1f1f1f] rounded-lg">
                <Search size={28} className="text-[#333] mb-3" />
                <p className="text-[#555] text-base">No results found</p>
                {hasActiveFilters && (
                  <button
                    onClick={clearAll}
                    className="mt-2 text-sm text-[#444] hover:text-white transition-colors underline underline-offset-2"
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
        <Lightbox
          files={lightboxFiles}
          index={lightboxIndex}
          onClose={() => setLightboxIndex(null)}
          onNavigate={setLightboxIndex}
          showSimilar
          openInProject
        />
      )}

      {/* ── Selection action bar (shared inline-selection standard) ──────────── */}
      {selected.size > 0 && (
        <SelectionBar
          count={selected.size}
          hasUnselected={photos.some((p) => !selected.has(p.id))}
          selectAllLabel={`Select all ${photos.length}`}
          onSelectAll={selectAllResults}
          onClear={() => setSelected(new Set())}
        >
          <Button variant="primary" pill onClick={() => setCollectModalOpen(true)}>
            <FolderPlus size={15} />
            Add to collection
          </Button>
        </SelectionBar>
      )}

      {/* ── Add-to-collection modal ──────────────────────────────────────────── */}
      {collectModalOpen && (
        <AddToCollectionModal
          mediaIds={[...selected]}
          onClose={() => setCollectModalOpen(false)}
          onAdded={() => setSelected(new Set())}
        />
      )}
    </div>
  )
}

// ─── Photo card ───────────────────────────────────────────────────────────────

function PhotoCard({
  photo,
  onOpen,
  selected,
  selectionActive,
  onToggleSelect,
}: {
  photo: FullPhotoResult
  onOpen: () => void
  selected: boolean
  selectionActive: boolean
  onToggleSelect: () => void
}) {
  const imgSrc = photo.signed_url ?? photo.public_url

  return (
    <div
      className={clsx(
        'relative break-inside-avoid overflow-hidden rounded-lg bg-surface-0 border cursor-pointer transition-colors group',
        selected ? 'border-white/70' : 'border-[#1a1a1a] hover:border-[#333]'
      )}
      onClick={selectionActive ? onToggleSelect : onOpen}
    >
      {/* Select toggle — visible on hover, or always while a selection is active */}
      <button
        onClick={(e) => { e.stopPropagation(); onToggleSelect() }}
        aria-label={selected ? 'Deselect photo' : 'Select photo'}
        aria-pressed={selected}
        className={clsx(
          'absolute top-2 left-2 z-10 w-6 h-6 rounded-full border flex items-center justify-center transition-all',
          selected
            ? 'bg-white border-white text-black opacity-100'
            : 'bg-black/50 border-white/40 text-transparent opacity-0 group-hover:opacity-100 hover:border-white',
          selectionActive && 'opacity-100'
        )}
      >
        <Check size={13} strokeWidth={3} />
      </button>
      {imgSrc ? (
        <Image
          src={imgSrc}
          alt={photo.description ?? ''}
          width={400}
          height={300}
          className={clsx('w-full h-auto object-cover', selected && 'opacity-80')}
          unoptimized
        />
      ) : (
        <div className="aspect-video flex items-center justify-center">
          <ImageIcon size={20} className="text-[#333]" />
        </div>
      )}
      <div className="px-2.5 py-2">
        <p className="text-white text-sm font-medium truncate group-hover:underline underline-offset-1">
          {photo.event_name}
        </p>
        <p className="text-[#555] text-xs mt-0.5 tabular-nums">
          {fmtDate(photo.event_date)}
        </p>
      </div>
    </div>
  )
}
