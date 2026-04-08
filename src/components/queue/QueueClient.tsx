'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import Image from 'next/image'
import { Check, X, RotateCcw, Loader2, Copy } from 'lucide-react'
import Sidebar from '@/components/layout/Sidebar'
import { ScorePill } from '@/components/ui/Pill'
import type { MediaFile } from '@/types'

// ─── Types ────────────────────────────────────────────────────────────────────

type QueuePhoto = MediaFile & {
  signed_url?: string
  events: { id: string; name: string; date: string; photographers: string[] } | null
}

interface DupGroup {
  ids:               string[]
  recommended_keep:  string
}

interface Props {
  initialPhotos: QueuePhoto[]
  events:        { id: string; name: string }[]
  role:          string
  approvedCount: number
  rejectedCount: number
}

// ─── Constants ────────────────────────────────────────────────────────────────

const GROUP_TINTS = [
  'rgba(184,136,11,0.07)',
  'rgba(41,128,185,0.07)',
  'rgba(142,68,173,0.07)',
  'rgba(29,158,117,0.07)',
  'rgba(192,57,43,0.07)',
]

// ─── API call ─────────────────────────────────────────────────────────────────

async function setStatus(ids: string[], status: 'approved' | 'rejected') {
  await fetch('/api/review', {
    method:  'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ ids, status }),
  })
}

// ─── Progress bar ─────────────────────────────────────────────────────────────

function ProgressBar({ approved, pending, rejected }: { approved: number; pending: number; rejected: number }) {
  const total = approved + pending + rejected
  if (total === 0) return null
  const aPct = (approved / total) * 100
  const pPct = (pending  / total) * 100
  const rPct = (rejected / total) * 100
  return (
    <div style={{ display: 'flex', height: 3, borderRadius: 2, overflow: 'hidden', background: 'var(--surface-2)' }}>
      {aPct > 0 && <div style={{ width: `${aPct}%`, background: '#1D9E75', transition: 'width 0.4s ease' }} />}
      {pPct > 0 && <div style={{ width: `${pPct}%`, background: 'var(--surface-3)', transition: 'width 0.4s ease' }} />}
      {rPct > 0 && <div style={{ width: `${rPct}%`, background: '#c0392b', transition: 'width 0.4s ease' }} />}
    </div>
  )
}

// ─── Select-all checkbox ──────────────────────────────────────────────────────

function SelectAllBox({
  allSelected,
  someSelected,
  onClick,
}: {
  allSelected:  boolean
  someSelected: boolean
  onClick:      () => void
}) {
  return (
    <div
      role="checkbox"
      aria-checked={allSelected ? true : someSelected ? 'mixed' : false}
      onClick={onClick}
      style={{
        width:          16,
        height:         16,
        borderRadius:   2,
        border:         `1.5px solid ${allSelected || someSelected ? 'var(--accent)' : 'var(--surface-3)'}`,
        background:     allSelected ? 'var(--accent)' : 'var(--surface-1)',
        cursor:         'pointer',
        display:        'flex',
        alignItems:     'center',
        justifyContent: 'center',
        flexShrink:     0,
        transition:     'background 0.1s, border-color 0.1s',
      }}
    >
      {allSelected  && <Check size={10} color="#fff" strokeWidth={3} />}
      {someSelected && !allSelected && (
        <div style={{ width: 8, height: 2, background: 'var(--accent)', borderRadius: 1 }} />
      )}
    </div>
  )
}

// ─── Photo card ───────────────────────────────────────────────────────────────

