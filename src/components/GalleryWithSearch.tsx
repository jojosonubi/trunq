'use client'

import { useState, useMemo, useCallback, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Search, X, ImageIcon, Share2, User, Star, Download, FolderInput, Users, Tag as TagIcon, SlidersHorizontal, CheckSquare } from 'lucide-react'
import type { UserRole } from '@/lib/auth'
import clsx from 'clsx'
import MediaGrid from '@/components/MediaGrid'
import BulkRetag from '@/components/BulkRetag'
import SocialPanel from '@/components/SocialPanel'
import { buildZip } from '@/lib/zip'
import type { MediaFileWithTags, Event, Folder, Performer, Brand } from '@/types'

const QUICK_PILLS = [
  'indoor', 'outdoor', 'night', 'crowd', 'dancing',
  'stage', 'portrait', 'DJ', 'golden hour', 'energetic',
]

// Must match the enum in the tag API and the migration
const COLOUR_SWATCHES: { name: string; bg: string; ring: string }[] = [
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

interface Props {
  files: MediaFileWithTags[]
  untaggedImages: MediaFileWithTags[]
  event: Event
  folders?: Folder[]
  onAssignFolder?: (ids: string[], folderId: string | null) => Promise<void>
  performers?: Performer[]
  brands?: Brand[]
  initialOpenPhotoId?: string | null
  role?: UserRole
}

export default function GalleryWithSearch({ files, untaggedImages, event, folders, onAssignFolder, performers, brands, initialOpenPhotoId, role }: Props) {
  const router = useRouter()

  // ── Search state ─────────────────────────────────────────────────────────
  const [query, setQuery]             = useState('')
  const [activePills, setActivePills] = useState<Set<string>>(new Set())

  // ── Photographer filter ───────────────────────────────────────────────────
  const [activePhotographer, setActivePhotographer] = useState<string | null>(null)

  // ── Performer filter ──────────────────────────────────────────────────────
  const [activePerformerId, setActivePerformerId] = useState<string | null>(null)

  // ── Brand filter ──────────────────────────────────────────────────────────
  const [activeBrandId, setActiveBrandId] = useState<string | null>(null)

  // ── Star state ────────────────────────────────────────────────────────────
  const [showStarredOnly, setShowStarredOnly] = useState(false)
  const [starOverrides, setStarOverrides]     = useState<Record<string, boolean>>({})

  // ── Social-selection state ────────────────────────────────────────────────
  const [selectionMode, setSelectionMode] = useState(false)
  const [selectedIds, setSelectedIds]     = useState<Set<string>>(new Set())

  // ── Filter panel ──────────────────────────────────────────────────────────
  const [filterOpen, setFilterOpen]             = useState(false)
  const [activeStatus, setActiveStatus]         = useState<string | null>(null)
  const [activeFileType, setActiveFileType]     = useState<string | null>(null)
  const filterRef = useRef<HTMLDivElement>(null)

  // ── Colour filter ─────────────────────────────────────────────────────────
  const [activeColour, setActiveColour] = useState<string | null>(null)

  useEffect(() => {
    if (!filterOpen) return
    function onDown(e: MouseEvent) {
      if (filterRef.current && !filterRef.current.contains(e.target as Node)) setFilterOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [filterOpen])

  // ── AI-processing state (fed from BulkRetag) ─────────────────────────────
  const [processingIds, setProcessingIds] = useState<Set<string>>(new Set())

  // ── Download state ────────────────────────────────────────────────────────
  const [downloadState, setDownloadState] = useState<{ done: number; total: number } | null>(null)
  const downloadingRef = useRef(false)

  // ── Folder-select state ───────────────────────────────────────────────────
  const [folderSelectMode, setFolderSelectMode] = useState(false)
  const [folderSelectedIds, setFolderSelectedIds] = useState<Set<string>>(new Set())
  const [assigningFolder, setAssigningFolder] = useState(false)
  const cancelDownloadRef = useRef(false)
  const [rotations, setRotations] = useState<Record<string, number>>({})

  // ── Derived: unique photographers ────────────────────────────────────────
  const uniquePhotographers = useMemo(() => {
    const names = files.map((f) => f.photographer).filter((p): p is string => !!p)
    return [...new Set(names)].sort()
  }, [files])

  // ── Derived: filtered list ────────────────────────────────────────────────
  const isFiltered = query.trim() !== '' || activePills.size > 0 || activePhotographer !== null || showStarredOnly || activePerformerId !== null || activeBrandId !== null || activeStatus !== null || activeFileType !== null || activeColour !== null

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return files.filter((file) => {
      // Starred filter (applies optimistic overrides)
      const starred = file.id in starOverrides ? starOverrides[file.id] : file.starred
      if (showStarredOnly && !starred) return false

      // Performer filter
      if (activePerformerId !== null) {
        const hasPerformer = (file.performer_tags ?? []).some((pt) => pt.performer_id === activePerformerId)
        if (!hasPerformer) return false
      }

      // Brand filter
      if (activeBrandId !== null) {
        const hasBrand = (file.brand_tags ?? []).some((bt) => bt.brand_id === activeBrandId)
        if (!hasBrand) return false
      }

      // Review status filter
      if (activeStatus !== null && file.review_status !== activeStatus) return false

      // File type filter
      if (activeFileType !== null && file.file_type !== activeFileType) return false

      // Colour filter
      if (activeColour !== null && !(file.dominant_colours ?? []).includes(activeColour)) return false

      const tags = file.tags ?? []
      const textMatch =
        !q ||
        file.description?.toLowerCase().includes(q) ||
        tags.some((t) => t.value.toLowerCase().includes(q))
      const pillMatch =
        activePills.size === 0 ||
        [...activePills].some((pill) =>
          tags.some((t) => t.value.toLowerCase() === pill.toLowerCase())
        )
      const photographerMatch =
        !activePhotographer || file.photographer === activePhotographer
      return textMatch && pillMatch && photographerMatch
    })
  }, [files, query, activePills, activePhotographer, showStarredOnly, starOverrides, activePerformerId, activeBrandId, activeStatus, activeFileType, activeColour])

  // Images in the filtered view — what gets downloaded / shown in download btn
  const downloadableFiles = useMemo(
    () => filtered.filter((f) => f.file_type === 'image'),
    [filtered]
  )

  // ── Derived: sorted-by-quality images for social selection ───────────────
  const selectionFiles = useMemo(
    () => [...files].filter((f) => f.file_type === 'image').sort((a, b) => (b.quality_score ?? 0) - (a.quality_score ?? 0)),
    [files]
  )

  const recommendedIds = useMemo(
    () => new Set(selectionFiles.slice(0, 5).map((f) => f.id)),
    [selectionFiles]
  )

  // ── Derived: starred IDs set (for MediaGrid star indicator) ──────────────
  const starredIds = useMemo(
    () => new Set(
      files
        .filter((f) => (f.id in starOverrides ? starOverrides[f.id] : f.starred))
        .map((f) => f.id)
    ),
    [files, starOverrides]
  )

  // ── Star toggle ───────────────────────────────────────────────────────────
  const toggleStar = useCallback(async (id: string) => {
    const file = files.find((f) => f.id === id)
    if (!file) return
    const current = id in starOverrides ? starOverrides[id] : file.starred
    const next    = !current
    setStarOverrides((prev) => ({ ...prev, [id]: next }))
    try {
      await fetch('/api/star', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, starred: next }),
      })
      router.refresh()
    } catch {
      // Revert on network error
      setStarOverrides((prev) => ({ ...prev, [id]: current }))
    }
  }, [files, starOverrides, router])

  // ── Trash photo ───────────────────────────────────────────────────────────
  const handleTrashPhoto = useCallback(async (id: string) => {
    await fetch('/api/trash', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'photo', id }),
    })
    router.refresh()
  }, [router])

  // ── Download (zip with smart renaming) ───────────────────────────────────
  const downloadFiles = useCallback(async (filesToDownload: MediaFileWithTags[]) => {
    if (!filesToDownload.length || downloadingRef.current) return
    downloadingRef.current = true

    const eventSlug = event.name
      .replace(/[^a-zA-Z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .toUpperCase()
    const eventDate = event.date.slice(0, 10)

    setDownloadState({ done: 0, total: filesToDownload.length })

    const entries: { filename: string; data: Uint8Array }[] = []

    for (let i = 0; i < filesToDownload.length; i++) {
      const file = filesToDownload[i]
      const photographer = (file.photographer ?? 'unknown')
        .replace(/[^a-zA-Z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '')
        .toLowerCase()
      const renamedFilename = `${eventSlug}_${eventDate}_${photographer}_${file.filename}`

      try {
        const res = await fetch(
          `/api/download?path=${encodeURIComponent(file.storage_path)}&filename=${encodeURIComponent(file.filename)}`
        )
        if (res.ok) {
          entries.push({ filename: renamedFilename, data: new Uint8Array(await res.arrayBuffer()) })
        }
      } catch {
        // skip failed files — zip will contain what did succeed
      }

      setDownloadState({ done: i + 1, total: filesToDownload.length })
    }

    if (entries.length > 0) {
      const zipBlob = buildZip(entries)
      const url = URL.createObjectURL(zipBlob)
      const a   = document.createElement('a')
      a.href     = url
      a.download = `${eventSlug}_${eventDate}.zip`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    }

    downloadingRef.current = false
    setDownloadState(null)
  }, [event])

  // ── Folder-select actions ─────────────────────────────────────────────────
  function enterFolderSelectMode() {
    setFolderSelectedIds(new Set())
    setFolderSelectMode(true)
  }

  function enterFolderSelectModeWith(id: string) {
    setFolderSelectedIds(new Set([id]))
    setFolderSelectMode(true)
  }

  function selectAllVisible() {
    setFolderSelectedIds(new Set(filtered.map((f) => f.id)))
    setFolderSelectMode(true)
  }

  function exitFolderSelectMode() {
    setFolderSelectMode(false)
    setFolderSelectedIds(new Set())
  }

  const toggleFolderSelection = useCallback((id: string) => {
    setFolderSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  async function doAssignFolder(folderId: string | null) {
    if (!onAssignFolder || folderSelectedIds.size === 0 || assigningFolder) return
    setAssigningFolder(true)
    try {
      await onAssignFolder([...folderSelectedIds], folderId)
    } finally {
      setAssigningFolder(false)
    }
    exitFolderSelectMode()
  }

  // ── Selection actions ─────────────────────────────────────────────────────
  function enterSelectionMode() {
    setSelectedIds(new Set(selectionFiles.slice(0, 5).map((f) => f.id)))
    setSelectionMode(true)
  }

  function exitSelectionMode() {
    setSelectionMode(false)
    setSelectedIds(new Set())
  }

  const toggleSelection = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  const selectedFiles = useMemo(
    () => selectionFiles.filter((f) => selectedIds.has(f.id)),
    [selectionFiles, selectedIds]
  )

  // ── Normal-mode helpers ───────────────────────────────────────────────────
  function togglePill(pill: string) {
    setActivePills((prev) => {
      const next = new Set(prev)
      if (next.has(pill)) next.delete(pill)
      else next.add(pill)
      return next
    })
  }

  function clearAll() {
    setQuery('')
    setActivePills(new Set())
    setActivePhotographer(null)
    setShowStarredOnly(false)
    setActivePerformerId(null)
    setActiveBrandId(null)
    setActiveStatus(null)
    setActiveFileType(null)
    setActiveColour(null)
  }

  // ── Review status counts ──────────────────────────────────────────────────
  const statusCounts = useMemo(() => {
    const c = { approved: 0, held: 0, rejected: 0, pending: 0 }
    files.forEach((f) => {
      const s = (f.review_status ?? 'pending') as keyof typeof c
      c[s] = (c[s] ?? 0) + 1
    })
    return c
  }, [files])

  const hasReviews = statusCounts.approved + statusCounts.held + statusCounts.rejected > 0

  // ── Stars prop for MediaGrid ──────────────────────────────────────────────
  const starsProps = useMemo(() => ({
    isStarredFn: (id: string) => starredIds.has(id),
    onToggle: toggleStar,
  }), [starredIds, toggleStar])

  // ════════════════════════════════════════════════════════════════════════════
  // FOLDER SELECT MODE LAYOUT
  // ════════════════════════════════════════════════════════════════════════════
  if (folderSelectMode && folders && onAssignFolder) {
    return (
      <div>
        <div className="flex items-center justify-between mb-5">
          <div>
            <p className="text-white text-sm font-medium">Move to folder</p>
            <p className="text-[#555] text-xs mt-0.5">
              {folderSelectedIds.size === 0
                ? 'Click photos to select them'
                : `${folderSelectedIds.size} selected`}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setFolderSelectedIds(new Set(filtered.map((f) => f.id)))}
              className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 border border-[#1f1f1f] text-[#555] hover:text-white hover:border-[#333] rounded-lg transition-all"
            >
              <CheckSquare size={12} />
              Select all
            </button>
            {folderSelectedIds.size > 0 && (
              <>
                {/* Assign to existing folder */}
                {folders.map((folder) => (
                  <button
                    key={folder.id}
                    onClick={() => doAssignFolder(folder.id)}
                    disabled={assigningFolder}
                    className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 border border-[#1f1f1f] text-[#555] hover:text-white hover:border-[#333] rounded-lg transition-all disabled:opacity-40"
                  >
                    <FolderInput size={12} />
                    {folder.name}
                  </button>
                ))}
                {/* Remove from folder (unfiled) */}
                <button
                  onClick={() => doAssignFolder(null)}
                  disabled={assigningFolder}
                  className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 border border-[#1f1f1f] text-[#555] hover:text-white hover:border-[#333] rounded-lg transition-all disabled:opacity-40"
                >
                  <X size={12} />
                  Remove from folder
                </button>
              </>
            )}
            <button
              onClick={exitFolderSelectMode}
              className="inline-flex items-center gap-1.5 text-xs text-[#555] hover:text-white transition-colors px-3 py-1.5 border border-[#1f1f1f] hover:border-[#333] rounded-lg"
            >
              <X size={12} />
              Cancel
            </button>
          </div>
        </div>

        <MediaGrid
          files={filtered}
          compact
          selection={{
            selectedIds: folderSelectedIds,
            recommendedIds: new Set(),
            onToggle: toggleFolderSelection,
          }}
          stars={starsProps}
        />
      </div>
    )
  }

  // ════════════════════════════════════════════════════════════════════════════
  // SELECTION MODE LAYOUT
  // ════════════════════════════════════════════════════════════════════════════
  if (selectionMode) {
    return (
      <div className="flex gap-5 items-start">
        {/* Gallery pane */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between mb-5">
            <div>
              <p className="text-white text-sm font-medium">Pick for social media</p>
              <p className="text-[#555] text-xs mt-0.5">
                Sorted by quality score · {selectedIds.size} selected
              </p>
            </div>
            <div className="flex items-center gap-2">
              {/* Download selected */}
              {selectedFiles.length > 0 && (
                <button
                  onClick={() => downloadFiles(selectedFiles)}
                  disabled={!!downloadState}
                  className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 border border-[#1f1f1f] text-[#555] hover:text-white hover:border-[#333] rounded-lg transition-all disabled:opacity-40"
                >
                  <Download size={12} />
                  {downloadState
                    ? `${downloadState.done}/${downloadState.total}`
                    : `Download (${selectedFiles.length})`}
                </button>
              )}
              <button
                onClick={exitSelectionMode}
                className="inline-flex items-center gap-1.5 text-xs text-[#555] hover:text-white transition-colors px-3 py-1.5 border border-[#1f1f1f] hover:border-[#333] rounded-lg"
              >
                <X size={12} />
                Exit
              </button>
            </div>
          </div>

          <MediaGrid
            files={selectionFiles}
            compact
            selection={{ selectedIds, recommendedIds, onToggle: toggleSelection }}
            stars={starsProps}
          />
        </div>

        {/* Social panel */}
        <SocialPanel
          selectedFiles={selectedFiles}
          onDeselect={toggleSelection}
          onExit={exitSelectionMode}
        />
      </div>
    )
  }

  // ════════════════════════════════════════════════════════════════════════════
  // NORMAL MODE LAYOUT
  // ════════════════════════════════════════════════════════════════════════════
  return (
    <div>
      {/* ── Row 1: search + filter + download + pick for social ──────────── */}
      <div className="flex items-center gap-2 mb-3">
        <div className="relative flex-1">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#444] pointer-events-none" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search tags and descriptions…"
            className="w-full bg-surface-0 border border-[#1f1f1f] rounded-lg pl-9 pr-9 py-2 text-white text-sm placeholder:text-[#3a3a3a] focus:outline-none focus:border-[#333] transition-colors"
          />
          {query && (
            <button
              onClick={() => setQuery('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-[#555] hover:text-white transition-colors"
              aria-label="Clear search"
            >
              <X size={13} />
            </button>
          )}
        </div>

        {/* Filter button + dropdown */}
        <div ref={filterRef} className="relative shrink-0">
          {(() => {
            const activeFilterCount = (activeStatus !== null ? 1 : 0) + (activeFileType !== null ? 1 : 0) + activePills.size
            const hasActiveFilters  = activeFilterCount > 0
            return (
              <>
                <button
                  onClick={() => setFilterOpen((v) => !v)}
                  className={clsx(
                    'inline-flex items-center gap-1.5 px-3 py-2 border text-sm rounded-lg transition-all',
                    hasActiveFilters
                      ? 'border-white/30 text-white bg-white/8'
                      : 'border-[#1f1f1f] text-[#555] hover:text-white hover:border-[#333]'
                  )}
                >
                  <SlidersHorizontal size={14} />
                  Filters
                  {activeFilterCount > 0 && (
                    <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-white/20 text-white text-[9px] font-medium leading-none">
                      {activeFilterCount}
                    </span>
                  )}
                </button>

                {filterOpen && (
                  <div className="absolute top-full left-0 mt-1.5 w-64 bg-surface-0 border border-[#2a2a2a] rounded-xl shadow-2xl p-3 z-30 space-y-3">
                    {/* Tag chips */}
                    <div>
                      <p className="text-[#444] text-[10px] uppercase tracking-wider font-medium mb-2">Tags</p>
                      <div className="flex flex-wrap gap-1.5">
                        {QUICK_PILLS.map((pill) => (
                          <button
                            key={pill}
                            onClick={() => togglePill(pill)}
                            className={clsx(
                              'text-xs px-2.5 py-1 rounded-full border transition-all',
                              activePills.has(pill)
                                ? 'bg-white/10 border-white/25 text-white'
                                : 'border-[#2a2a2a] text-[#555] hover:border-[#444] hover:text-[#888]'
                            )}
                          >
                            {pill}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Review status */}
                    <div>
                      <p className="text-[#444] text-[10px] uppercase tracking-wider font-medium mb-2">Review status</p>
                      <div className="flex flex-wrap gap-1.5">
                        {(['pending', 'approved', 'held', 'rejected'] as const).map((s) => (
                          <button
                            key={s}
                            onClick={() => setActiveStatus((prev) => prev === s ? null : s)}
                            className={clsx(
                              'text-xs px-2.5 py-1 rounded-full border transition-all capitalize',
                              activeStatus === s
                                ? s === 'approved' ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-300'
                                : s === 'rejected' ? 'bg-red-500/20 border-red-500/40 text-red-300'
                                : s === 'held'     ? 'bg-amber-500/20 border-amber-500/40 text-amber-300'
                                : 'bg-white/10 border-white/20 text-white'
                                : 'border-[#2a2a2a] text-[#555] hover:border-[#444] hover:text-[#888]'
                            )}
                          >
                            {s}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* File type */}
                    <div>
                      <p className="text-[#444] text-[10px] uppercase tracking-wider font-medium mb-2">File type</p>
                      <div className="flex gap-1.5">
                        {(['image', 'video', 'graphic'] as const).map((ft) => (
                          <button
                            key={ft}
                            onClick={() => setActiveFileType((prev) => prev === ft ? null : ft)}
                            className={clsx(
                              'text-xs px-2.5 py-1 rounded-full border transition-all capitalize',
                              activeFileType === ft
                                ? 'bg-white/10 border-white/20 text-white'
                                : 'border-[#2a2a2a] text-[#555] hover:border-[#444] hover:text-[#888]'
                            )}
                          >
                            {ft}
                          </button>
                        ))}
                      </div>
                    </div>

                    {hasActiveFilters && (
                      <button
                        onClick={() => { setActiveStatus(null); setActiveFileType(null); setActivePills(new Set()) }}
                        className="text-xs text-[#555] hover:text-white transition-colors"
                      >
                        Clear all filters
                      </button>
                    )}
                  </div>
                )}
              </>
            )
          })()}
        </div>

        {/* Download all (images in current filtered view) */}
        {downloadableFiles.length > 0 && (
          <button
            onClick={() => downloadFiles(downloadableFiles)}
            disabled={!!downloadState}
            title={`Download ${downloadableFiles.length} photo${downloadableFiles.length !== 1 ? 's' : ''} as zip`}
            className="inline-flex items-center gap-1.5 px-3 py-2 border border-[#1f1f1f] text-[#555] text-sm hover:text-white hover:border-[#333] rounded-lg transition-all disabled:opacity-40 shrink-0"
          >
            <Download size={14} />
            {downloadState
              ? `${downloadState.done}/${downloadState.total}`
              : 'Download'}
          </button>
        )}

        {selectionFiles.length > 0 && (
          <button
            onClick={enterSelectionMode}
            className="inline-flex items-center gap-2 px-3 py-2 border border-[#1f1f1f] text-[#555] text-sm hover:text-white hover:border-[#333] rounded-lg transition-all shrink-0"
          >
            <Share2 size={14} />
            Pick for social
          </button>
        )}

        {folders && folders.length > 0 && onAssignFolder && (
          <button
            onClick={enterFolderSelectMode}
            className="inline-flex items-center gap-2 px-3 py-2 border border-[#1f1f1f] text-[#555] text-sm hover:text-white hover:border-[#333] rounded-lg transition-all shrink-0"
          >
            <FolderInput size={14} />
            Move
          </button>
        )}

        {filtered.length > 0 && (
          <button
            onClick={selectAllVisible}
            className="inline-flex items-center gap-2 px-3 py-2 border border-[#1f1f1f] text-[#555] text-sm hover:text-white hover:border-[#333] rounded-lg transition-all shrink-0"
          >
            <CheckSquare size={14} />
            Select all
          </button>
        )}
      </div>

      {/* ── Download progress bar ─────────────────────────────────────────── */}
      {downloadState && (
        <div className="flex items-center gap-3 mb-3 px-3 py-2 bg-surface-0 border border-[#1f1f1f] rounded-lg">
          <div className="flex-1 h-1 bg-surface-0 rounded-full overflow-hidden">
            <div
              className="h-full bg-blue-500 rounded-full transition-all duration-300"
              style={{ width: `${Math.round((downloadState.done / downloadState.total) * 100)}%` }}
            />
          </div>
          <span className="text-[#555] text-xs tabular-nums shrink-0 whitespace-nowrap">
            Preparing {downloadState.done}/{downloadState.total}…
          </span>
        </div>
      )}

      {/* ── Row 2: active chips (only when filter panel open or filter active) ── */}
      <div className="flex items-center gap-2 mb-2 flex-wrap">
        {/* Starred filter pill — show only when panel open or active */}
        {(filterOpen || showStarredOnly) && (
          <button
            onClick={() => setShowStarredOnly((v) => !v)}
            className={clsx(
              'inline-flex items-center gap-1.5 text-xs px-3 py-1 rounded-full border transition-all',
              showStarredOnly
                ? 'bg-amber-400/15 border-amber-400/40 text-amber-400'
                : 'border-[#1f1f1f] text-[#555] hover:border-[#333] hover:text-[#999]'
            )}
          >
            <Star size={10} fill={showStarredOnly ? 'currentColor' : 'none'} />
            Starred
          </button>
        )}

        {/* Active pill chips — show only when panel open or pills active */}
        {(filterOpen || activePills.size > 0) && [...activePills].map((pill) => (
          <button
            key={pill}
            onClick={() => togglePill(pill)}
            className="inline-flex items-center gap-1 text-xs px-3 py-1 rounded-full border border-white/25 bg-white/10 text-white transition-all"
          >
            {pill}
            <X size={9} />
          </button>
        ))}

        {isFiltered && activePills.size === 0 && !filterOpen && (
          <button
            onClick={clearAll}
            className="text-xs px-3 py-1 rounded-full border border-[#1f1f1f] text-[#555] hover:border-[#333] hover:text-[#999] transition-all"
          >
            Clear
          </button>
        )}

        <span className="ml-auto text-[#444] text-xs tabular-nums shrink-0">
          {isFiltered
            ? `${filtered.length} of ${files.length} files`
            : `${files.length} file${files.length !== 1 ? 's' : ''}`}
        </span>

        <BulkRetag untaggedImages={untaggedImages} onProcessingChange={setProcessingIds} />
      </div>

      {/* ── Row 3: photographer filter ────────────────────────────────────── */}
      {uniquePhotographers.length > 0 && (
        <div className="flex items-center gap-2 mb-5 flex-wrap">
          <span className="flex items-center gap-1 text-[#444] text-[10px] uppercase tracking-wider shrink-0">
            <User size={10} />
            By
          </span>
          {uniquePhotographers.map((name) => (
            <button
              key={name}
              onClick={() => setActivePhotographer((prev) => (prev === name ? null : name))}
              className={clsx(
                'text-xs px-3 py-1 rounded-full border transition-all',
                activePhotographer === name
                  ? 'bg-white/10 border-white/25 text-white'
                  : 'border-[#1f1f1f] text-[#555] hover:border-[#333] hover:text-[#999]'
              )}
            >
              {name}
            </button>
          ))}
        </div>
      )}

      {/* ── Row 4: performer filter ───────────────────────────────────────── */}
      {performers && performers.length > 0 && (() => {
        // Only show performers that have tagged photos in the current files
        const performerIdsInFiles = new Set(
          files.flatMap((f) => (f.performer_tags ?? []).map((pt) => pt.performer_id))
        )
        const visiblePerformers = performers.filter((p) => performerIdsInFiles.has(p.id))
        if (!visiblePerformers.length) return null
        return (
          <div className="flex items-center gap-2 mb-5 flex-wrap">
            <span className="flex items-center gap-1 text-[#444] text-[10px] uppercase tracking-wider shrink-0">
              <Users size={10} />
              Performers
            </span>
            {visiblePerformers.map((p) => (
              <button
                key={p.id}
                onClick={() => setActivePerformerId((prev) => (prev === p.id ? null : p.id))}
                className={clsx(
                  'text-xs px-3 py-1 rounded-full border transition-all',
                  activePerformerId === p.id
                    ? 'bg-teal-500/20 border-teal-500/40 text-teal-300'
                    : 'border-[#1f1f1f] text-[#555] hover:border-[#333] hover:text-[#999]'
                )}
              >
                {p.name}
              </button>
            ))}
          </div>
        )
      })()}

      {/* ── Row 5: brand filter ───────────────────────────────────────────── */}
      {brands && brands.length > 0 && (() => {
        const brandIdsInFiles = new Set(
          files.flatMap((f) => (f.brand_tags ?? []).map((bt) => bt.brand_id))
        )
        const visibleBrands = brands.filter((b) => brandIdsInFiles.has(b.id))
        if (!visibleBrands.length) return null
        return (
          <div className="flex items-center gap-2 mb-5 flex-wrap">
            <span className="flex items-center gap-1 text-[#444] text-[10px] uppercase tracking-wider shrink-0">
              <TagIcon size={10} />
              Brands
            </span>
            {visibleBrands.map((b) => (
              <button
                key={b.id}
                onClick={() => setActiveBrandId((prev) => (prev === b.id ? null : b.id))}
                className={clsx(
                  'text-xs px-3 py-1 rounded-full border transition-all',
                  activeBrandId === b.id
                    ? 'bg-orange-500/20 border-orange-500/40 text-orange-300'
                    : 'border-[#1f1f1f] text-[#555] hover:border-[#333] hover:text-[#999]'
                )}
              >
                {b.name}
              </button>
            ))}
          </div>
        )
      })()}

      {/* ── Row 6: colour filter swatches ────────────────────────────────── */}
      {files.some((f) => (f.dominant_colours ?? []).length > 0) && (
        <div className="flex items-center gap-2 mb-5 flex-wrap">
          <span className="text-[#444] text-[10px] uppercase tracking-wider shrink-0">Colour</span>
          {COLOUR_SWATCHES.map((swatch) => {
            const isActive = activeColour === swatch.name
            return (
              <button
                key={swatch.name}
                title={swatch.name}
                onClick={() => setActiveColour((prev) => prev === swatch.name ? null : swatch.name)}
                className={clsx(
                  'w-5 h-5 rounded-full border-2 transition-all shrink-0',
                  isActive ? 'scale-125 border-white shadow-lg' : 'border-transparent hover:scale-110 hover:border-white/40',
                )}
                style={{ backgroundColor: swatch.bg, boxShadow: isActive ? `0 0 0 2px ${swatch.ring}` : undefined }}
                aria-label={swatch.name}
                aria-pressed={isActive}
              />
            )
          })}
          {activeColour && (
            <span className="text-[#555] text-xs ml-1 capitalize">{activeColour}</span>
          )}
        </div>
      )}

      {/* ── Review status summary ─────────────────────────────────────────── */}
      {hasReviews && (
        <div className="flex items-center gap-2 mb-4 text-xs flex-wrap">
          <span className="text-emerald-400 tabular-nums">{statusCounts.approved} approved</span>
          <span className="text-[#2a2a2a]">·</span>
          <span className="text-amber-400 tabular-nums">{statusCounts.held} held</span>
          <span className="text-[#2a2a2a]">·</span>
          <span className="text-red-400 tabular-nums">{statusCounts.rejected} rejected</span>
          <span className="text-[#2a2a2a]">·</span>
          <span className="text-[#555] tabular-nums">{statusCounts.pending} pending</span>
        </div>
      )}

      {/* ── Gallery ───────────────────────────────────────────────────────── */}
      {filtered.length > 0 ? (
        <MediaGrid
          files={filtered}
          stars={starsProps}
          folderProps={folders && onAssignFolder
            ? (file) => ({
                folders,
                currentFolderId: file.folder_id,
                onAssign: (folderId) => onAssignFolder([file.id], folderId),
              })
            : undefined}
          initialOpenPhotoId={initialOpenPhotoId}
          event={event}
          onTrash={role === 'admin' ? handleTrashPhoto : undefined}
          onQuickSelect={enterFolderSelectModeWith}
          processingIds={processingIds}
        />
      ) : (
        <div className="flex flex-col items-center justify-center py-20 text-center border border-dashed border-[#1f1f1f] rounded-lg">
          <ImageIcon size={28} className="text-[#333] mb-3" />
          <p className="text-[#666] text-sm">No files match your search.</p>
          <button
            onClick={clearAll}
            className="mt-2 text-xs text-[#444] hover:text-white transition-colors underline underline-offset-2"
          >
            Clear filters
          </button>
        </div>
      )}
    </div>
  )
}
