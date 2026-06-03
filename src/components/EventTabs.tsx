'use client'

import { useState, useCallback, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import Pill from '@/components/ui/Pill'
import clsx from 'clsx'
import GalleryWithSearch from '@/components/GalleryWithSearch'
import FolderSidebar from '@/components/FolderSidebar'
import PerformersTab from '@/components/PerformersTab'
import BrandsTab from '@/components/BrandsTab'
import SharesTab from '@/components/SharesTab'
import type { MediaFileWithTags, Event, Folder, Performer, Brand } from '@/types'
import type { UserRole } from '@/lib/auth'

// ─── Types ────────────────────────────────────────────────────────────────────

type Tab = 'gallery' | 'performers' | 'brands' | 'shares'

interface Props {
  /** First page of signed files from the server. GalleryWithSearch fetches the rest. */
  initialFiles: MediaFileWithTags[]
  /** Cursor for GalleryWithSearch to fetch page 2+. Null when all files fit in first page. */
  initialCursor: string | null
  /** Folder-assignment counts from the server (all files, not just first page). */
  initialFolderCounts: Record<string, number>
  /** Total image count for the sidebar "All" row. */
  totalCount: number
  eventId: string
  event: Event
  initialFolders: Folder[]
  initialPerformers: Performer[]
  initialBrands: Brand[]
  initialTab?: Tab
  initialOpenPhotoId?: string | null
  role?: UserRole
  /** Aggregate-derived list of all photographer names for this event — volume-proof */
  distinctPhotographers?: string[]
}

// ─── EventTabs ────────────────────────────────────────────────────────────────

export default function EventTabs({
  initialFiles,
  initialCursor,
  initialFolderCounts,
  totalCount,
  eventId,
  event,
  initialFolders,
  initialPerformers,
  initialBrands,
  initialTab,
  initialOpenPhotoId,
  role = 'admin',
  distinctPhotographers,
}: Props) {
  const router = useRouter()

  // Role-gated tabs
  const allowedTabs: Tab[] = role === 'admin'
    ? ['gallery', 'performers', 'brands', 'shares']
    : role === 'producer'
    ? ['gallery', 'shares']
    : ['gallery']

  const [tab, setTab] = useState<Tab>(
    initialTab && allowedTabs.includes(initialTab as Tab) ? (initialTab as Tab) : 'gallery'
  )

  // ── Folder state ──────────────────────────────────────────────────────────

  const [folders, setFolders]                 = useState<Folder[]>(initialFolders)
  /** Optimistic overrides: file id → folder_id (null = unfiled) */
  const [folderOverrides, setFolderOverrides] = useState<Record<string, string | null>>({})
  /** Which folder is selected in the sidebar (null = All, '__unfiled__' = Unfiled) */
  const [activeFolderId, setActiveFolderId]   = useState<string | null>(null)

  // Folder counts come from the server (all files, not just the first page).
  // No dynamic adjustment needed — they refresh on next page load.
  const folderCounts = initialFolderCounts

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

  const TAB_LABELS: Record<Tab, string> = {
    gallery:    'Gallery',
    performers: 'Performers',
    brands:     'Brands',
    shares:     'Shares',
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
              {t === 'performers' && initialPerformers.length > 0 && (
                <Pill variant="ghost">{initialPerformers.length}</Pill>
              )}
              {t === 'brands' && initialBrands.length > 0 && (
                <Pill variant="ghost">{initialBrands.length}</Pill>
              )}
            </button>
          ))}
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
            totalCount={totalCount}
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
              eventId={eventId}
              initialFiles={initialFiles}
              initialCursor={initialCursor}
              totalCount={totalCount}
              activeFolderId={activeFolderId}
              folderOverrides={folderOverrides}
              event={event}
              folders={folders}
              onAssignFolder={assignFolder}
              performers={initialPerformers}
              brands={initialBrands}
              initialOpenPhotoId={initialOpenPhotoId}
              role={role}
              allPhotographers={distinctPhotographers}
            />
          </div>
        </div>
      ) : tab === 'performers' ? (
        <PerformersTab
          eventId={eventId}
          initialPerformers={initialPerformers}
          mediaFiles={initialFiles}
        />
      ) : tab === 'brands' ? (
        <BrandsTab
          eventId={eventId}
          initialBrands={initialBrands}
          mediaFiles={initialFiles}
        />
      ) : (
        <SharesTab projectId={eventId} />
      )}
    </div>
  )
}