function QueueCard({
  photo, selected, focused, exiting, dupInfo,
  onSelect, onApprove, onReject, onRescore, isRescoring,
}: {
  photo:       QueuePhoto
  selected:    boolean
  focused:     boolean
  exiting:     boolean
  dupInfo?:    { groupIdx: number; isKeep: boolean } | null
  onSelect:    () => void
  onApprove:   (e: React.MouseEvent) => void
  onReject:    (e: React.MouseEvent) => void
  onRescore?:  (e: React.MouseEvent) => void
  isRescoring: boolean
}) {
  const src = photo.signed_url ?? photo.public_url

  const borderColor = selected
    ? 'var(--accent)'
    : focused
    ? 'var(--text-dim)'
    : dupInfo && dupInfo.isKeep
    ? '#1D9E75'
    : dupInfo
    ? '#b8860b'
    : 'transparent'

  return (
    <div
      className="group relative"
      data-photo-id={photo.id}
      style={{
        aspectRatio:  '3/2',
        overflow:     'hidden',
        borderRadius: 2,
        cursor:       'pointer',
        border:       `1.5px solid ${borderColor}`,
        background:   'var(--surface-2)',
        opacity:      exiting ? 0 : 1,
        transition:   'opacity 0.22s ease, border-color 0.1s',
      }}
      onClick={onSelect}
      tabIndex={0}
    >
      {src && (
        <Image
          src={src}
          alt={photo.filename}
          fill
          sizes="(max-width: 768px) 50vw, 20vw"
          className="object-cover"
          unoptimized
        />
      )}

      {/* Duplicate group tint overlay */}
      {dupInfo && (
        <div style={{
          position:      'absolute',
          inset:         0,
          zIndex:        1,
          background:    GROUP_TINTS[dupInfo.groupIdx % GROUP_TINTS.length],
          pointerEvents: 'none',
        }} />
      )}

      {/* Left half: approve */}
      <div
        className="absolute opacity-0 group-hover:opacity-100 transition-opacity"
        style={{
          top: 0, left: 0, bottom: 0, width: '50%',
          background: 'rgba(29,158,117,0.30)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          cursor: 'pointer', zIndex: 3,
        }}
        onClick={onApprove}
      >
        <Check size={22} color="#1D9E75" strokeWidth={2.5} />
      </div>

      {/* Right half: reject */}
      <div
        className="absolute opacity-0 group-hover:opacity-100 transition-opacity"
        style={{
          top: 0, right: 0, bottom: 0, width: '50%',
          background: 'rgba(192,57,43,0.30)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          cursor: 'pointer', zIndex: 3,
        }}
        onClick={onReject}
      >
        <X size={22} color="#c0392b" strokeWidth={2.5} />
      </div>

      {/* Checkbox top-left */}
      <div className="absolute" style={{ top: 6, left: 6, zIndex: 4, opacity: selected ? 1 : undefined }}>
        <div
          className={selected ? '' : 'opacity-0 group-hover:opacity-100 transition-opacity'}
          style={{
            width: 16, height: 16, borderRadius: 2,
            border: '1.5px solid rgba(255,255,255,0.8)',
            background: selected ? 'var(--accent)' : 'rgba(0,0,0,0.45)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >
          {selected && <Check size={10} color="#fff" />}
        </div>
      </div>

      {/* Score pill top-right */}
      <div style={{ position: 'absolute', top: 5, right: 5, zIndex: 5 }}>
        {isRescoring ? (
          <div style={{
            display: 'inline-flex', alignItems: 'center',
            fontSize: 8, padding: '2px 5px', borderRadius: 2,
            background: 'rgba(0,0,0,0.5)', color: 'rgba(255,255,255,0.5)',
          }}>
            <Loader2 size={8} style={{ animation: 'spin 1s linear infinite' }} />
          </div>
        ) : photo.quality_score != null ? (
          <ScorePill score={photo.quality_score} />
        ) : (
          <button
            onClick={onRescore}
            title="Score missing — click to re-score"
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 3,
              fontSize: 8, padding: '2px 5px', borderRadius: 2,
              background: 'rgba(0,0,0,0.5)', color: 'rgba(255,255,255,0.5)',
              border: 'none', cursor: 'pointer',
            }}
          >
            — <RotateCcw size={7} />
          </button>
        )}
      </div>

      {/* DUP / KEEP badge bottom-left */}
      {dupInfo && (
        <div style={{
          position:     'absolute',
          bottom:       4,
          left:         4,
          zIndex:       5,
          fontSize:     7,
          fontWeight:   700,
          letterSpacing:'0.06em',
          padding:      '1px 4px',
          borderRadius: 1,
          background:   dupInfo.isKeep ? 'rgba(29,158,117,0.88)' : 'rgba(184,136,11,0.88)',
          color:        '#fff',
          pointerEvents:'none',
        }}>
          {dupInfo.isKeep ? 'KEEP' : 'DUP'}
        </div>
      )}
    </div>
  )
}

// ─── QueueClient ──────────────────────────────────────────────────────────────

