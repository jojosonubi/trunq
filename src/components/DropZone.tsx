'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { useDropzone } from 'react-dropzone'
import { extractExif, neutralizeOrientation } from '@/lib/exif'
import { createClient } from '@/lib/supabase/client'
import type { MediaFile, Folder } from '@/types'
import {
  UploadCloud, CheckCircle2, XCircle, Loader2,
  FileImage, User, AlertTriangle,
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
  status: 'pending' | 'uploading' | 'processing' | 'done' | 'error' | 'skipped'
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

// ─── XHR PUT with progress (presigned URL upload direct to Supabase) ─────────

function xhrPut(
  url: string,
  file: File,
  contentType: string,
  onProgress: (loaded: number) => void,
): Promise<number> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('PUT', url)
    xhr.setRequestHeader('Content-Type', contentType)
    xhr.upload.addEventListener('progress', (e) => {
      if (e.lengthComputable) onProgress(e.loaded)
    })
    xhr.addEventListener('load', () => resolve(xhr.status))
    xhr.addEventListener('error', () => reject(new Error('Network error')))
    xhr.addEventListener('abort', () => reject(new Error('Aborted')))
    xhr.send(file)
  })
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function StatusIcon({ status }: { status: QueueItem['status'] }) {
  switch (status) {
    case 'done':       return <CheckCircle2 size={13} className="shrink-0" style={{ color: '#1D9E75' }} />
    case 'error':      return <XCircle      size={13} className="shrink-0" style={{ color: 'var(--flagged-fg)' }} />
    case 'skipped':    return <AlertTriangle size={13} className="shrink-0" style={{ color: '#b8860b' }} />
    case 'uploading':
    case 'processing': return <Loader2      size={13} className="shrink-0 animate-spin" style={{ color: 'var(--accent)' }} />
    default:           return <FileImage    size={13} className="text-[#555] shrink-0" />
  }
}

