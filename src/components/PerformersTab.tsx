'use client'

import { useState, useCallback, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import {
  UserPlus, Trash2, Camera, Scan, CheckCircle2, AlertTriangle,
  User, Loader2,
} from 'lucide-react'
import clsx from 'clsx'
import FaceReferencePicker from '@/components/FaceReferencePicker'
import type { Performer, MediaFileWithTags } from '@/types'

interface Props {
  eventId: string
  initialPerformers: Performer[]
  mediaFiles: MediaFileWithTags[]
}

interface ScanState {
  phase: 'idle' | 'scanning' | 'done'
  done: number
  total: number
  tagsFound: number
}

export default function PerformersTab({ eventId, initialPerformers, mediaFiles }: Props) {
  const router = useRouter()

  const [performers, setPerformers] = useState<Performer[]>(initialPerformers)
  const [scanState, setScanState]   = useState<ScanState>({ phase: 'idle', done: 0, total: 0, tagsFound: 0 })

  // Add-performer form state
  const [adding, setAdding]     = useState(false)
  const [draftName, setDraftName] = useState('')
  const [draftRole, setDraftRole] = useState('')
  const [savingNew, setSavingNew] = useState(false)

  // Reference picker state
  const [pickingFor, setPickingFor] = useState<Performer | null>(null)
  const [uploadingRef, setUploadingRef] = useState<string | null>(null) // performer id

  // ── Photo counts per performer ────────────────────────────────────────────

  const photoCounts = useMemo(() => {
    const counts: Record<string, number> = {}
    for (const file of mediaFiles) {
      for (const pt of file.performer_tags ?? []) {
        counts[pt.performer_id] = (counts[pt.performer_id] ?? 0) + 1
      }
    }
    return counts
  }, [mediaFiles])

  const unscannedFiles = useMemo(
    () => mediaFiles.filter((f) => f.file_type === 'image' && !f.face_scanned),
    [mediaFiles]
  )

  // ── Add performer ─────────────────────────────────────────────────────────

  async function submitAdd() {
    if (!draftName.trim() || savingNew) return
    setSavingNew(true)
    try {
      const res  = await fetch('/api/performers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ event_id: eventId, name: draftName.trim(), role: draftRole.trim() || undefined }),
      })
      const json = await res.json() as { performer?: Performer }
      if (json.performer) setPerformers((prev) => [...prev, json.performer!])
      setDraftName('')
      setDraftRole('')
      setAdding(false)
    } finally {
      setSavingNew(false)
    }
  }

  // ── Delete performer ──────────────────────────────────────────────────────

  async function deletePerformer(id: string) {
    await fetch(`/api/performers/${id}`, { method: 'DELETE' })
    setPerformers((prev) => prev.filter((p) => p.id !== id))
    router.refresh()
  }

  // ── Upload reference photo ────────────────────────────────────────────────

  const handleReferenceConfirm = useCallback(async (blob: Blob) => {
    if (!pickingFor) return
    const performer = pickingFor
    setPickingFor(null)
    setUploadingRef(performer.id)

    try {
      const formData = new FormData()
      formData.append('file', blob, 'reference.jpg')

      const res  = await fetch(`/api/performers/${performer.id}/reference`, {
        method: 'POST',
        body: formData,
      })
      const json = await res.json() as { performer?: Performer }
      if (json.performer) {
        setPerformers((prev) => prev.map((p) => p.id === performer.id ? json.performer! : p))
      }
    } finally {
      setUploadingRef(null)
    }
  }, [pickingFor])

  // ── Face scan ─────────────────────────────────────────────────────────────

  const performersWithRef = performers.filter((p) => p.reference_url)

  const startScan = useCallback(async () => {
    if (!performersWithRef.length || !unscannedFiles.length) return

    setScanState({ phase: 'scanning', done: 0, total: unscannedFiles.length, tagsFound: 0 })

    let tagsFound = 0

    for (let i = 0; i < unscannedFiles.length; i++) {
      const file = unscannedFiles[i]
      try {
        const res  = await fetch('/api/face-scan', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ event_id: eventId, media_file_id: file.id }),
        })
        const json = await res.json() as { tags_created?: number }
        tagsFound += json.tags_created ?? 0
      } catch {
        // skip failed files
      }

      setScanState({ phase: 'scanning', done: i + 1, total: unscannedFiles.length, tagsFound })
    }

    setScanState((prev) => ({ ...prev, phase: 'done' }))
    router.refresh()
  }, [performersWithRef.length, unscannedFiles, eventId, router])

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <>
      <div className="space-y-6">

        {/* ── Header row ─────────────────────────────────────────────────── */}
        <div className="flex items-center justify-between">
          <div>
            <p className="text-white text-sm font-medium">
              {performers.length} performer{performers.length !== 1 ? 's' : ''}
            </p>
            <p className="text-[#555] text-xs mt-0.5">
              Tag reference photos to auto-identify people across the archive
            </p>
          </div>
          <button
            onClick={() => setAdding(true)}
            className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 bg-white text-black font-medium rounded-lg hover:bg-white/90 transition-all"
          >
            <UserPlus size={13} />
            Add performer
          </button>
        </div>

        {/* ── Add form ───────────────────────────────────────────────────── */}
        {adding && (
          <div className="bg-surface-0 border border-[#1f1f1f] rounded-lg p-4 space-y-3">
            <p className="text-white text-sm font-medium">New performer</p>
            <div className="flex gap-2">
              <input
                autoFocus
                value={draftName}
                onChange={(e) => setDraftName(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') submitAdd(); if (e.key === 'Escape') setAdding(false) }}
                placeholder="Name (e.g. DJ Lag)"
                className="flex-1 bg-surface-0 border border-[#2a2a2a] text-white text-sm px-3 py-2 rounded-lg placeholder:text-[#444] focus:outline-none focus:border-[#444] transition-colors"
              />
              <input
                value={draftRole}
                onChange={(e) => setDraftRole(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') submitAdd(); if (e.key === 'Escape') setAdding(false) }}
                placeholder="Role (e.g. Headliner)"
                className="w-44 bg-surface-0 border border-[#2a2a2a] text-white text-sm px-3 py-2 rounded-lg placeholder:text-[#444] focus:outline-none focus:border-[#444] transition-colors"
              />
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={submitAdd}
                disabled={!draftName.trim() || savingNew}
                className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 bg-white text-black font-medium rounded-lg hover:bg-white/90 disabled:opacity-40 transition-all"
              >
                {savingNew ? <Loader2 size={12} className="animate-spin" /> : <CheckCircle2 size={12} />}
                Add
              </button>
              <button
                onClick={() => { setAdding(false); setDraftName(''); setDraftRole('') }}
                className="text-xs text-[#555] hover:text-white transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* ── Performer cards ────────────────────────────────────────────── */}
        {performers.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {performers.map((performer) => {
              const count     = photoCounts[performer.id] ?? 0
              const isUploading = uploadingRef === performer.id

              return (
                <div
                  key={performer.id}
                  className="bg-surface-0 border border-[#1f1f1f] rounded-lg p-4 flex items-start gap-3"
                >
                  {/* Reference photo thumbnail */}
                  <div className="w-14 h-14 rounded-lg shrink-0 bg-surface-0 border border-[#222] overflow-hidden flex items-center justify-center relative">
                    {isUploading ? (
                      <Loader2 size={18} className="text-[#555] animate-spin" />
                    ) : performer.reference_url ? (
                      <Image
                        src={performer.reference_url} alt={performer.name}
                        fill className="object-cover" unoptimized
                      />
                    ) : (
                      <User size={20} className="text-[#333]" />
                    )}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <p className="text-white text-sm font-medium truncate">{performer.name}</p>
                    {performer.role && (
                      <p className="text-[#555] text-xs mt-0.5 truncate">{performer.role}</p>
                    )}
                    <div className="flex items-center gap-3 mt-2">
                      <span className="text-[#444] text-xs tabular-nums">
                        {count} photo{count !== 1 ? 's' : ''}
                      </span>
                      {/* Set reference photo */}
                      <button
                        onClick={() => setPickingFor(performer)}
                        disabled={isUploading}
                        className="inline-flex items-center gap-1 text-[10px] text-[#555] hover:text-white transition-colors disabled:opacity-40"
                      >
                        <Camera size={10} />
                        {performer.reference_url ? 'Change photo' : 'Set photo'}
                      </button>
                    </div>
                    {!performer.reference_url && (
                      <p className="text-amber-400/70 text-[10px] mt-1.5 flex items-center gap-1">
                        <AlertTriangle size={9} />
                        Reference photo needed for scanning
                      </p>
                    )}
                  </div>

                  {/* Delete */}
                  <button
                    onClick={() => deletePerformer(performer.id)}
                    className="text-[#333] hover:text-red-400 transition-colors shrink-0 mt-0.5"
                    aria-label="Delete performer"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              )
            })}
          </div>
        )}

        {performers.length === 0 && !adding && (
          <div className="flex flex-col items-center justify-center py-16 border border-dashed border-[#1f1f1f] rounded-lg text-center">
            <User size={28} className="text-[#333] mb-3" />
            <p className="text-[#555] text-sm">No performers added yet</p>
            <p className="text-[#3a3a3a] text-xs mt-1">Add a performer then set a reference photo to start face matching</p>
          </div>
        )}

        {/* ── Scan section ───────────────────────────────────────────────── */}
        {performersWithRef.length > 0 && (
          <div className="bg-surface-0 border border-[#1f1f1f] rounded-lg p-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-white text-sm font-medium">Scan for performers</p>
                <p className="text-[#555] text-xs mt-1">
                  {unscannedFiles.length > 0
                    ? `${unscannedFiles.length} photo${unscannedFiles.length !== 1 ? 's' : ''} not yet scanned`
                    : 'All photos have been scanned'}
                  {scanState.phase === 'done' && (
                    <span className="text-emerald-400 ml-2">· Found {scanState.tagsFound} match{scanState.tagsFound !== 1 ? 'es' : ''}</span>
                  )}
                </p>
              </div>

              {scanState.phase !== 'scanning' && unscannedFiles.length > 0 && (
                <button
                  onClick={startScan}
                  className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 border border-[#1f1f1f] text-[#555] hover:text-white hover:border-[#333] rounded-lg transition-all shrink-0"
                >
                  <Scan size={13} />
                  Scan now
                </button>
              )}
            </div>

            {/* Scan progress bar */}
            {scanState.phase === 'scanning' && (
              <div className="mt-3 space-y-2">
                <div className="flex items-center gap-2.5">
                  <div className="flex-1 h-1.5 bg-surface-0 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-blue-500 rounded-full transition-all duration-300"
                      style={{ width: `${Math.round((scanState.done / scanState.total) * 100)}%` }}
                    />
                  </div>
                  <span className="text-[#555] text-xs tabular-nums shrink-0">
                    {scanState.done}/{scanState.total}
                  </span>
                </div>
                <p className="text-[#444] text-xs">
                  Scanning {scanState.done} of {scanState.total} photos
                  {scanState.tagsFound > 0 && <span className="text-emerald-400 ml-2">· {scanState.tagsFound} matches so far</span>}
                </p>
              </div>
            )}
          </div>
        )}

      </div>

      {/* Reference picker modal */}
      {pickingFor && (
        <FaceReferencePicker
          files={mediaFiles}
          performerName={pickingFor.name}
          onConfirm={handleReferenceConfirm}
          onCancel={() => setPickingFor(null)}
        />
      )}
    </>
  )
}