export default function QueueClient({ initialPhotos, events, approvedCount: initialApproved, rejectedCount: initialRejected }: Props) {
  const [photos,           setPhotos]           = useState<QueuePhoto[]>(initialPhotos)
  const [selected,         setSelected]         = useState<Set<string>>(new Set())
  const [exiting,          setExiting]          = useState<Set<string>>(new Set())
  const [filterProject,    setFilterProject]    = useState('')
  const [filterPhotog,     setFilterPhotog]     = useState('')
  const [focusedIndex,     setFocusedIndex]     = useState(0)
  const [rescoring,        setRescoring]        = useState<Set<string>>(new Set())
  const [backfilling,      setBackfilling]      = useState(false)
  const [backfillProgress, setBackfillProgress] = useState<{ processed: number; total: number } | null>(null)
  const [approvedDelta,    setApprovedDelta]    = useState(0)
  const [rejectedDelta,    setRejectedDelta]    = useState(0)
  const [dupGroups,        setDupGroups]        = useState<DupGroup[]>([])
  const [findingDupes,     setFindingDupes]     = useState(false)

  const approvedCount = initialApproved + approvedDelta
  const rejectedCount = initialRejected + rejectedDelta

  // Unique photographers
  const photographers = [...new Set(
    photos.map((p) => p.photographer).filter((p): p is string => !!p)
  )].sort()

  // Filtered list
  const filtered = useMemo(() => photos.filter((p) => {
    if (filterProject && p.event_id !== filterProject) return false
    if (filterPhotog  && p.photographer !== filterPhotog)  return false
    return true
  }), [photos, filterProject, filterPhotog])

  const clampFocus = useCallback((i: number) => Math.max(0, Math.min(i, filtered.length - 1)), [filtered.length])

  // Select-all derived state
  const allSelected  = filtered.length > 0 && filtered.every((p) => selected.has(p.id))
  const someSelected = selected.size > 0 && !allSelected

  function toggleSelectAll() {
    if (allSelected) {
      setSelected(new Set())
    } else {
      setSelected(new Set(filtered.map((p) => p.id)))
    }
  }

  // Duplicate photo map: id → { groupIdx, isKeep }
  const dupPhotoMap = useMemo(() => {
    const map = new Map<string, { groupIdx: number; isKeep: boolean }>()
    dupGroups.forEach((group, i) => {
      group.ids.forEach((id) => {
        map.set(id, { groupIdx: i, isKeep: id === group.recommended_keep })
      })
    })
    return map
  }, [dupGroups])

  // ── Actions ──────────────────────────────────────────────────────────────────

  const animateOut = useCallback((ids: string[], cb: () => void) => {
    setExiting((prev) => new Set([...prev, ...ids]))
    setTimeout(() => {
      cb()
      setExiting((prev) => { const n = new Set(prev); ids.forEach((id) => n.delete(id)); return n })
    }, 230)
  }, [])

  const approve = useCallback(async (ids: string[]) => {
    animateOut(ids, async () => {
      await setStatus(ids, 'approved')
      setPhotos((prev) => prev.filter((p) => !ids.includes(p.id)))
      setSelected((prev) => { const n = new Set(prev); ids.forEach((id) => n.delete(id)); return n })
      setApprovedDelta((d) => d + ids.length)
    })
  }, [animateOut])

  const reject = useCallback(async (ids: string[]) => {
    animateOut(ids, async () => {
      await setStatus(ids, 'rejected')
      setPhotos((prev) => prev.filter((p) => !ids.includes(p.id)))
      setSelected((prev) => { const n = new Set(prev); ids.forEach((id) => n.delete(id)); return n })
      setRejectedDelta((d) => d + ids.length)
    })
  }, [animateOut])

  const unscoredCount = useMemo(
    () => photos.filter((p) => p.file_type === 'image' && p.quality_score == null).length,
    [photos],
  )

  const bulkApproveHigh = useCallback(() => {
    const ids = filtered.filter((p) => p.quality_score != null && p.quality_score >= 70).map((p) => p.id)
    if (ids.length) approve(ids)
  }, [filtered, approve])

  const bulkRejectLow = useCallback(() => {
    const ids = filtered.filter((p) => p.quality_score != null && p.quality_score < 50).map((p) => p.id)
    if (ids.length) reject(ids)
  }, [filtered, reject])

  const highCount = useMemo(() => filtered.filter((p) => p.quality_score != null && p.quality_score >= 70).length, [filtered])
  const lowCount  = useMemo(() => filtered.filter((p) => p.quality_score != null && p.quality_score < 50).length,  [filtered])

  const rescoreOne = useCallback(async (id: string, e: React.MouseEvent) => {
    e.stopPropagation()
    setRescoring((prev) => new Set([...prev, id]))
    try {
      const res = await fetch('/api/tag', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ media_file_id: id }),
      })
      if (res.ok) {
        const json = await res.json() as { quality_score?: number }
        if (json.quality_score != null) {
          setPhotos((prev) => prev.map((p) => p.id === id ? { ...p, quality_score: json.quality_score! } : p))
        }
      }
    } finally {
      setRescoring((prev) => { const n = new Set(prev); n.delete(id); return n })
    }
  }, [])

  const rescoreAll = useCallback(async () => {
    if (backfilling) return
    const unscored = photos.filter((p) => p.file_type === 'image' && p.quality_score == null)
    if (!unscored.length) return
    setBackfilling(true)
    setBackfillProgress({ processed: 0, total: unscored.length })
    try {
      const res = await fetch('/api/tag/backfill', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}',
      })
      if (res.ok) {
        const json = await res.json() as { processed: number; scores: { id: string; score: number }[] }
        setPhotos((prev) => {
          const scoreMap = Object.fromEntries(json.scores.map((s) => [s.id, s.score]))
          return prev.map((p) => p.id in scoreMap ? { ...p, quality_score: scoreMap[p.id] } : p)
        })
        setBackfillProgress({ processed: json.processed, total: unscored.length })
      }
    } finally {
      setBackfilling(false)
      setTimeout(() => setBackfillProgress(null), 3000)
    }
  }, [backfilling, photos])

  // ── Duplicates ────────────────────────────────────────────────────────────────

  const handleFindDupes = useCallback(async () => {
    if (findingDupes) return
    setFindingDupes(true)
    try {
      const res = await fetch('/api/queue/duplicates', { method: 'POST' })
      if (res.ok) {
        const json = await res.json() as { groups: DupGroup[] }
        // Only surface groups where 2+ photos are currently visible
        const filteredIds = new Set(filtered.map((p) => p.id))
        const visible = json.groups.filter(
          (g) => g.ids.filter((id) => filteredIds.has(id)).length >= 2
        )
        setDupGroups(visible)
      }
    } finally {
      setFindingDupes(false)
    }
  }, [findingDupes, filtered])

  const handleAutoResolve = useCallback(async () => {
    if (!dupGroups.length) return
    const groupCount = dupGroups.length
    const trashCount = dupGroups.reduce((sum, g) => sum + g.ids.length - 1, 0)
    const ok = window.confirm(
      `Auto-resolve ${groupCount} duplicate group${groupCount !== 1 ? 's' : ''}?\n\n` +
      `• Approve: ${groupCount} highest-scored photo${groupCount !== 1 ? 's' : ''}\n` +
      `• Reject:  ${trashCount} duplicate${trashCount !== 1 ? 's' : ''}`,
    )
    if (!ok) return
    const keepIds  = dupGroups.map((g) => g.recommended_keep)
    const trashIds = dupGroups.flatMap((g) => g.ids.filter((id) => id !== g.recommended_keep))
    setDupGroups([])
    approve(keepIds)
    reject(trashIds)
  }, [dupGroups, approve, reject])

  function handleReviewManually() {
    const firstId = dupGroups[0]?.ids[0]
    if (!firstId) return
    document.querySelector(`[data-photo-id="${firstId}"]`)
      ?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }

  // ── Selection ─────────────────────────────────────────────────────────────────

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const n = new Set(prev)
      n.has(id) ? n.delete(id) : n.add(id)
      return n
    })
  }

  // ── Keyboard shortcuts ────────────────────────────────────────────────────────

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement).tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return
      if (e.key === 'j' || e.key === 'J') { setFocusedIndex((i) => clampFocus(i + 1)); return }
      if (e.key === 'k' || e.key === 'K') { setFocusedIndex((i) => clampFocus(i - 1)); return }
      const focused = filtered[focusedIndex]
      if (!focused) return
      if (e.key === 'a' || e.key === 'A') approve([focused.id])
      if (e.key === 'r' || e.key === 'R') reject([focused.id])
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [filtered, focusedIndex, approve, reject, clampFocus])

  useEffect(() => {
    setFocusedIndex((i) => clampFocus(i))
  }, [filtered.length, clampFocus])

  const selectedArr = [...selected]

  const ghostBtnStyle: React.CSSProperties = {
    display:      'inline-flex',
    alignItems:   'center',
    gap:          5,
    fontSize:     10,
    color:        'var(--text-secondary)',
    background:   'transparent',
    border:       '0.5px solid var(--surface-3)',
    borderRadius: 2,
    padding:      '3px 9px',
    cursor:       'pointer',
    fontFamily:   'inherit',
    whiteSpace:   'nowrap',
  }

  const selectStyle: React.CSSProperties = {
    background:   'var(--surface-1)',
    border:       'var(--border-rule)',
    borderRadius: 2,
    padding:      '5px 8px',
    fontSize:     11,
    color:        'var(--text-secondary)',
    fontFamily:   'inherit',
    outline:      'none',
    cursor:       'pointer',
  }

  return (
    <div style={{ display: 'flex', alignItems: 'flex-start' }}>
      <Sidebar />

      <main className="main-content" style={{ flex: 1, minWidth: 0, padding: '24px 24px 40px', minHeight: 'calc(100vh - 44px)' }}>

        {/* ── Page header ─────────────────────────────────────────────────── */}
        <div style={{ marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 8 }}>
            <div>
              <div style={{ fontSize: 48, fontWeight: 700, letterSpacing: '-0.04em', color: 'var(--accent)', lineHeight: 1, marginBottom: 4 }}>
                {filtered.length}
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', letterSpacing: '0.02em' }}>
                photos pending review
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, paddingTop: 6 }}>
              {highCount > 0 && (
                <button onClick={bulkApproveHigh} style={{ ...ghostBtnStyle, color: '#1D9E75', borderColor: 'rgba(29,158,117,0.35)' }}>
                  <Check size={10} /> Approve ≥70 ({highCount})
                </button>
              )}
              {lowCount > 0 && (
                <button onClick={bulkRejectLow} style={{ ...ghostBtnStyle, color: '#c0392b', borderColor: 'rgba(192,57,43,0.35)' }}>
                  <X size={10} /> Reject &lt;50 ({lowCount})
                </button>
              )}
              {unscoredCount > 0 && (
                <button onClick={rescoreAll} disabled={backfilling} style={{ ...ghostBtnStyle, cursor: backfilling ? 'not-allowed' : 'pointer', opacity: backfilling ? 0.6 : 1 }}>
                  {backfilling
                    ? <><Loader2 size={10} style={{ animation: 'spin 1s linear infinite' }} /> Scoring…</>
                    : <><RotateCcw size={10} /> Re-score ({unscoredCount})</>
                  }
                </button>
              )}
              {backfillProgress && !backfilling && (
                <span style={{ fontSize: 10, color: 'var(--approved-fg)' }}>✓ {backfillProgress.processed} scored</span>
              )}
            </div>
          </div>

          <ProgressBar approved={approvedCount} pending={photos.length} rejected={rejectedCount} />

          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 8 }}>
            {(['J/K — navigate', 'A — approve', 'R — reject'] as const).map((hint) => (
              <span key={hint} style={{ fontSize: 9, color: 'var(--text-dim)', letterSpacing: '0.07em' }}>{hint}</span>
            ))}
          </div>
        </div>

        {/* ── Filter bar ──────────────────────────────────────────────────── */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>

          <SelectAllBox
            allSelected={allSelected}
            someSelected={someSelected}
            onClick={toggleSelectAll}
          />

          <select value={filterProject} onChange={(e) => setFilterProject(e.target.value)} style={selectStyle}>
            <option value="">All projects</option>
            {events.map((ev) => (
              <option key={ev.id} value={ev.id}>{ev.name}</option>
            ))}
          </select>

          <select value={filterPhotog} onChange={(e) => setFilterPhotog(e.target.value)} style={selectStyle}>
            <option value="">All photographers</option>
            {photographers.map((p) => (
              <option key={p} value={p}>{p}</option>
            ))}
          </select>

          <button
            onClick={handleFindDupes}
            disabled={findingDupes || filtered.length === 0}
            style={{
              ...ghostBtnStyle,
              opacity: findingDupes || filtered.length === 0 ? 0.5 : 1,
              cursor:  findingDupes || filtered.length === 0 ? 'not-allowed' : 'pointer',
            }}
          >
            {findingDupes
              ? <><Loader2 size={10} style={{ animation: 'spin 1s linear infinite' }} /> Scanning…</>
              : <><Copy size={10} /> Find duplicates</>
            }
          </button>

          {dupGroups.length > 0 && (
            <button
              onClick={() => setDupGroups([])}
              style={{ ...ghostBtnStyle, fontSize: 9, color: 'var(--text-dim)' }}
            >
              Clear results
            </button>
          )}
        </div>

        {/* ── Bulk selection bar ──────────────────────────────────────────── */}
        {selected.size > 0 && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 10,
            marginBottom: 12, padding: '8px 12px',
            background: 'var(--surface-2)', border: 'var(--border-rule)', borderRadius: 2,
          }}>
            <span style={{ fontSize: 11, color: 'var(--text-secondary)', flex: 1 }}>
              {selected.size} selected
            </span>
            <button onClick={() => approve(selectedArr)} style={{ fontSize: 11, fontFamily: 'inherit', border: 'none', background: 'none', color: 'var(--approved-fg)', cursor: 'pointer', fontWeight: 500, padding: '4px 8px' }}>
              Approve all
            </button>
            <button onClick={() => reject(selectedArr)} style={{ fontSize: 11, fontFamily: 'inherit', border: 'none', background: 'none', color: 'var(--flagged-fg)', cursor: 'pointer', fontWeight: 500, padding: '4px 8px' }}>
              Reject all
            </button>
            <button onClick={() => setSelected(new Set())} style={{ fontSize: 11, fontFamily: 'inherit', border: 'var(--border-rule)', background: 'transparent', color: 'var(--text-muted)', cursor: 'pointer', borderRadius: 2, padding: '4px 8px' }}>
              Deselect
            </button>
          </div>
        )}

        {/* ── Duplicates banner ───────────────────────────────────────────── */}
        {dupGroups.length > 0 && (
          <div style={{
            display:      'flex',
            alignItems:   'center',
            gap:          10,
            marginBottom: 12,
            padding:      '10px 14px',
            background:   'rgba(184,136,11,0.07)',
            border:       '0.5px solid rgba(184,136,11,0.30)',
            borderRadius: 2,
          }}>
            <span style={{ fontSize: 11, color: '#b8860b', flex: 1 }}>
              {dupGroups.length} duplicate group{dupGroups.length !== 1 ? 's' : ''} found — keeping highest scored in each group
            </span>
            <button
              onClick={handleAutoResolve}
              style={{ ...ghostBtnStyle, color: '#b8860b', borderColor: 'rgba(184,136,11,0.35)', fontSize: 10 }}
            >
              Auto-resolve
            </button>
            <button
              onClick={handleReviewManually}
              style={{ ...ghostBtnStyle, fontSize: 10 }}
            >
              Review manually
            </button>
          </div>
        )}

        {/* ── Photo grid ──────────────────────────────────────────────────── */}
        {filtered.length === 0 ? (
          <div style={{ textAlign: 'center', paddingTop: 80, paddingBottom: 80 }}>
            <div style={{ borderTop: 'var(--border-rule)', marginBottom: 24, marginInline: 'auto', width: 48 }} />
            <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>Queue is clear</p>
            <div style={{ borderBottom: 'var(--border-rule)', marginTop: 24, marginInline: 'auto', width: 48 }} />
          </div>
        ) : (
          <div className="queue-photo-grid" style={{ display: 'grid', gap: 5 }}>
            {filtered.map((photo, i) => (
              <QueueCard
                key={photo.id}
                photo={photo}
                selected={selected.has(photo.id)}
                focused={i === focusedIndex}
                exiting={exiting.has(photo.id)}
                dupInfo={dupPhotoMap.get(photo.id) ?? null}
                isRescoring={rescoring.has(photo.id)}
                onSelect={() => { setFocusedIndex(i); toggleSelect(photo.id) }}
                onApprove={(e) => { e.stopPropagation(); approve([photo.id]) }}
                onReject={(e) => { e.stopPropagation(); reject([photo.id]) }}
                onRescore={(e) => rescoreOne(photo.id, e)}
              />
            ))}
          </div>
          <style>{`
            .queue-photo-grid { grid-template-columns: repeat(5, 1fr); }
            @media (max-width: 767px) {
              .queue-photo-grid { grid-template-columns: repeat(2, 1fr); }
            }
          `}</style>
        )}
      </main>
    </div>
  )
}
