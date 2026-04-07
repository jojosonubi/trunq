'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { useDropzone } from 'react-dropzone'
import { extractExif } from '@/lib/exif'
import type { MediaFile, Folder } from '@/types'
import {
  UploadCloud, CheckCircle2, XCircle, Loader2,
  FileImage, Sparkles, User, AlertTriangle,
  Folder as FolderIcon, Plus, Check, X, ChevronUp, ChevronDown,
} from 'lucide-react'
import { createPortal } from 'react-dom'
import clsx from 'clsx'

// ─── Types ───────────────────────────────────────────────────────────────────

interface Props {
  eventId: string
  photographers: string[]
  initialFolders?: Folder[]
}

interface QueueItem {
  id: string
  file: File
  progress: number
  status: 'pending' | 'uploading' | 'processing' | 'tagging' | 'done' | 'error'
  error?: string
  mediaFile?: MediaFile
  photographer: string | null
  folderId: string | null
  uploadedBytes: number
  retryCount: number
}

// ─── Format helpers ───────────────────────────────────────────────────────────

function fmt(bytes: number, dp = 1): string {
  if (bytes <= 0) return '0 B'
  if (bytes < 1_024) return `${bytes} B`
  if (bytes < 1_048_576) return `${(bytes / 1_024).toFixed(dp)} KB`
  return `${(bytes / 1_048_576).toFixed(dp)} MB`
}

function fmtSpeed(bps: number): string {
  if (bps < 1_024) return `${Math.round(bps)} B/s`
  if (bps < 1_048_576) return `${(bps / 1_024).toFixed(0)} KB/s`
  return `${(bps / 1_048_576).toFixed(1)} MB/s`
}

function fmtETA(sec: number): string {
  if (!isFinite(sec) || sec <= 0) return ''
  if (sec < 15)   return 'almost done'
  if (sec < 90)   return `~${Math.round(sec / 5) * 5}s remaining`
  if (sec < 3600) return `~${Math.round(sec / 60)} min remaining`
  return `~${Math.floor(sec / 3600)}h remaining`
}

// ─── XHR upload with progress events ─────────────────────────────────────────

function xhrUpload(
  formData: FormData,
  onProgress: (loaded: number) => void,
): Promise<{ ok: boolean; status: number; data: Record<string, unknown> }> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('POST', '/api/upload')
    xhr.upload.addEventListener('progress', (e) => {
      if (e.lengthComputable) onProgress(e.loaded)
    })
    xhr.addEventListener('load', () => {
      try {
        const data = JSON.parse(xhr.responseText) as Record<string, unknown>
        resolve({ ok: xhr.status >= 200 && xhr.status < 300, status: xhr.status, data })
      } catch {
        resolve({ ok: false, status: xhr.status, data: {} })
      }
    })
    xhr.addEventListener('error', () => reject(new Error('Network error')))
    xhr.addEventListener('abort', () => reject(new Error('Aborted')))
    xhr.send(formData)
  })
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function StatusIcon({ status }: { status: QueueItem['status'] }) {
  switch (status) {
    case 'done':       return <CheckCircle2 size={13} className="text-emerald-400 shrink-0" />
    case 'error':      return <XCircle      size={13} className="text-red-400 shrink-0" />
    case 'tagging':    return <Sparkles     size={13} className="text-purple-400 shrink-0 animate-pulse" />
    case 'uploading':
    case 'processing': return <Loader2      size={13} className="text-blue-400 shrink-0 animate-spin" />
    default:           return <FileImage    size={13} className="text-[#555] shrink-0" />
  }
}

function statusLabel(status: QueueItem['status']): string {
  switch (status) {
    case 'pending':    return 'Waiting…'
    case 'uploading':  return 'Uploading…'
    case 'processing': return 'Saving…'
    case 'tagging':    return 'Tagging…'
    case 'done':       return 'Done'
    case 'error':      return 'Failed'
  }
}

// ─── FolderPicker ─────────────────────────────────────────────────────────────

interface FolderPickerProps {
  folders: Folder[]
  selectedId: string | null
  onSelect: (id: string | null) => void
  onCreate: (name: string) => Promise<Folder>
  disabled?: boolean
}

