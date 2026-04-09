'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { ChevronUp, ChevronDown, CheckCircle2, X } from 'lucide-react'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface TaggingJob {
  total:     number
  startedAt: number  // Date.now() when job was queued
  eventId:   string | null
  mode?:     'rescore'  // when set: polls score_status, shows rescore labels
}

const JOB_KEY = 'trunq-tagging-job'

export function saveTaggingJob(job: TaggingJob) {
  try {
    localStorage.setItem(JOB_KEY, JSON.stringify(job))
    window.dispatchEvent(new CustomEvent('tagging-job-started'))
  } catch {}
}

function loadJob(): TaggingJob | null {
  try {
    const raw = localStorage.getItem(JOB_KEY)
    return raw ? (JSON.parse(raw) as TaggingJob) : null
  } catch { return null }
}

function clearJob() {
  try { localStorage.removeItem(JOB_KEY) } catch {}
}

// ─── ETA helpers ─────────────────────────────────────────────────────────────

function fmtEta(ms: number): string {
  const sec = ms / 1000
  if (sec < 60)   return `~${Math.max(1, Math.round(sec))}s remaining`
  const min = Math.round(sec / 60)
  return `~${min} min remaining`
}

// ─── StatusCounts ─────────────────────────────────────────────────────────────

interface Counts {
  queued:     number
  processing: number
  complete:   number
  failed:     number
  untagged:   number
}

// ─── TaggingProgress ──────────────────────────────────────────────────────────

export default function TaggingProgress() {
  const [job, setJob]         = useState<TaggingJob | null>(null)
  const [counts, setCounts]   = useState<Counts | null>(null)
  const [expanded, setExpanded] = useState(true)
  const [done, setDone]       = useState(false)
  const [mounted, setMounted] = useState(false)
  const pollRef               = useRef<ReturnType<typeof setInterval> | null>(null)
  const doneTimerRef          = useRef<ReturnType<typeof setTimeout> | null>(null)
  const etaRef                = useRef<{ processedSnapshot: number; etaMs: number }>({ processedSnapshot: 0, etaMs: 0 })

  // SSR guard
  useEffect(() => { setMounted(true) }, [])

  const startPolling = useCallback((j: TaggingJob) => {
    setJob(j)
    setDone(false)

    async function poll() {
      try {
        const url = j.eventId
          ? `/api/tag/status?event_id=${j.eventId}${j.mode === 'rescore' ? '&mode=rescore' : ''}`
          : `/api/tag/status${j.mode === 'rescore' ? '?mode=rescore' : ''}`
        const res = await fetch(url)
        if (!res.ok) return
        const c = await res.json() as Counts
        setCounts(c)

        const remaining = c.queued + c.processing
        if (remaining === 0 && c.complete > 0) {
          // Job finished
          if (pollRef.current) clearInterval(pollRef.current)
          pollRef.current = null
          setDone(true)
          doneTimerRef.current = setTimeout(() => {
            setJob(null)
            setCounts(null)
            setDone(false)
            clearJob()
          }, 4000)
        }
      } catch {}
    }

    // Poll immediately, then every 5s
    poll()
    pollRef.current = setInterval(poll, 5000)
  }, [])

  // Mount: read localStorage for any in-progress job
  useEffect(() => {
    const existing = loadJob()
    if (existing) startPolling(existing)

    function onJobStarted() {
      const j = loadJob()
      if (j) {
        if (pollRef.current) clearInterval(pollRef.current)
        startPolling(j)
      }
    }

    window.addEventListener('tagging-job-started', onJobStarted)
    return () => {
      window.removeEventListener('tagging-job-started', onJobStarted)
      if (pollRef.current) clearInterval(pollRef.current)
      if (doneTimerRef.current) clearTimeout(doneTimerRef.current)
    }
  }, [startPolling])

  // ETA: recalculate every 10 completed images
  const eta = (() => {
    if (!job || !counts) return null
    const processed = job.total - (counts.queued + counts.processing)
    if (processed < 10) return null
    // Update snapshot every 10 images
    if (processed - etaRef.current.processedSnapshot >= 10 || etaRef.current.etaMs === 0) {
      const elapsed = Date.now() - job.startedAt
      const avgMs   = elapsed / processed
      const remaining = counts.queued + counts.processing
      etaRef.current = { processedSnapshot: processed, etaMs: avgMs * remaining }
    }
    if (etaRef.current.etaMs <= 0) return null
    return fmtEta(etaRef.current.etaMs)
  })()

  if (!mounted || !job) return null

  const remaining = counts ? counts.queued + counts.processing : job.total
  const processed = job.total - remaining
  const pct       = job.total > 0 ? Math.round((processed / job.total) * 100) : 0

  return createPortal(
    <div
      className="fixed bottom-6 right-6 z-50 w-80 shadow-2xl rounded-xl overflow-hidden border border-[#2a2a2a]"
      style={{ background: 'var(--surface-0)' }}
    >
      {/* Header row */}
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center gap-3 px-4 py-3 hover:bg-white/4 transition-colors"
      >
        <div className="flex-1 min-w-0">
          {done ? (
            <p className="text-xs font-medium text-left flex items-center gap-1.5 text-emerald-400">
              <CheckCircle2 size={12} />
              {job.mode === 'rescore'
                ? `${processed} image${processed !== 1 ? 's' : ''} re-scored`
                : `${processed} image${processed !== 1 ? 's' : ''} tagged & scored`}
            </p>
          ) : (
            <>
              <p className="text-xs font-medium text-left" style={{ color: 'var(--text-primary)' }}>
                {job.mode === 'rescore' ? 'Re-scoring' : 'Tagging'} in progress
                {counts && ` — ${processed} / ${job.total} complete`}
              </p>
              <div className="h-1 bg-[#1f1f1f] rounded-full overflow-hidden mt-1.5">
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{ width: `${pct}%`, background: '#a855f7' }}
                />
              </div>
            </>
          )}
        </div>

        {eta && !done && (
          <span className="text-[#555] text-[10px] tabular-nums shrink-0">{eta}</span>
        )}

        <div className="flex items-center gap-1 shrink-0">
          {expanded
            ? <ChevronDown size={14} className="text-[#555]" />
            : <ChevronUp   size={14} className="text-[#555]" />}
          {done && (
            <span
              role="button"
              tabIndex={0}
              onClick={(e) => {
                e.stopPropagation()
                setJob(null); setCounts(null); setDone(false); clearJob()
              }}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.stopPropagation(); setJob(null); setCounts(null); setDone(false); clearJob() } }}
              className="text-[#444] hover:text-white transition-colors ml-1"
              aria-label="Dismiss"
            >
              <X size={13} />
            </span>
          )}
        </div>
      </button>

      {/* Expanded detail */}
      {expanded && !done && counts && (
        <div className="border-t border-[#1a1a1a] px-4 py-3 space-y-1">
          {counts.queued > 0 && (
            <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
              {counts.queued} waiting
            </p>
          )}
          {counts.processing > 0 && (
            <p className="text-[11px] text-purple-400">
              {counts.processing} processing now
            </p>
          )}
          {counts.failed > 0 && (
            <p className="text-[11px]" style={{ color: 'var(--flagged-fg)' }}>
              {counts.failed} failed
            </p>
          )}
          <p className="text-[10px]" style={{ color: 'var(--text-dim)' }}>
            You can navigate away — this runs server-side.
          </p>
        </div>
      )}
    </div>,
    document.body
  )
}
