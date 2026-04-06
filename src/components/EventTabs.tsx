'use client'

import { useState, useCallback, useMemo, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Images, CheckSquare, Link2, Copy, Check, Users, Tag as TagIcon } from 'lucide-react'
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

  const approvedCount = files.filter((f) => f.review_status === 'approved').length
  const pendingCount  = files.filter((f) => f.review_status === 'pending').length

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div>
      {/* ── Tab bar + delivery link ─────────────────────────────────────── */}
      <div className="flex items-center justify-between gap-4 border-b border-[#1f1f1f] mb-6">
        {/* Tabs */}
        <div className="flex">
          {allowedTabs.map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={clsx(
                'inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors',
                tab === t
                  ? 'text-white border-white'
                  : 'text-[#555] border-transparent hover:text-[#888] hover:border-[#333]'
              )}
            >
              {t === 'gallery'   && <Images      size={14} />}
              {t === 'review'    && <CheckSquare size={14} />}
              {t === 'performers'&& <Users       size={14} />}
              {t === 'brands'    && <TagIcon     size={14} />}
              {t === 'gallery'    ? 'Gallery'
               : t === 'review'  ? 'Review'
               : t === 'performers' ? 'Performers'
               : 'Brands'}
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

        {/* Delivery link controls (admin + producer only) */}
        <div className="flex items-center gap-2 pb-2.5">
          {role === 'photographer' ? null : token ? (
            <>
              <span className="text-[#3a3a3a] text-xs font-mono truncate max-w-[180px]">
                /delivery/{token.slice(0, 10)}…
              </span>
              <button
                onClick={copyLink}
                className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 border border-[#1f1f1f] text-[#555] hover:text-white hover:border-[#333] rounded-lg transition-all shrink-0"
              >
                {copied
                  ? <Check size={12} className="text-emerald-400" />
                  : <Copy size={12} />}
                {copied ? 'Copied!' : 'Copy link'}
              </button>
            </>
          ) : approvedCount > 0 ? (
            <button
              onClick={generateLink}
              disabled={generating}
              className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 bg-white text-black font-medium rounded-lg hover:bg-white/90 transition-all disabled:opacity-60 shrink-0"
            >
              <Link2 size={12} />
              {generating ? 'Generating…' : 'Generate client link'}
            </button>
          ) : null}
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