function FolderPicker({ folders, selectedId, onSelect, onCreate, disabled }: FolderPickerProps) {
  const [creating, setCreating]       = useState(false)
  const [draftName, setDraftName]     = useState('')
  const [saving, setSaving]           = useState(false)
  const inputRef                      = useRef<HTMLInputElement>(null)

  useEffect(() => { if (creating) inputRef.current?.focus() }, [creating])

  async function submit() {
    const name = draftName.trim()
    if (!name || saving) return
    setSaving(true)
    try {
      const folder = await onCreate(name)
      onSelect(folder.id)
    } finally {
      setSaving(false)
    }
    setDraftName('')
    setCreating(false)
  }

  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      <span className="flex items-center gap-1 text-[#444] text-[10px] uppercase tracking-wider shrink-0">
        <FolderIcon size={10} />
        Folder
      </span>

      {/* No folder pill */}
      <button
        disabled={disabled}
        onClick={() => onSelect(null)}
        className={clsx(
          'text-xs px-2.5 py-1 rounded-full border transition-all',
          selectedId === null
            ? 'bg-white/10 border-white/25 text-white'
            : 'border-[#1f1f1f] text-[#555] hover:border-[#333] hover:text-[#888]',
          disabled && 'pointer-events-none opacity-50',
        )}
      >
        No folder
      </button>

      {/* Existing folder pills */}
      {folders.map((folder) => (
        <button
          key={folder.id}
          disabled={disabled}
          onClick={() => onSelect(folder.id)}
          className={clsx(
            'text-xs px-2.5 py-1 rounded-full border transition-all',
            selectedId === folder.id
              ? 'bg-white/10 border-white/25 text-white'
              : 'border-[#1f1f1f] text-[#555] hover:border-[#333] hover:text-[#888]',
            disabled && 'pointer-events-none opacity-50',
          )}
        >
          {folder.name}
        </button>
      ))}

      {/* Inline new-folder creator */}
      {!disabled && (
        creating ? (
          <div className="flex items-center gap-1">
            <input
              ref={inputRef}
              value={draftName}
              onChange={(e) => setDraftName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter')  submit()
                if (e.key === 'Escape') { setCreating(false); setDraftName('') }
              }}
              placeholder="Folder name…"
              className="bg-surface-0 border border-[#333] text-white text-xs px-2 py-1 rounded-full w-32 placeholder:text-[#444] focus:outline-none focus:border-[#555]"
            />
            <button
              onClick={submit}
              disabled={saving || !draftName.trim()}
              className="text-emerald-400 hover:text-emerald-300 disabled:opacity-40 transition-colors"
              aria-label="Create folder"
            >
              {saving ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
            </button>
            <button
              onClick={() => { setCreating(false); setDraftName('') }}
              className="text-[#555] hover:text-[#999] transition-colors"
              aria-label="Cancel"
            >
              <X size={12} />
            </button>
          </div>
        ) : (
          <button
            onClick={() => setCreating(true)}
            className="inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-full border border-dashed border-[#2a2a2a] text-[#444] hover:border-[#444] hover:text-[#888] transition-all"
          >
            <Plus size={10} />
            New folder
          </button>
        )
      )}
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function DropZone({ eventId, photographers, initialFolders = [] }: Props) {
  const router = useRouter()

  const [queue, setQueue]               = useState<QueueItem[]>([])
  const [isUploading, setIsUploading]   = useState(false)
  const [pendingFiles, setPendingFiles] = useState<File[] | null>(null)
  const [submittedCount, setSubmittedCount] = useState<number | null>(null)
  const [, setTick] = useState(0)
  const [footerExpanded, setFooterExpanded] = useState(true)

  // ── Folder state ──────────────────────────────────────────────────────────
  const [localFolders, setLocalFolders]     = useState<Folder[]>(initialFolders)
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null)

  const uploadStartRef = useRef<Record<string, number>>({})
  const batchStartRef  = useRef<number | null>(null)
  const startedRef     = useRef(new Set<string>())

  // ── Helpers ────────────────────────────────────────────────────────────────

  const updateItem = useCallback((id: string, patch: Partial<QueueItem>) => {
    setQueue((prev) => prev.map((item) => (item.id === id ? { ...item, ...patch } : item)))
  }, [])

  // ── 1-second tick while uploading ─────────────────────────────────────────

  useEffect(() => {
    if (!isUploading) return
    const id = setInterval(() => setTick((t) => t + 1), 1000)
    return () => clearInterval(id)
  }, [isUploading])

  // ── Completion watcher ────────────────────────────────────────────────────

  useEffect(() => {
    if (queue.length === 0 || !isUploading) return
    const allDone = queue.every((i) => i.status === 'done' || i.status === 'error')
    if (allDone) {
      setIsUploading(false)
      const successCount = queue.filter((i) => i.status === 'done').length
      if (successCount > 0) {
        setSubmittedCount(successCount)
        window.dispatchEvent(new CustomEvent('uploads-complete'))
      }
      router.refresh()
    }
  }, [queue, isUploading, router])

  // ── Per-file upload ───────────────────────────────────────────────────────

  const uploadFile = useCallback(
    async (id: string, file: File, photographer: string | null, folderId: string | null) => {
      updateItem(id, { status: 'uploading', progress: 5 })

      let exifData = {}
      try {
        exifData = await extractExif(file)
      } catch {
        // proceed without EXIF
      }

      const formData = new FormData()
      formData.append('file', file)
      formData.append('event_id', eventId)
      formData.append('exif_data', JSON.stringify(exifData))
      if (photographer) formData.append('photographer', photographer)
      if (folderId)     formData.append('folder_id', folderId)

      const BACKOFF    = [1000, 2000, 4000]
      const MAX_RETRIES = 3
      let attempt = 0

      while (true) {
        uploadStartRef.current[id] = Date.now()
        updateItem(id, { uploadedBytes: 0, progress: 5 })

        let result: { ok: boolean; status: number; data: Record<string, unknown> } | null = null
        let networkError: Error | null = null

        try {
          result = await xhrUpload(formData, (loaded) => {
            const pct = 10 + Math.round((loaded / file.size) * 55)
            updateItem(id, { uploadedBytes: loaded, progress: Math.min(65, pct) })
          })
        } catch (err) {
          networkError = err instanceof Error ? err : new Error('Unknown error')
        }

        const shouldRetry =
          attempt < MAX_RETRIES &&
          (networkError !== null || (result !== null && result.status >= 500))

        if (shouldRetry) {
          attempt++
          updateItem(id, { retryCount: attempt, status: 'uploading', progress: 5, uploadedBytes: 0 })
          await new Promise((res) => setTimeout(res, BACKOFF[attempt - 1]))
          continue
        }

        if (networkError) {
          updateItem(id, { status: 'error', progress: 100, uploadedBytes: file.size, error: networkError.message })
          return
        }

        const { ok, data } = result!

        if (!ok || data.error) {
          updateItem(id, {
            status: 'error', progress: 100, uploadedBytes: file.size,
            error: (data.error as string) ?? 'Upload failed',
          })
          return
        }

        updateItem(id, { progress: 70, uploadedBytes: file.size })

        const mediaFile = data.mediaFile as MediaFile

        if (mediaFile.file_type === 'image') {
          updateItem(id, { status: 'tagging', progress: 80, mediaFile })
          try {
            const tagRes  = await fetch('/api/tag', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ media_file_id: mediaFile.id, public_url: mediaFile.public_url }),
            })
            const tagJson = await tagRes.json()
            if (!tagRes.ok) console.warn('[Archive] Tagging failed:', tagJson)
          } catch (err) {
            console.warn('[Archive] Tagging error:', err)
          }
        } else {
          updateItem(id, { status: 'processing', progress: 85, mediaFile })
        }

        updateItem(id, { status: 'done', progress: 100, uploadedBytes: file.size })
        return
      }
    },
    [eventId, updateItem],
  )

  // ── Start a batch ─────────────────────────────────────────────────────────

  const startUploads = useCallback(
    (files: File[], photographer: string | null, folderId: string | null) => {
      batchStartRef.current = Date.now()

      const newItems: QueueItem[] = files.map((file) => ({
        id: crypto.randomUUID(),
        file,
        progress: 0,
        status: 'pending',
        photographer,
        folderId,
        uploadedBytes: 0,
        retryCount: 0,
      }))

      setQueue((prev) => [...prev, ...newItems])
      setIsUploading(true)

      newItems.forEach((item, i) => {
        if (startedRef.current.has(item.id)) return
        startedRef.current.add(item.id)
        setTimeout(
          () => uploadFile(item.id, item.file, item.photographer, item.folderId),
          i * 150,
        )
      })
    },
    [uploadFile],
  )

  // ── Inline folder creation ────────────────────────────────────────────────

  const createFolder = useCallback(async (name: string): Promise<Folder> => {
    const res  = await fetch('/api/folders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ event_id: eventId, name }),
    })
    const json = await res.json() as { folder: Folder }
    setLocalFolders((prev) => [...prev, json.folder])
    return json.folder
  }, [eventId])

  // ── Drop handler ──────────────────────────────────────────────────────────

  const onDrop = useCallback(
    (acceptedFiles: File[]) => {
      if (acceptedFiles.length === 0) return
      if (photographers.length >= 2) {
        setPendingFiles(acceptedFiles)
      } else {
        startUploads(acceptedFiles, photographers[0] ?? null, selectedFolderId)
      }
    },
    [photographers, startUploads, selectedFolderId],
  )

  function resetForMore() {
    setQueue([])
    setSubmittedCount(null)
    setPendingFiles(null)
    setSelectedFolderId(null)
    startedRef.current    = new Set()
    uploadStartRef.current = {}
    batchStartRef.current  = null
  }

  function confirmPhotographer(name: string | null) {
    if (pendingFiles) {
      startUploads(pendingFiles, name, selectedFolderId)
      setPendingFiles(null)
    }
  }

  const [dropExpanded, setDropExpanded] = useState(false)

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'image/*': [], 'video/*': [] },
    multiple: true,
    disabled: isUploading || !!pendingFiles,
  })

  // ── Batch statistics ──────────────────────────────────────────────────────

  const now = Date.now()

  const totalBatchBytes = queue.reduce((s, i) => s + i.file.size, 0)

  const uploadedBatchBytes = queue.reduce((s, i) => {
    if (['processing', 'tagging', 'done', 'error'].includes(i.status)) return s + i.file.size
    if (i.status === 'uploading') return s + i.uploadedBytes
    return s
  }, 0)

  const doneCount  = queue.filter((i) => i.status === 'done').length
  const errorCount = queue.filter((i) => i.status === 'error').length
  const batchPct   = totalBatchBytes > 0
    ? Math.min(100, Math.round((uploadedBatchBytes / totalBatchBytes) * 100))
    : 0

  const elapsedSec      = batchStartRef.current ? (now - batchStartRef.current) / 1000 : 0
  const overallSpeedBps = elapsedSec > 2 && uploadedBatchBytes > 0
    ? uploadedBatchBytes / elapsedSec
    : null
  const remainingBytes  = Math.max(0, totalBatchBytes - uploadedBatchBytes)
  const etaSec          = overallSpeedBps && overallSpeedBps > 0
    ? remainingBytes / overallSpeedBps
    : null

  const slowConnection = isUploading && etaSec !== null && elapsedSec > 10 && etaSec > 300

  // The folder name for the active batch (from first queued item)
  const activeFolderName = queue.length > 0 && queue[0].folderId
    ? (localFolders.find((f) => f.id === queue[0].folderId)?.name ?? null)
    : null

  // ── Render ────────────────────────────────────────────────────────────────

  const footerWidget = queue.length > 0 && typeof window !== 'undefined' && createPortal(
    <div className="fixed bottom-6 right-6 z-50 w-80 shadow-2xl rounded-xl overflow-hidden border border-[#2a2a2a] bg-surface-0">

      {/* ── Header / collapsed bar ─────────────────────────────────── */}
      <button
        onClick={() => setFooterExpanded((v) => !v)}
        className="w-full flex items-center gap-3 px-4 py-3 hover:bg-white/4 transition-colors"
      >
        {/* Progress bar or done indicator */}
        <div className="flex-1 min-w-0">
          {isUploading ? (
            <>
              <p className="text-white text-xs font-medium text-left">
                Uploading {doneCount + errorCount + 1} of {queue.length}…
              </p>
              <div className="h-1 bg-[#1f1f1f] rounded-full overflow-hidden mt-1.5">
                <div
                  className="h-full bg-blue-500 rounded-full transition-all duration-300"
                  style={{ width: `${batchPct}%` }}
                />
              </div>
            </>
          ) : submittedCount !== null ? (
            <p className="text-emerald-400 text-xs font-medium text-left flex items-center gap-1.5">
              <CheckCircle2 size={12} />
              {doneCount} uploaded{errorCount > 0 ? `, ${errorCount} failed` : ''}
            </p>
          ) : (
            <p className="text-[#888] text-xs text-left">
              {doneCount} of {queue.length} uploaded
            </p>
          )}
        </div>

        {/* Speed / eta */}
        {isUploading && overallSpeedBps !== null && (
          <span className="text-[#555] text-[11px] tabular-nums shrink-0">
            {fmtSpeed(overallSpeedBps)}
          </span>
        )}

        {/* Expand/collapse + dismiss */}
        <div className="flex items-center gap-1 shrink-0">
          {footerExpanded
            ? <ChevronDown size={14} className="text-[#555]" />
            : <ChevronUp   size={14} className="text-[#555]" />}
          {!isUploading && (
            <span
              role="button"
              tabIndex={0}
              onClick={(e) => { e.stopPropagation(); resetForMore() }}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.stopPropagation(); resetForMore() } }}
              className="text-[#444] hover:text-white transition-colors ml-1"
              aria-label="Dismiss"
            >
              <X size={13} />
            </span>
          )}
        </div>
      </button>

      {/* Slow-connection warning */}
      {footerExpanded && slowConnection && (
        <div className="flex items-center gap-2 px-4 py-2 bg-amber-500/10 border-t border-amber-500/20 text-amber-400 text-xs">
          <AlertTriangle size={12} className="shrink-0" />
          Large upload — keep this tab open
        </div>
      )}

      {/* ── Expanded: per-file list ────────────────────────────────── */}
      {footerExpanded && (
        <ul className="divide-y divide-[#161616] border-t border-[#1a1a1a] max-h-72 overflow-y-auto">
          {queue.map((item) => {
            const startedAt      = uploadStartRef.current[item.id]
            const itemElapsedSec = startedAt ? (now - startedAt) / 1000 : 0
            const itemSpeed      = item.status === 'uploading' && itemElapsedSec > 0.5 && item.uploadedBytes > 0
              ? item.uploadedBytes / itemElapsedSec
              : null

            const rightText =
              item.status === 'error'                              ? (item.error ?? 'Error') :
              item.status === 'done'                               ? 'Done' :
              item.retryCount > 0 && item.status === 'uploading'  ? `Retry ${item.retryCount}/3…` :
              itemSpeed !== null                                   ? fmtSpeed(itemSpeed) :
                                                                     statusLabel(item.status)

            const rightClass =
              item.status === 'error'                             ? 'text-red-400' :
              item.status === 'tagging'                           ? 'text-purple-400' :
              item.status === 'done'                              ? 'text-emerald-400' :
              item.retryCount > 0 && item.status === 'uploading' ? 'text-amber-400' :
              itemSpeed !== null                                  ? 'text-blue-400' :
                                                                    'text-[#555]'

            return (
              <li key={item.id} className="px-4 py-2.5">
                <div className="flex items-center gap-2 mb-1.5">
                  <StatusIcon status={item.status} />
                  <span className="text-white text-xs font-medium truncate flex-1 min-w-0">
                    {item.file.name}
                  </span>
                  <span className={clsx('text-[10px] tabular-nums shrink-0', rightClass)}>
                    {rightText}
                  </span>
                </div>
                <div className="h-px bg-surface-0 rounded-full overflow-hidden ml-[21px]">
                  <div
                    className={clsx(
                      'h-full rounded-full transition-all duration-300',
                      item.status === 'done'    ? 'bg-emerald-500' :
                      item.status === 'error'   ? 'bg-red-500'     :
                      item.status === 'tagging' ? 'bg-purple-500'  :
                      'bg-blue-500',
                    )}
                    style={{ width: `${item.progress}%` }}
                  />
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </div>,
    document.body
  )

  const showFullDrop  = isDragActive || dropExpanded
  const rootProps     = getRootProps()

  return (
    <>
      <div className="space-y-3">

        {/* ── Photographer picker ───────────────────────────────────── */}
        {pendingFiles && (
          <div className="bg-surface-0 border border-[#1f1f1f] rounded-lg p-4 space-y-4">
            <div>
              <div className="flex items-start justify-between gap-3 mb-3">
                <div className="flex items-center gap-2">
                  <User size={14} className="text-[#888]" />
                  <p className="text-white text-sm font-medium">
                    Who took{' '}
                    {pendingFiles.length === 1 ? 'this photo' : `these ${pendingFiles.length} photos`}?
                  </p>
                </div>
                <span className="text-[#555] text-xs shrink-0 tabular-nums">
                  {pendingFiles.length} file{pendingFiles.length !== 1 ? 's' : ''}{' '}
                  · {fmt(pendingFiles.reduce((s, f) => s + f.size, 0))}
                </span>
              </div>
              <div className="flex flex-wrap gap-2">
                {photographers.map((name) => (
                  <button
                    key={name}
                    onClick={() => confirmPhotographer(name)}
                    className="px-3 py-1.5 bg-surface-0 hover:bg-white hover:text-black border border-[#2a2a2a] hover:border-white text-white text-sm rounded-lg transition-all"
                  >
                    {name}
                  </button>
                ))}
                <button
                  onClick={() => confirmPhotographer(null)}
                  className="px-3 py-1.5 text-[#555] hover:text-white border border-[#1f1f1f] hover:border-[#444] text-sm rounded-lg transition-all"
                >
                  Unassigned
                </button>
              </div>
            </div>
            <div className="pt-3 border-t border-[#1a1a1a]">
              <FolderPicker
                folders={localFolders}
                selectedId={selectedFolderId}
                onSelect={setSelectedFolderId}
                onCreate={createFolder}
              />
            </div>
          </div>
        )}

        {/* ── Drop area ─────────────────────────────────────────────── */}
        {!pendingFiles && (
          showFullDrop ? (
            <div
              {...rootProps}
              className={clsx(
                'relative border-2 border-dashed rounded-lg px-6 py-10 text-center cursor-pointer transition-all',
                isDragActive
                  ? 'border-white/40 bg-white/5'
                  : 'border-[#1f1f1f] hover:border-[#333] hover:bg-surface-0',
                isUploading && 'opacity-50 cursor-not-allowed pointer-events-none',
              )}
            >
              <input {...getInputProps()} />
              <div className="flex flex-col items-center gap-3">
                <div className={clsx(
                  'w-12 h-12 rounded-full flex items-center justify-center transition-colors',
                  isDragActive ? 'bg-white/10' : 'bg-surface-0',
                )}>
                  <UploadCloud size={22} className={isDragActive ? 'text-white' : 'text-[#888]'} />
                </div>
                {isDragActive ? (
                  <p className="text-white text-sm font-medium">Drop to upload</p>
                ) : (
                  <>
                    <p className="text-white text-sm font-medium">Drop files here</p>
                    <p className="text-[#888888] text-xs">
                      or <span className="text-white underline underline-offset-2">browse</span>
                      {' '}— images &amp; videos accepted
                    </p>
                  </>
                )}
              </div>
            </div>
          ) : (
            /* Compact bar */
            <div
              {...rootProps}
              onClick={(e) => {
                setDropExpanded(true)
                ;(rootProps as { onClick?: React.MouseEventHandler<HTMLElement> }).onClick?.(e)
              }}
              style={{
                height:         40,
                display:        'flex',
                alignItems:     'center',
                justifyContent: 'center',
                gap:            8,
                border:         `1px dashed ${isDragActive ? 'var(--accent)' : 'var(--surface-3)'}`,
                borderRadius:   2,
                background:     isDragActive ? 'var(--accent-bg)' : 'transparent',
                cursor:         isUploading ? 'not-allowed' : 'pointer',
                opacity:        isUploading ? 0.5 : 1,
                transition:     'border-color 0.15s, background 0.15s',
                pointerEvents:  isUploading ? 'none' : 'auto',
              }}
            >
              <input {...getInputProps()} />
              <UploadCloud size={13} style={{ color: isDragActive ? 'var(--accent)' : 'var(--text-dim)', flexShrink: 0 }} />
              <span style={{ fontSize: 11, color: isDragActive ? 'var(--accent)' : 'var(--text-muted)' }}>
                {isDragActive ? 'Drop to upload' : 'Drop files or browse'}
              </span>
            </div>
          )
        )}
      </div>

      {/* ── Sticky footer upload widget ───────────────────────────── */}
      {footerWidget}
    </>
  )
}
