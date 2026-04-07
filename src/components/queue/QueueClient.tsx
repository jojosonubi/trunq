'use client'

import { useState, useEffect, useCallback } from 'react'
import Image from 'next/image'
import { Check, X } from 'lucide-react'
import Sidebar from '@/components/layout/Sidebar'
import { transformUrl } from '@/lib/supabase/storage'
import type { MediaFile } from '@/types'

// ─── Types ────────────────────────────────────────────────────────────────────

type QueuePhoto = MediaFile & {
  signed_url?: string
  events: { id: string; name: string; date: string; photographers: string[] } | null
}

interface Props {
  initialPhotos: QueuePhoto[]
  events:        { id: string; name: string }[]
  role:          string
}

// ─── API call ─────────────────────────────────────────────────────────────────

async function setStatus(ids: string[], status: 'approved' | 'rejected') {
  await fetch('/api/review', {
    method:  'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ ids, status }),
  })
}

// ─── Photo card ───────────────────────────────────────────────────────────────

function QueueCard({
  photo, selected, focused,
  onSelect, onApprove, onReject,
}: {
  photo:     QueuePhoto
  selected:  boolean
  focused:   boolean
  onSelect:  () => void
  onApprove: (e: React.MouseEvent) => void
  onReject:  (e: React.MouseEvent) => void
}) {
  const src = transformUrl(photo.signed_url ?? photo.public_url, 400)

  return (
    <div
      className="group relative"
      style={{
        aspectRatio:  '4/3',
        overflow:     'hidden',
        borderRadius: 2,
        cursor:       'pointer',
        border:       selected
          ? '1.5px solid var(--accent)'
          : focused
          ? '1.5px solid var(--text-dim)'
          : '1.5px solid transparent',
        background: 'var(--surface-2)',
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

      {/* Hover overlay */}
      <div
        className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity"
        style={{ background: 'rgba(0,0,0,0.35)' }}
      >
        {/* Checkbox top-left */}
        <div style={{
          position:     'absolute',
          top:          6,
          left:         6,
          width:        16,
          height:       16,
          borderRadius: 2,
          border:       '1.5px solid rgba(255,255,255,0.7)',
          background:   selected ? 'var(--accent)' : 'rgba(0,0,0,0.4)',
          display:      'flex',
          alignItems:   'center',
          justifyContent: 'center',
        }}>
          {selected && <Check size={10} color="#fff" />}
        </div>

        {/* Approve / reject buttons bottom */}
        <div style={{
          position:   'absolute',
          bottom:     6,
          right:      6,
          display:    'flex',
          gap:        4,
        }}>
          <button
            onClick={onApprove}
            title="Approve"
            style={{
              width:          26,
              height:         26,
              borderRadius:   2,
              border:         'none',
              background:     'rgba(0,0,0,0.6)',
              color:          'var(--approved-fg)',
              display:        'flex',
              alignItems:     'center',
              justifyContent: 'center',
              cursor:         'pointer',
            }}
          >
            <Check size={12} />
          </button>
          <button
            onClick={onReject}
            title="Reject"
            style={{
              width:          26,
              height:         26,
              borderRadius:   2,
              border:         'none',
              background:     'rgba(0,0,0,0.6)',
              color:          'var(--flagged-fg)',
              display:        'flex',
              alignItems:     'center',
              justifyContent: 'center',
              cursor:         'pointer',
            }}
          >
            <X size={12} />
          </button>
        </div>
      </div>

      {/* Selected checkmark overlay */}
      {selected && (
        <div style={{
          position:       'absolute',
          top:            6,
          left:           6,
          width:          16,
          height:         16,
          borderRadius:   2,
          background:     'var(--accent)',
          display:        'flex',
          alignItems:     'center',
          justifyContent: 'center',
        }}>
          <Check size={10} color="#fff" />
        </div>
      )}
    </div>
  )
}

// ─── QueueClient ──────────────────────────────────────────────────────────────

export default function QueueClient({ initialPhotos, events }: Props) {
  const [photos,        setPhotos]        = useState<QueuePhoto[]>(initialPhotos)
  const [selected,      setSelected]      = useState<Set<string>>(new Set())
  const [filterProject, setFilterProject] = useState('')
  const [filterPhotog,  setFilterPhotog]  = useState('')
  const [focusedIndex,  setFocusedIndex]  = useState(0)

  // Unique photographers from photos
  const photographers = [...new Set(
    photos.map((p) => p.photographer).filter((p): p is string => !!p)
  )].sort()

  // Filtered list
  const filtered = photos.filter((p) => {
    if (filterProject && p.event_id !== filterProject) return false
    if (filterPhotog  && p.photographer !== filterPhotog)  return false
    return true
  })

  const clampFocus = (i: number) => Math.max(0, Math.min(i, filtered.length - 1))

  // ── Actions ──────────────────────────────────────────────────────────────────

  const approve = useCallback(async (ids: string[]) => {
    await setStatus(ids, 'approved')
    setPhotos((prev) => prev.filter((p) => !ids.includes(p.id)))
    setSelected((prev) => { const n = new Set(prev); ids.forEach((id) => n.delete(id)); return n })
  }, [])

  const reject = useCallback(async (ids: string[]) => {
    await setStatus(ids, 'rejected')
    setPhotos((prev) => prev.filter((p) => !ids.includes(p.id)))
    setSelected((prev) => { const n = new Set(prev); ids.forEach((id) => n.delete(id)); return n })
  }, [])

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

      if (e.key === 'j' || e.key === 'J') {
        setFocusedIndex((i) => clampFocus(i + 1))
        return
      }
      if (e.key === 'k' || e.key === 'K') {
        setFocusedIndex((i) => clampFocus(i - 1))
        return
      }
      const focused = filtered[focusedIndex]
      if (!focused) return
      if (e.key === 'a' || e.key === 'A') approve([focused.id])
      if (e.key === 'r' || e.key === 'R') reject([focused.id])
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [filtered, focusedIndex, approve, reject])

  // Keep focus in bounds when list shrinks
  useEffect(() => {
    setFocusedIndex((i) => clampFocus(i))
  }, [filtered.length])

  const selectedArr = [...selected]

  const selectStyle = {
    background:  'var(--surface-1)',
    border:      'var(--border-rule)',
    borderRadius: 2,
    padding:     '5px 8px',
    fontSize:    11,
    color:       'var(--text-secondary)',
    fontFamily:  'inherit',
    outline:     'none',
    cursor:      'pointer',
  }

  return (
    <div style={{ display: 'flex', alignItems: 'flex-start' }}>
      <Sidebar />

      <main className="main-content" style={{ flex: 1, minWidth: 0, padding: '20px 24px', minHeight: 'calc(100vh - 44px)' }}>

        {/* ── Header ──────────────────────────────────────────────────────── */}
        <div style={{
          display:        'flex',
          alignItems:     'center',
          justifyContent: 'space-between',
          marginBottom:   12,
          paddingBottom:  8,
          borderBottom:   'var(--border-rule)',
        }}>
          <p style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.14em', color: 'var(--text-muted)' }}>
            Queue
          </p>
          <span style={{
            fontSize:     9,
            fontWeight:   600,
            color:        'var(--text-muted)',
            background:   'var(--surface-2)',
            border:       'var(--border-rule)',
            borderRadius: 8,
            padding:      '2px 7px',
            letterSpacing: '0.04em',
          }}>
            {filtered.length} pending
          </span>
        </div>

        {/* ── Filter bar ──────────────────────────────────────────────────── */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
          <select
            value={filterProject}
            onChange={(e) => setFilterProject(e.target.value)}
            style={selectStyle}
          >
            <option value="">All projects</option>
            {events.map((ev) => (
              <option key={ev.id} value={ev.id}>{ev.name}</option>
            ))}
          </select>

          <select
            value={filterPhotog}
            onChange={(e) => setFilterPhotog(e.target.value)}
            style={selectStyle}
          >
            <option value="">All photographers</option>
            {photographers.map((p) => (
              <option key={p} value={p}>{p}</option>
            ))}
          </select>
        </div>

        {/* ── Bulk action bar ─────────────────────────────────────────────── */}
        {selected.size > 0 && (
          <div style={{
            display:      'flex',
            alignItems:   'center',
            gap:          10,
            marginBottom: 12,
            padding:      '8px 12px',
            background:   'var(--surface-2)',
            border:       'var(--border-rule)',
            borderRadius: 2,
          }}>
            <span style={{ fontSize: 11, color: 'var(--text-secondary)', flex: 1 }}>
              {selected.size} selected
            </span>
            <button
              onClick={() => approve(selectedArr)}
              style={{ fontSize: 11, fontFamily: 'inherit', border: 'none', background: 'none', color: 'var(--approved-fg)', cursor: 'pointer', fontWeight: 500, padding: '4px 8px' }}
            >
              Approve all
            </button>
            <button
              onClick={() => reject(selectedArr)}
              style={{ fontSize: 11, fontFamily: 'inherit', border: 'none', background: 'none', color: 'var(--flagged-fg)', cursor: 'pointer', fontWeight: 500, padding: '4px 8px' }}
            >
              Reject all
            </button>
            <button
              onClick={() => setSelected(new Set())}
              style={{ fontSize: 11, fontFamily: 'inherit', border: 'var(--border-rule)', background: 'transparent', color: 'var(--text-muted)', cursor: 'pointer', borderRadius: 2, padding: '4px 8px' }}
            >
              Deselect
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
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 5 }}>
            {filtered.map((photo, i) => (
              <QueueCard
                key={photo.id}
                photo={photo}
                selected={selected.has(photo.id)}
                focused={i === focusedIndex}
                onSelect={() => { setFocusedIndex(i); toggleSelect(photo.id) }}
                onApprove={(e) => { e.stopPropagation(); approve([photo.id]) }}
                onReject={(e) => { e.stopPropagation(); reject([photo.id]) }}
              />
            ))}
          </div>
        )}

        {/* ── Keyboard hint ───────────────────────────────────────────────── */}
        {filtered.length > 0 && (
          <p style={{ fontSize: 9, color: 'var(--text-dim)', letterSpacing: '0.08em', marginTop: 16 }}>
            A — approve · R — reject · J/K — navigate
          </p>
        )}
      </main>
    </div>
  )
}