function statusLabel(status: QueueItem['status']): string {
  switch (status) {
    case 'pending':    return 'Waiting…'
    case 'uploading':  return 'Uploading…'
    case 'processing': return 'Saving…'
    case 'done':       return 'Done'
    case 'error':      return 'Failed'
    case 'skipped':    return 'Skipped'
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
    const allDone = queue.every((i) => i.status === 'done' || i.status === 'error' || i.status === 'skipped')
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

  // ── Auto-remove done items after 2 s ──────────────────────────────────────

  useEffect(() => {
    const doneIds = queue.filter((i) => i.status === 'done').map((i) => i.id)
    if (doneIds.length === 0) return
    const timer = setTimeout(() => {
      setQueue((prev) => prev.filter((i) => !doneIds.includes(i.id)))
    }, 2000)
    return () => clearTimeout(timer)
  }, [queue])

  // ── Per-file upload ───────────────────────────────────────────────────────

  const uploadFile = useCallback(
    async (id: string, originalFile: File, photographer: string | null, folderId: string | null) => {
      updateItem(id, { status: 'uploading', progress: 5 })

      // Strip EXIF orientation tag so the file is stored at raw pixel orientation
      const file = await neutralizeOrientation(originalFile)

      // ── Step 1: Presign + hash + EXIF in parallel ────────────────────────────
      let presignResult: {
        upload_url:       string
        storage_path:     string
        archive_filename: string
        is_base:          boolean
      } | null = null
      let exifData: Record<string, unknown> = {}
      let fileHash = ''

      try {
        const [presignRes, exif, hashBuffer] = await Promise.all([
          fetch('/api/upload/presign', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              event_id:          eventId,
              original_filename: file.name,
              mime_type:         file.type,
              photographer,
              folder_id:         folderId,
            }),
          }),
          extractExif(file).catch(() => ({})),
          file.arrayBuffer().then((buf) => crypto.subtle.digest('SHA-256', buf)),
        ])

        exifData = exif as Record<string, unknown>
        fileHash = Array.from(new Uint8Array(hashBuffer))
          .map((b) => b.toString(16).padStart(2, '0'))
          .join('')

        if (!presignRes.ok) {
          const err = await presignRes.json().catch(() => ({})) as Record<string, unknown>
          const serverMsg = String(err?.error ?? '').toLowerCase()
          let errorMsg = 'Upload failed — server error'
          if (serverMsg.includes('format') || serverMsg.includes('unsupported') || serverMsg.includes('mime')) {
            errorMsg = 'Upload failed — unsupported format'
          } else if (serverMsg.includes('large') || serverMsg.includes('size') || serverMsg.includes('limit')) {
            errorMsg = 'Upload failed — file too large'
          }
          updateItem(id, { status: 'error', progress: 100, uploadedBytes: file.size, error: errorMsg })
          return
        }

        presignResult = await presignRes.json() as typeof presignResult
      } catch {
        updateItem(id, { status: 'error', progress: 100, uploadedBytes: file.size, error: 'Upload failed — network error' })
        return
      }

      if (!presignResult) return
      const { upload_url, storage_path, archive_filename } = presignResult
      updateItem(id, { progress: 15 })

      // ── Step 2: PUT file directly to Supabase (bypasses Vercel) ─────────────
      const BACKOFF     = [1000, 2000, 4000]
      const MAX_RETRIES = 3
      let attempt = 0

      while (true) {
        uploadStartRef.current[id] = Date.now()
        updateItem(id, { uploadedBytes: 0, progress: 15 })

        let putError: Error | null = null
        let putStatus = 0

        try {
          putStatus = await xhrPut(upload_url, file, file.type, (loaded) => {
            const pct = 15 + Math.round((loaded / file.size) * 55)
            updateItem(id, { uploadedBytes: loaded, progress: Math.min(70, pct) })
          })
        } catch (err) {
          putError = err instanceof Error ? err : new Error('Unknown error')
        }

        const shouldRetry =
          attempt < MAX_RETRIES &&
          (putError !== null || putStatus >= 500)

        if (shouldRetry) {
          attempt++
          updateItem(id, { retryCount: attempt, status: 'uploading', progress: 15, uploadedBytes: 0 })
          await new Promise((res) => setTimeout(res, BACKOFF[attempt - 1]))
          continue
        }

        if (putError) {
          updateItem(id, { status: 'error', progress: 100, uploadedBytes: file.size, error: 'Upload failed — network error' })
          return
        }

        if (putStatus < 200 || putStatus >= 300) {
          updateItem(id, { status: 'error', progress: 100, uploadedBytes: file.size, error: 'Upload failed — server error' })
          return
        }

        break
      }

      updateItem(id, { progress: 72, uploadedBytes: file.size, status: 'processing' })

      // ── Step 3: Record upload in DB ──────────────────────────────────────────
      let mediaFile: MediaFile | null = null
      try {
        const completeRes = await fetch('/api/upload/complete', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            storage_path,
            archive_filename,
            original_filename: file.name,
            event_id:          eventId,
            photographer,
            folder_id:         folderId,
            exif_data:         exifData,
            file_hash:         fileHash,
            file_size:         file.size,
            mime_type:         file.type,
          }),
        })

        if (!completeRes.ok) {
          const err = await completeRes.json().catch(() => ({})) as Record<string, unknown>
          console.error('[DropZone] complete failed:', err)
          updateItem(id, { status: 'error', progress: 100, uploadedBytes: file.size, error: 'Upload failed — server error' })
          return
        }

        const json = await completeRes.json() as { mediaFile: MediaFile }
        mediaFile = json.mediaFile
      } catch {
        updateItem(id, { status: 'error', progress: 100, uploadedBytes: file.size, error: 'Upload failed — network error' })
        return
      }

      updateItem(id, { progress: 82, mediaFile: mediaFile ?? undefined })

      updateItem(id, { status: 'done', progress: 100, uploadedBytes: file.size })
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

  // ── Duplicate detection ───────────────────────────────────────────────────

  const checkDuplicates = useCallback(async (files: File[]): Promise<Set<string>> => {
    if (files.length === 0) return new Set()
    const supabase = createClient()
    const names    = [...new Set(files.map((f) => f.name))]
    const { data } = await supabase
      .from('media_files')
      .select('original_filename')
      .eq('event_id', eventId)
      .is('deleted_at', null)
      .in('original_filename', names)
    const existingNames = new Set((data ?? []).map((r: { original_filename: string }) => r.original_filename))
    const dupKeys = new Set<string>()
    for (const f of files) {
      if (existingNames.has(f.name)) dupKeys.add(`${f.name}|${f.size}`)
    }
    return dupKeys
  }, [eventId])

  // ── Retry handlers ────────────────────────────────────────────────────────

  const retryItem = useCallback((id: string) => {
    const item = queue.find((i) => i.id === id)
    if (!item || item.status !== 'error') return
    setIsUploading(true)
    updateItem(id, { status: 'pending', progress: 0, uploadedBytes: 0, retryCount: 0, error: undefined })
    setTimeout(() => uploadFile(id, item.file, item.photographer, item.folderId), 0)
  }, [queue, updateItem, uploadFile])

  const retryAllFailed = useCallback(() => {
    const failed = queue.filter((i) => i.status === 'error')
    if (failed.length === 0) return
    setIsUploading(true)
    failed.forEach((item, i) => {
      updateItem(item.id, { status: 'pending', progress: 0, uploadedBytes: 0, retryCount: 0, error: undefined })
      setTimeout(() => uploadFile(item.id, item.file, item.photographer, item.folderId), i * 150)
    })
  }, [queue, updateItem, uploadFile])

  // ── Drop handler ──────────────────────────────────────────────────────────

  const onDrop = useCallback(
    async (acceptedFiles: File[]) => {
      if (acceptedFiles.length === 0) return

      // Batch duplicate check before upload
      let dupKeys = new Set<string>()
      try {
        dupKeys = await checkDuplicates(acceptedFiles)
      } catch {
        // Check failed — proceed with all files
      }

      const dupeFiles   = acceptedFiles.filter((f) => dupKeys.has(`${f.name}|${f.size}`))
      const uploadFiles = acceptedFiles.filter((f) => !dupKeys.has(`${f.name}|${f.size}`))

      if (dupeFiles.length > 0) {
        const skippedItems: QueueItem[] = dupeFiles.map((file) => ({
          id:            crypto.randomUUID(),
          file,
          progress:      100,
          status:        'skipped' as const,
          photographer:  null,
          folderId:      null,
          uploadedBytes: 0,
          retryCount:    0,
          error:         'Duplicate — skipped',
        }))
        setQueue((prev) => [...prev, ...skippedItems])
      }

      if (uploadFiles.length === 0) return

      if (photographers.length >= 1) {
        setPendingFiles(uploadFiles)
      } else {
        startUploads(uploadFiles, null, selectedFolderId)
      }
    },
    [photographers, startUploads, selectedFolderId, checkDuplicates],
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

  // ── Local dropzone (existing UI element) ──────────────────────────────────
  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'image/*': [], 'video/*': [] },
    multiple: true,
    disabled: isUploading || !!pendingFiles,
  })

  // ── Window-level drag detection ───────────────────────────────────────────
  // Tracks drag depth so dragleave on child elements doesn't hide the overlay.
  const [isWindowDragging, setIsWindowDragging] = useState(false)
  const dragDepthRef = useRef(0)

  useEffect(() => {
    function onDragEnter(e: DragEvent) {
      if (!e.dataTransfer?.types.includes('Files')) return
      dragDepthRef.current++
      setIsWindowDragging(true)
    }
    function onDragLeave() {
      dragDepthRef.current = Math.max(0, dragDepthRef.current - 1)
      if (dragDepthRef.current === 0) setIsWindowDragging(false)
    }
    function onDrop() {
      dragDepthRef.current = 0
      setIsWindowDragging(false)
    }
    document.addEventListener('dragenter', onDragEnter)
    document.addEventListener('dragleave', onDragLeave)
    document.addEventListener('drop', onDrop)
    return () => {
      document.removeEventListener('dragenter', onDragEnter)
      document.removeEventListener('dragleave', onDragLeave)
      document.removeEventListener('drop', onDrop)
    }
  }, [])

  // ── Full-screen drop target (portal) ─────────────────────────────────────
  const {
    getRootProps: getWindowRootProps,
    getInputProps: getWindowInputProps,
    isDragActive: isOverlay,
  } = useDropzone({
    onDrop,
    accept: { 'image/*': [], 'video/*': [] },
    multiple: true,
    disabled: isUploading || !!pendingFiles,
    noClick: true,
    noKeyboard: true,
  })

  // ── Batch statistics ──────────────────────────────────────────────────────

  const now = Date.now()

  const totalBatchBytes = queue.reduce((s, i) => s + i.file.size, 0)

  const uploadedBatchBytes = queue.reduce((s, i) => {
    if (['processing', 'done', 'error'].includes(i.status)) return s + i.file.size
    if (i.status === 'uploading') return s + i.uploadedBytes
    return s
  }, 0)

  const doneCount     = queue.filter((i) => i.status === 'done').length
  const errorCount    = queue.filter((i) => i.status === 'error').length
  const skippedCount  = queue.filter((i) => i.status === 'skipped').length
  const uploadCount   = queue.filter((i) => i.status !== 'skipped').length
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
              <p className="text-xs font-medium text-left" style={{ color: 'var(--text-primary)' }}>
                Uploading {doneCount + errorCount + 1} of {uploadCount}…
              </p>
              <div className="h-1 bg-[#1f1f1f] rounded-full overflow-hidden mt-1.5">
                <div
                  className="h-full rounded-full transition-all duration-300"
                  style={{ width: `${batchPct}%`, background: 'var(--accent)' }}
                />
              </div>
            </>
          ) : (
            <p className="text-xs font-medium text-left flex items-center gap-1.5" style={{ color: doneCount > 0 ? '#1D9E75' : 'var(--text-secondary)' }}>
              {doneCount > 0 && <CheckCircle2 size={12} />}
              {[
                doneCount  > 0 && `${doneCount} uploaded`,
                errorCount > 0 && `${errorCount} failed`,
                skippedCount > 0 && `${skippedCount} duplicate${skippedCount !== 1 ? 's' : ''} skipped`,
              ].filter(Boolean).join(', ') || `${queue.length} processed`}
            </p>
          )}
        </div>

        {/* Speed + ETA */}
        {isUploading && overallSpeedBps !== null && (
          <span className="text-[#555] text-[11px] tabular-nums shrink-0 text-right leading-tight">
            {fmtSpeed(overallSpeedBps)}
            {etaSec !== null && fmtETA(etaSec) && (
              <><br /><span style={{ fontSize: 10 }}>{fmtETA(etaSec)}</span></>
            )}
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

      {/* Retry all failed */}
      {!isUploading && errorCount > 0 && (
        <div className="flex items-center px-4 py-2 border-t border-[#1a1a1a]">
          <button
            onClick={retryAllFailed}
            style={{ fontSize: 11, padding: '4px 10px', border: 'var(--border-rule)', borderRadius: 2, color: 'var(--text-secondary)', background: 'transparent', cursor: 'pointer', fontFamily: 'inherit' }}
          >
            Retry all failed ({errorCount})
          </button>
        </div>
      )}

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
              item.status === 'skipped'                            ? (item.error ?? 'Duplicate — skipped') :
              item.status === 'error'                              ? (item.error ?? 'Upload failed') :
              item.status === 'done'                               ? 'Done' :
              item.retryCount > 0 && item.status === 'uploading'  ? `Retry ${item.retryCount}/3…` :
              itemSpeed !== null                                   ? fmtSpeed(itemSpeed) :
                                                                     statusLabel(item.status)

            const rightColor =
              item.status === 'skipped'                            ? '#b8860b' :
              item.status === 'error'                              ? 'var(--flagged-fg)' :
              item.status === 'done'                               ? '#1D9E75' :
              item.retryCount > 0 && item.status === 'uploading'  ? '#b8860b' :
              itemSpeed !== null                                   ? 'var(--accent)' :
                                                                     'var(--text-muted)'

            return (
              <li key={item.id} className="px-4 py-2.5">
                <div className="flex items-center gap-2 mb-1.5">
                  <StatusIcon status={item.status} />
                  <span className="text-xs font-medium truncate flex-1 min-w-0" style={{ color: 'var(--text-primary)' }}>
                    {item.file.name}
                  </span>
                  <span className="text-[10px] tabular-nums shrink-0" style={{ color: rightColor }}>
                    {rightText}
                  </span>
                  {item.status === 'error' && (
                    <button
                      onClick={() => retryItem(item.id)}
                      style={{ fontSize: 9, padding: '2px 7px', border: 'var(--border-rule)', borderRadius: 2, color: 'var(--text-secondary)', background: 'transparent', cursor: 'pointer', fontFamily: 'inherit', flexShrink: 0 }}
                    >
                      Retry
                    </button>
                  )}
                </div>
                <div className="h-px bg-surface-0 rounded-full overflow-hidden ml-[21px]">
                  <div
                    className="h-full rounded-full transition-all duration-300"
                    style={{
                      width: `${item.progress}%`,
                      background: item.status === 'done'    ? '#1D9E75' :
                                  item.status === 'error'   ? 'var(--flagged-fg)' :
                                  item.status === 'skipped' ? '#b8860b' :
                                  'var(--accent)',
                    }}
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

      {/* ── Full-screen drag overlay ──────────────────────────────────── */}
      {isWindowDragging && !isUploading && !pendingFiles && typeof window !== 'undefined' && createPortal(
        <div
          {...getWindowRootProps()}
          style={{
            position:       'fixed',
            inset:          0,
            zIndex:         9998,
            display:        'flex',
            alignItems:     'center',
            justifyContent: 'center',
            background:     isOverlay ? 'rgba(0,0,0,0.75)' : 'rgba(0,0,0,0.55)',
            backdropFilter: 'blur(6px)',
            transition:     'background 0.15s',
          }}
        >
          <input {...getWindowInputProps()} />
          <div style={{
            display:       'flex',
            flexDirection: 'column',
            alignItems:    'center',
            gap:           16,
            padding:       '48px 64px',
            border:        `2px dashed ${isOverlay ? 'rgba(255,255,255,0.5)' : 'rgba(255,255,255,0.2)'}`,
            borderRadius:  16,
            background:    isOverlay ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.02)',
            transition:    'border-color 0.15s, background 0.15s',
            pointerEvents: 'none',
          }}>
            <UploadCloud
              size={44}
              style={{ color: isOverlay ? 'var(--accent)' : 'rgba(255,255,255,0.4)', transition: 'color 0.15s' }}
            />
            <div style={{ textAlign: 'center' }}>
              <p style={{ color: 'white', fontSize: 18, fontWeight: 600, margin: 0 }}>Drop to upload</p>
              <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: 13, margin: '6px 0 0' }}>Images &amp; videos</p>
            </div>
          </div>
        </div>,
        document.body,
      )}

    </>
  )
}
