'use client'

import { useState, useMemo, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import { Check, Pause, X, Zap, CheckCircle2 } from 'lucide-react'
import clsx from 'clsx'
import type { MediaFileWithTags } from '@/types'
import { transformUrl } from '@/lib/supabase/storage'
import Pill, { ScorePill } from '@/components/ui/Pill'

// ─── Types ────────────────────────────────────────────────────────────────────

type ReviewStatus = 'pending' | 'approved' | 'rejected' | 'held'

interface Props {
  files: MediaFileWithTags[]
  eventId: string
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function cardBorderClass(status: ReviewStatus): string {
  switch (status) {
    case 'approved': return 'border-emerald-500/40 ring-1 ring-inset ring-emerald-500/20'
    case 'rejected': return 'border-red-500/40 ring-1 ring-inset ring-red-500/20'
    case 'held':     return 'border-amber-500/40 ring-1 ring-inset ring-amber-500/20'
    default:         return 'border-[#1f1f1f]'
  }
}

// ─── ReviewTab ────────────────────────────────────────────────────────────────

// Toast state for undo-reject
interface ToastState {
  ids: string[]
  timerId: ReturnType<typeof setTimeout>
}

export default function ReviewTab({ files, eventId: _eventId }: Props) {
  const router = useRouter()

  const [overrides, setOverrides]         = useState<Record<string, ReviewStatus>>({})
  const [loading, setLoading]             = useState<Set<string>>(new Set())
  const [bulkWorking, setBulkWorking]     = useState(false)
  const [approveThreshold, setApproveThreshold] = useState(75)
  const [rejectThreshold, setRejectThreshold]   = useState(50)
  const [toast, setToast]                 = useState<ToastState | null>(null)

  const imageFiles = useMemo(() => files.filter((f) => f.file_type === 'image'), [files])

  function effectiveStatus(id: string, serverStatus: string): ReviewStatus {
    return (overrides[id] ?? serverStatus) as ReviewStatus
  }

  // Soft-delete rejected photos via trash API
  async function trashPhotos(ids: string[]) {
    await Promise.all(
      ids.map((id) =>
        fetch('/api/trash', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ type: 'photo', id }),
        })
      )
    )
  }

  // Restore trashed photos (undo)
  async function restorePhotos(ids: string[]) {
    await Promise.all(
      ids.map((id) =>
        fetch('/api/trash', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ type: 'photo', id }),
        })
      )
    )
  }

  // Undo reject: restore from trash + reset to pending
  const undoReject = useCallback(async (ids: string[]) => {
    setToast(null)
    await restorePhotos(ids)
    await fetch('/api/review', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids, status: 'pending' }),
    })
    setOverrides((prev) => {
      const next = { ...prev }
      ids.forEach((id) => { delete next[id] })
      return next
    })
  }, [])

  // Permanently delete all rejected photos
  const emptyTrash = useCallback(async () => {
    const rejectedIds = imageFiles
      .filter((f) => effectiveStatus(f.id, f.review_status) === 'rejected')
      .map((f) => f.id)
    if (!rejectedIds.length) return
    if (!confirm(`Permanently delete ${rejectedIds.length} rejected photo${rejectedIds.length !== 1 ? 's' : ''}? This cannot be undone.`)) return
    if (toast) {
      clearTimeout(toast.timerId)
      setToast(null)
    }
    await Promise.all(
      rejectedIds.map((id) =>
        fetch(`/api/trash?type=photo&id=${id}`, { method: 'DELETE' })
      )
    )
    router.refresh()
  }, [imageFiles, overrides, toast, router]) // eslint-disable-line react-hooks/exhaustive-deps

  // Patch review status + optionally trash rejected photos
  const setStatus = useCallback(async (ids: string[], status: ReviewStatus) => {
    setOverrides((prev) => {
      const next = { ...prev }
      ids.forEach((id) => { next[id] = status })
      return next
    })
    setLoading((prev) => new Set([...prev, ...ids]))

    try {
      await fetch('/api/review', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids, status }),
      })

      if (status === 'rejected') {
        await trashPhotos(ids)
        // Clear any existing toast
        if (toast) clearTimeout(toast.timerId)
        const timerId = setTimeout(() => {
          setToast(null)
          router.refresh()
        }, 5000)
        setToast({ ids, timerId })
      } else {
        router.refresh()
      }
    } finally {
      setLoading((prev) => {
        const next = new Set(prev)
        ids.forEach((id) => next.delete(id))
        return next
      })
    }
  }, [router, toast]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Counts ───────────────────────────────────────────────────────────────
  const counts = useMemo(() => {
    const c = { pending: 0, approved: 0, rejected: 0, held: 0 }
    imageFiles.forEach((f) => {
      const s = effectiveStatus(f.id, f.review_status)
      c[s]++
    })
    return c
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [imageFiles, overrides])

  const reviewedCount = counts.approved + counts.rejected + counts.held
  const allReviewed   = imageFiles.length > 0 && counts.pending === 0

  // ── Bulk actions ─────────────────────────────────────────────────────────

  async function bulkApproveHigh() {
    const ids = imageFiles
      .filter((f) => effectiveStatus(f.id, f.review_status) === 'pending' && (f.quality_score ?? 0) >= approveThreshold)
      .map((f) => f.id)
    if (!ids.length) return
    setBulkWorking(true)
    await setStatus(ids, 'approved')
    setBulkWorking(false)
  }

  async function bulkRejectLow() {
    const ids = imageFiles
      .filter((f) => effectiveStatus(f.id, f.review_status) === 'pending' && (f.quality_score ?? 100) < rejectThreshold)
      .map((f) => f.id)
    if (!ids.length) return
    setBulkWorking(true)
    await setStatus(ids, 'rejected')
    setBulkWorking(false)
  }

  // Preview counts for bulk actions
  const approvePreviewCount = useMemo(
    () => imageFiles.filter((f) => effectiveStatus(f.id, f.review_status) === 'pending' && (f.quality_score ?? 0) >= approveThreshold).length,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [imageFiles, overrides, approveThreshold]
  )
  const rejectPreviewCount = useMemo(
    () => imageFiles.filter((f) => effectiveStatus(f.id, f.review_status) === 'pending' && (f.quality_score ?? 100) < rejectThreshold).length,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [imageFiles, overrides, rejectThreshold]
  )

  // ── Grouping ─────────────────────────────────────────────────────────────
  const groups = useMemo(() => {
    const map: Record<string, MediaFileWithTags[]> = {}
    imageFiles.forEach((f) => {
      const key = f.photographer ?? 'Unassigned'
      if (!map[key]) map[key] = []
      map[key].push(f)
    })
    const keys = Object.keys(map).sort((a, b) => {
      if (a === 'Unassigned') return 1
      if (b === 'Unassigned') return -1
      return a.localeCompare(b)
    })
    return keys.map((name) => ({ name, files: map[name] }))
  }, [imageFiles])

  const showHeaders = groups.length > 1 || (groups[0]?.name !== 'Unassigned')

  // ── Empty state ──────────────────────────────────────────────────────────
  if (imageFiles.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center border border-dashed border-[#1f1f1f] rounded-lg">
        <p className="text-[#666] text-sm">No images to review yet.</p>
        <p className="text-[#555] text-xs mt-1">Upload photos to get started.</p>
      </div>
    )
  }

  // ── Resolution screen ─────────────────────────────────────────────────────
  if (allReviewed) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <div className="w-16 h-16 rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center mb-5">
          <CheckCircle2 size={28} className="text-emerald-400" />
        </div>
        <h2 className="text-white text-base font-semibold mb-2">Review complete</h2>
        <div className="flex items-center gap-2 mt-2 flex-wrap">
          <Pill variant="approved">{counts.approved} approved</Pill>
          {counts.held > 0     && <Pill variant="ghost">{counts.held} held</Pill>}
          {counts.rejected > 0 && <Pill variant="flagged">{counts.rejected} rejected &amp; moved to trash</Pill>}
        </div>
        <button
          onClick={() => {
            // Reset overrides so the grid re-shows (pending state reloaded after router.refresh)
            setOverrides({})
          }}
          className="mt-6 text-xs text-[#555] hover:text-white transition-colors underline underline-offset-2"
        >
          Review again
        </button>
      </div>
    )
  }

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <div>
      {/* ── Toast ────────────────────────────────────────────────────────── */}
      {toast && (
        <div style={{
          position:     'fixed',
          bottom:       24,
          left:         '50%',
          transform:    'translateX(-50%)',
          zIndex:       100,
          display:      'flex',
          alignItems:   'center',
          gap:          10,
          background:   'var(--surface-1)',
          border:       'var(--border-rule)',
          borderRadius: 4,
          padding:      '10px 14px',
          fontSize:     12,
          color:        'var(--text-primary)',
          boxShadow:    '0 4px 16px rgba(0,0,0,0.15)',
          whiteSpace:   'nowrap',
        }}>
          <span style={{ color: 'var(--text-secondary)' }}>
            {toast.ids.length} photo{toast.ids.length !== 1 ? 's' : ''} moved to trash
          </span>
          <button
            onClick={() => undoReject(toast.ids)}
            style={{ color: 'var(--accent)', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: 12, fontWeight: 500, padding: 0 }}
          >
            Undo
          </button>
        </div>
      )}

      {/* ── Progress + threshold sliders ─────────────────────────────────── */}
      <div className="flex items-start justify-between gap-6 mb-4 flex-wrap">
        <div>
          <p style={{ color: 'var(--text-primary)', fontSize: 13, fontWeight: 500, marginBottom: 8, marginTop: 0 }}>
            Reviewed {reviewedCount} of {imageFiles.length} photo{imageFiles.length !== 1 ? 's' : ''}
          </p>
          <div className="flex items-center gap-2 flex-wrap">
            <Pill variant="approved">{counts.approved} approved</Pill>
            {counts.held > 0     && <Pill variant="ghost">{counts.held} held</Pill>}
            {counts.rejected > 0 && (
              <>
                <Pill variant="flagged">{counts.rejected} rejected</Pill>
                <button
                  onClick={emptyTrash}
                  style={{ fontSize: 10, color: 'var(--flagged-fg)', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', padding: 0, opacity: 0.7 }}
                >
                  Empty trash
                </button>
              </>
            )}
            {counts.pending > 0  && <Pill variant="ghost">{counts.pending} pending</Pill>}
          </div>
        </div>

        {/* Bulk threshold controls */}
        <div className="flex flex-col gap-3 min-w-[280px]">
          {/* Approve slider */}
          <div className="flex items-center gap-3">
            <div className="flex-1">
              <div className="flex items-center justify-between mb-1">
                <span className="text-[#555] text-[11px]">Approve score ≥</span>
                <span className="text-emerald-400 text-[11px] font-mono tabular-nums">{approveThreshold}</span>
              </div>
              <input
                type="range" min={0} max={100} step={5}
                value={approveThreshold}
                onChange={(e) => setApproveThreshold(Number(e.target.value))}
                className="w-full h-1 appearance-none rounded-full bg-[#1f1f1f] accent-emerald-500 cursor-pointer"
              />
            </div>
            <button
              onClick={bulkApproveHigh}
              disabled={bulkWorking || approvePreviewCount === 0}
              className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 hover:bg-emerald-500/20 rounded-lg transition-all disabled:opacity-40 disabled:cursor-not-allowed shrink-0 whitespace-nowrap"
            >
              <Zap size={11} />
              Apply ({approvePreviewCount})
            </button>
          </div>

          {/* Reject slider */}
          <div className="flex items-center gap-3">
            <div className="flex-1">
              <div className="flex items-center justify-between mb-1">
                <span className="text-[#555] text-[11px]">Reject score &lt;</span>
                <span className="text-red-400 text-[11px] font-mono tabular-nums">{rejectThreshold}</span>
              </div>
              <input
                type="range" min={0} max={100} step={5}
                value={rejectThreshold}
                onChange={(e) => setRejectThreshold(Number(e.target.value))}
                className="w-full h-1 appearance-none rounded-full bg-[#1f1f1f] accent-red-500 cursor-pointer"
              />
            </div>
            <button
              onClick={bulkRejectLow}
              disabled={bulkWorking || rejectPreviewCount === 0}
              className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 bg-red-500/10 text-red-400 border border-red-500/20 hover:bg-red-500/20 rounded-lg transition-all disabled:opacity-40 disabled:cursor-not-allowed shrink-0 whitespace-nowrap"
            >
              <X size={11} strokeWidth={3} />
              Apply ({rejectPreviewCount})
            </button>
          </div>
        </div>
      </div>

      {/* Progress bar */}
      <div className="h-1.5 bg-[#1f1f1f] rounded-full overflow-hidden mb-7">
        <div
          className="h-full bg-emerald-500/60 rounded-full transition-all duration-500"
          style={{ width: `${Math.round((reviewedCount / imageFiles.length) * 100)}%` }}
        />
      </div>

      {/* ── Photo groups ───────────────────────────────────────────────── */}
      <div className="space-y-8">
        {groups.map((group) => (
          <div key={group.name}>
            {showHeaders && (
              <h3 className="flex items-center gap-2 text-[#666] text-xs font-medium uppercase tracking-wider mb-3">
                {group.name}
                <span className="text-[#3a3a3a] font-normal normal-case tracking-normal">
                  {group.files.length} photo{group.files.length !== 1 ? 's' : ''}
                </span>
              </h3>
            )}

            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
              {group.files.map((file) => {
                const status    = effectiveStatus(file.id, file.review_status)
                const isLoading = loading.has(file.id)
                const previewTags = (file.tags ?? []).slice(0, 2)

                return (
                  <div
                    key={file.id}
                    className={clsx(
                      'rounded-lg overflow-hidden border bg-surface-0 flex flex-col transition-all duration-150',
                      cardBorderClass(status),
                      isLoading && 'opacity-60 pointer-events-none'
                    )}
                  >
                    <div className="relative aspect-square bg-surface-0">
                      <Image
                        src={transformUrl(file.signed_url ?? file.public_url, 400)}
                        alt={file.filename}
                        fill
                        sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 20vw"
                        className="object-cover"
                        unoptimized
                      />

                      {file.quality_score != null && (
                        <div className="absolute top-1.5 right-1.5">
                          <ScorePill score={file.quality_score} />
                        </div>
                      )}

                      {status !== 'pending' && (
                        <div className={clsx(
                          'absolute top-1.5 left-1.5 w-5 h-5 rounded-full flex items-center justify-center',
                          status === 'approved' && 'bg-emerald-500',
                          status === 'rejected' && 'bg-red-500',
                          status === 'held'     && 'bg-amber-500',
                        )}>
                          {status === 'approved' && <Check size={11} className="text-white" strokeWidth={3} />}
                          {status === 'rejected' && <X     size={11} className="text-white" strokeWidth={3} />}
                          {status === 'held'     && <Pause size={11} className="text-white" />}
                        </div>
                      )}
                    </div>

                    <div className="px-2 pt-1.5 pb-2 flex flex-col gap-1.5">
                      <p className="text-white text-[11px] truncate leading-tight">{file.filename}</p>

                      {previewTags.length > 0 && (
                        <div className="flex flex-wrap gap-1">
                          {previewTags.map((t) => (
                            <Pill key={t.id} variant="ghost">{t.value}</Pill>
                          ))}
                        </div>
                      )}

                      <div className="flex gap-1 mt-0.5">
                        {status === 'approved' ? (
                          <button
                            onClick={() => setStatus([file.id], 'pending')}
                            disabled={isLoading}
                            title="Undo approval"
                            className="flex-1 flex items-center justify-center gap-1 py-1 rounded text-[10px] font-medium transition-all bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500/10"
                          >
                            <Check size={9} strokeWidth={3} />
                            Undo
                          </button>
                        ) : (
                          <button
                            onClick={() => setStatus([file.id], 'approved')}
                            disabled={isLoading}
                            title="Approve"
                            className="flex-1 flex items-center justify-center gap-1 py-1 rounded text-[10px] font-medium transition-all bg-surface-0 text-[#555] hover:bg-emerald-500/10 hover:text-emerald-400 border border-[#222] hover:border-emerald-500/20"
                          >
                            <Check size={9} strokeWidth={3} />
                            OK
                          </button>
                        )}
                        <button
                          onClick={() => setStatus([file.id], 'held')}
                          disabled={isLoading || status === 'held'}
                          title="Hold"
                          className={clsx(
                            'flex-1 flex items-center justify-center gap-1 py-1 rounded text-[10px] font-medium transition-all',
                            status === 'held'
                              ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                              : 'bg-surface-0 text-[#555] hover:bg-amber-500/10 hover:text-amber-400 border border-[#222] hover:border-amber-500/20'
                          )}
                        >
                          <Pause size={9} />
                          Hold
                        </button>
                        <button
                          onClick={() => setStatus([file.id], 'rejected')}
                          disabled={isLoading || status === 'rejected'}
                          title="Reject & move to trash"
                          className={clsx(
                            'flex-1 flex items-center justify-center gap-1 py-1 rounded text-[10px] font-medium transition-all',
                            status === 'rejected'
                              ? 'bg-red-500/20 text-red-400 border border-red-500/30'
                              : 'bg-surface-0 text-[#555] hover:bg-red-500/10 hover:text-red-400 border border-[#222] hover:border-red-500/20'
                          )}
                        >
                          <X size={9} strokeWidth={3} />
                          No
                        </button>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
