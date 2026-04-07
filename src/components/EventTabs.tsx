'use client'

import { useState, useCallback, useMemo, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Link2, Copy, Check } from 'lucide-react'
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
  existingToken: string | null
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
  existingToken,
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
  const [token, setToken]       = useState<string | null>(existingToken)
  const [generating, setGenerating] = useState(false)
  const [copied, setCopied]     = useState(false)

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

  // ── Delivery link actions ─────────────────────────────────────────────────

  async function generateLink() {
    setGenerating(true)
    try {
      const res  = await fetch('/api/delivery', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ event_id: eventId }),
      })
      const json = await res.json() as { token?: string }
      if (json.token) setToken(json.token)
    } finally {
      setGenerating(false)
    }
  }

  async function copyLink() {
    if (!token) return
    await navigator.clipboard.writeText(`${window.location.origin}/delivery/${token}`)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

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
                fontSize:     11,
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

        {/* Right side: status pills + delivery link */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, paddingBottom: 6 }}>
          {approvedCount > 0 && <Pill variant="approved">{approvedCount} approved</Pill>}
          {heldCount     > 0 && <Pill variant="ghost">{heldCount} held</Pill>}
          {rejectedCount > 0 && <Pill variant="flagged">{rejectedCount} rejected</Pill>}

          {role !== 'photographer' && (
            token ? (
              <>
                <span style={{ color: 'var(--text-dim)', fontSize: 11, fontFamily: 'monospace' }}>
                  /delivery/{token.slice(0, 8)}…
                </span>
                <button
                  onClick={copyLink}
                  style={{
                    display:      'inline-flex',
                    alignItems:   'center',
                    gap:          4,
                    fontSize:     10,
                    color:        'var(--text-muted)',
                    background:   'transparent',
                    border:       'var(--border-rule)',
                    borderRadius: 2,
                    padding:      '3px 8px',
                    cursor:       'pointer',
                    fontFamily:   'inherit',
                  }}
                >
                  {copied ? <Check size={10} style={{ color: 'var(--approved-fg)' }} /> : <Copy size={10} />}
                  {copied ? 'Copied' : 'Copy link'}
                </button>
              </>
            ) : approvedCount > 0 ? (
              <button
                onClick={generateLink}
                disabled={generating}
                style={{
                  display:      'inline-flex',
                  alignItems:   'center',
                  gap:          4,
                  fontSize:     10,
                  color:        'var(--text-secondary)',
                  background:   'transparent',
                  border:       'var(--border-rule)',
                  borderRadius: 2,
                  padding:      '3px 8px',
                  cursor:       generating ? 'not-allowed' : 'pointer',
                  opacity:      generating ? 0.5 : 1,
                  fontFamily:   'inherit',
                }}
              >
                <Link2 size={10} />
                {generating ? 'Generating…' : 'Client link'}
              </button>
            ) : null
          )}
        </div>
      </div>

      {/* ── Tab content ─────────────────────────────────────────────────── */}
      {tab === 'gallery' ? (
        <div className="flex gap-6 items-start">
          {/* Folder sidebar */}
          <FolderSidebar
            folders={folders}
            folderCounts={folderCounts}
            totalCount={filesWithFolders.length}
            activeFolderId={activeFolderId}
            onSelect={setActiveFolderId}
            onCreateFolder={createFolder}
            onRenameFolder={renameFolder}
            onDeleteFolder={deleteFolder}
          />

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
