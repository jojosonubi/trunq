'use client'

import { useState, useCallback, useMemo, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Pill from '@/components/ui/Pill'
import clsx from 'clsx'
import GalleryWithSearch from '@/components/GalleryWithSearch'
import ReviewTab from '@/components/ReviewTab'
import FolderSidebar from '@/components/FolderSidebar'
import PerformersTab from '@/components/PerformersTab'
import BrandsTab from '@/components/BrandsTab'
import type { MediaFileWithTags, Event, Folder, Performer, Brand } from '@/types'
import type { UserRole } from '@/lib/auth'

// ─── Types ────────────────────────────────────────────────────────────────────

type Tab = 'gallery' | 'review' | 'performers' | 'brands'

interface Props {
  files: MediaFileWithTags[]
  untaggedImages: MediaFileWithTags[]
  eventId: string
  event: Event
  initialFolders: Folder[]
  initialPerformers: Performer[]
  initialBrands: Brand[]
  initialTab?: Tab
  initialOpenPhotoId?: string | null
  role?: UserRole
}

// ─── EventTabs ────────────────────────────────────────────────────────────────

export default function EventTabs({
  files,
  untaggedImages,
  eventId,
  event,
  initialFolders,
  initialPerformers,
  initialBrands,
  initialTab,
  initialOpenPhotoId,
  role = 'admin',
}: Props) {
  const router = useRouter()

  // Role-gated tabs
  const allowedTabs: Tab[] = role === 'admin'
    ? ['gallery', 'review', 'performers', 'brands']
    : role === 'producer'
    ? ['gallery', 'review']
    : ['gallery']

  const [tab, setTab] = useState<Tab>(
    initialTab && allowedTabs.includes(initialTab as Tab) ? (initialTab as Tab) : 'gallery'
  )

  // Auto-switch to Review when uploads complete
  useEffect(() => {
    function onUploadsComplete() {
      if (allowedTabs.includes('review')) setTab('review')
    }
    window.addEventListener('uploads-complete', onUploadsComplete)
    return () => window.removeEventListener('uploads-complete', onUploadsComplete)
  }, [allowedTabs])
  // ── Folder state ──────────────────────────────────────────────────────────

  const [folders, setFolders]                   = useState<Folder[]>(initialFolders)
  /** Optimistic overrides: file id → folder_id (null = unfiled) */
  const [folderOverrides, setFolderOverrides]   = useState<Record<string, string | null>>({})
  /** Which folder is selected in the sidebar (null = All, '__unfiled__' = Unfiled) */
  const [activeFolderId, setActiveFolderId]     = useState<string | null>(null)

  // Files with overrides applied
  const filesWithFolders = useMemo(
    () => files.map((f) => f.id in folderOverrides ? { ...f, folder_id: folderOverrides[f.id] } : f),
    [files, folderOverrides]
  )

  // Files visible in the gallery based on sidebar selection
  const visibleFiles = useMemo(() => {
    if (activeFolderId === null) return filesWithFolders
    if (activeFolderId === '__unfiled__') return filesWithFolders.filter((f) => !f.folder_id)
    return filesWithFolders.filter((f) => f.folder_id === activeFolderId)
  }, [filesWithFolders, activeFolderId])

  const visibleUntagged = useMemo(
    () => visibleFiles.filter((f) => f.file_type === 'image' && (!f.tags || f.tags.length === 0)),
    [visibleFiles]
  )

  // Count of files per folder (uses overrides)
  const folderCounts = useMemo(() => {
    const counts: Record<string, number> = {}
    filesWithFolders.forEach((f) => {
      if (f.folder_id) counts[f.folder_id] = (counts[f.folder_id] ?? 0) + 1
    })
    return counts
  }, [filesWithFolders])

  // ── Folder CRUD ───────────────────────────────────────────────────────────

  const createFolder = useCallback(async (name: string) => {
    const res  = await fetch('/api/folders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ event_id: eventId, name }),
    })
    const json = await res.json() as { folder?: Folder }
    if (json.folder) {
      setFolders((prev) => [...prev, json.folder!])
    }
  }, [eventId])

  const renameFolder = useCallback(async (id: string, name: string) => {
    const res  = await fetch(`/api/folders/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    })
    const json = await res.json() as { folder?: Folder }
    if (json.folder) {
      setFolders((prev) => prev.map((f) => f.id === id ? json.folder! : f))
    }
  }, [])

  const deleteFolder = useCallback(async (id: string) => {
    await fetch(`/api/folders/${id}`, { method: 'DELETE' })
    setFolders((prev) => prev.filter((f) => f.id !== id))
    // Remove overrides that pointed to this folder
    setFolderOverrides((prev) => {
      const next = { ...prev }
      Object.keys(next).forEach((fileId) => { if (next[fileId] === id) next[fileId] = null })
      return next
    })
    if (activeFolderId === id) setActiveFolderId(null)
    router.refresh()
  }, [activeFolderId, router])

  // ── Folder assignment ─────────────────────────────────────────────────────

  const assignFolder = useCallback(async (ids: string[], folderId: string | null) => {
    // Optimistic update
    setFolderOverrides((prev) => {
      const next = { ...prev }
      ids.forEach((id) => { next[id] = folderId })
      return next
    })
    try {
      await fetch('/api/folders/assign', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids, folder_id: folderId }),
      })
      router.refresh()
    } catch {
      // Revert on error
      setFolderOverrides((prev) => {
        const next = { ...prev }
        ids.forEach((id) => { delete next[id] })
        return next
      })
    }
  }, [router])

  const approvedCount  = files.filter((f) => f.review_status === 'approved').length
  const pendingCount   = files.filter((f) => f.review_status === 'pending').length
  const heldCount      = files.filter((f) => f.review_status === 'held').length
  const rejectedCount  = files.filter((f) => f.review_status === 'rejected').length

  const TAB_LABELS: Record<Tab, string> = {
    gallery:    'Gallery',
    review:     'Review',
    performers: 'Performers',
    brands:     'Brands',
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div>
      {/* ── Tab bar ─────────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: 'var(--border-rule)', marginBottom: 20 }}>
        {/* Tabs */}
        <div style={{ display: 'flex' }}>
          {allowedTabs.map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              style={{
                display:      'inline-flex',
                alignItems:   'center',
                gap:          6,
                padding:      '8px 12px',
                fontSize:     12,
                fontWeight:   tab === t ? 500 : 400,
                color:        tab === t ? 'var(--text-primary)' : 'var(--text-muted)',
                background:   'none',
                border:       'none',
                borderBottom: tab === t ? '1.5px solid var(--accent)' : '1.5px solid transparent',
                marginBottom: -1,
                cursor:       'pointer',
                fontFamily:   'inherit',
                transition:   'color 0.15s',
              }}
            >
              {TAB_LABELS[t]}
              {t === 'review' && pendingCount > 0 && (
                <Pill variant="ghost">{pendingCount}</Pill>
              )}
              {t === 'performers' && initialPerformers.length > 0 && (
                <Pill variant="ghost">{initialPerformers.length}</Pill>
              )}
              {t === 'brands' && initialBrands.length > 0 && (
                <Pill variant="ghost">{initialBrands.length}</Pill>
              )}
            </button>
          ))}
        </div>

        {/* Right side: status pills */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, paddingBottom: 6 }}>
          {approvedCount > 0 && <Pill variant="approved">{approvedCount} approved</Pill>}
          {heldCount     > 0 && <Pill variant="ghost">{heldCount} held</Pill>}
          {rejectedCount > 0 && <Pill variant="flagged">{rejectedCount} rejected</Pill>}
        </div>
      </div>

      {/* ── Tab content ─────────────────────────────────────────────────── */}
      {tab === 'gallery' ? (
        <div className="flex gap-6 items-start">
          {/* Folder sidebar — hidden on mobile, sticky */}
          <div className="hidden sm:block" style={{ position: 'sticky', top: 44, alignSelf: 'flex-start', maxHeight: 'calc(100vh - 60px)', overflowY: 'auto' }}>
          <FolderSidebar
            folders={folders}
            folderCounts={folderCounts}
            totalCount={filesWithFolders.length}
            activeFolderId={activeFolderId}
            onSelect={setActiveFolderId}
            onCreateFolder={createFolder}
            onRenameFolder={renameFolder}
            onDeleteFolder={deleteFolder}
            onFileDrop={(folderId, fileId) => assignFolder([fileId], folderId)}
          />
          </div>

          {/* Gallery */}
          <div className="flex-1 min-w-0">
            <GalleryWithSearch
              files={visibleFiles}
              untaggedImages={visibleUntagged}
              event={event}
              folders={folders}
              onAssignFolder={assignFolder}
              performers={initialPerformers}
              brands={initialBrands}
              initialOpenPhotoId={initialOpenPhotoId}
              role={role}
            />
          </div>
        </div>
      ) : tab === 'review' ? (
        <ReviewTab files={files} eventId={eventId} />
      ) : tab === 'performers' ? (
        <PerformersTab
          eventId={eventId}
          initialPerformers={initialPerformers}
          mediaFiles={files}
        />
      ) : (
        <BrandsTab
          eventId={eventId}
          initialBrands={initialBrands}
          mediaFiles={files}
        />
      )}
    </div>
  )
}
