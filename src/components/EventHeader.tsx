'use client'

import { useState, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Pencil, Check, X, Loader2 } from 'lucide-react'
import type { Event } from '@/types'
import type { UserRole } from '@/lib/auth'

interface Props {
  event: Event
  photoCount: number
  role: UserRole
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-GB', {
    day: 'numeric', month: 'long', year: 'numeric',
  })
}

// ─── Inline editable field ────────────────────────────────────────────────────

function InlineField({
  value,
  placeholder,
  type = 'text',
  onSave,
  children,
}: {
  value: string | null
  placeholder: string
  type?: 'text' | 'date'
  onSave: (v: string | null) => Promise<void>
  children: React.ReactNode
}) {
  const [editing, setEditing]   = useState(false)
  const [draft, setDraft]       = useState('')
  const [saving, setSaving]     = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  function startEdit() {
    setDraft(value ?? '')
    setEditing(true)
  }

  useEffect(() => {
    if (editing) inputRef.current?.focus()
  }, [editing])

  async function save() {
    if (saving) return
    const trimmed = draft.trim()
    const next    = trimmed === '' ? null : trimmed
    if (next === value) { setEditing(false); return }
    setSaving(true)
    try {
      await onSave(next)
    } finally {
      setSaving(false)
      setEditing(false)
    }
  }

  function cancel() {
    setEditing(false)
    setDraft('')
  }

  function onKey(e: React.KeyboardEvent) {
    if (e.key === 'Enter') save()
    if (e.key === 'Escape') cancel()
  }

  if (!editing) {
    return (
      <button
        onClick={startEdit}
        title={`Edit ${placeholder}`}
        className="group"
        style={{
          display:    'inline-flex',
          alignItems: 'center',
          gap:        5,
          color:      'var(--text-muted)',
          background: 'none',
          border:     'none',
          padding:    0,
          cursor:     'pointer',
          fontFamily: 'inherit',
          fontSize:   'inherit',
        }}
      >
        {children}
        <Pencil size={9} className="opacity-0 group-hover:opacity-60 transition-opacity" />
      </button>
    )
  }

  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
      <input
        ref={inputRef}
        type={type}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={onKey}
        placeholder={placeholder}
        style={{
          background:   'var(--surface-1)',
          border:       'var(--border-rule)',
          borderRadius: 2,
          padding:      '3px 8px',
          color:        'var(--text-primary)',
          fontSize:     11,
          outline:      'none',
          fontFamily:   'inherit',
          width:        '11rem',
        }}
      />
      {saving ? (
        <Loader2 size={12} style={{ color: 'var(--text-muted)', animation: 'spin 1s linear infinite' }} />
      ) : (
        <>
          <button onClick={save}   style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--approved-fg)', padding: 0, display: 'flex' }}><Check  size={12} /></button>
          <button onClick={cancel} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 0, display: 'flex' }}><X      size={12} /></button>
        </>
      )}
    </span>
  )
}

// ─── EventHeader ──────────────────────────────────────────────────────────────

export default function EventHeader({ event, photoCount, role }: Props) {
  const router = useRouter()

  async function patchField(field: string, value: string | null) {
    await fetch(`/api/projects/${event.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ [field]: value }),
    })
    router.refresh()
  }

  return (
    <div style={{ marginBottom: 24 }}>
      <h1 style={{ fontSize: 28, fontWeight: 700, letterSpacing: '-0.03em', color: 'var(--text-primary)', marginBottom: 10, marginTop: 0 }}>
        {event.name}
      </h1>

      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 16, fontSize: 11, color: 'var(--text-muted)' }}>

        {/* Date — editable */}
        <InlineField
          value={event.date?.slice(0, 10) ?? null}
          placeholder="Event date"
          type="date"
          onSave={(v) => patchField('date', v ?? event.date)}
        >
          {formatDate(event.date)}
        </InlineField>

        {/* Venue — editable */}
        <InlineField
          value={event.venue}
          placeholder="Venue"
          onSave={(v) => patchField('venue', v)}
        >
          {event.venue ?? <span style={{ color: 'var(--text-dim)', fontStyle: 'italic' }}>Add venue</span>}
        </InlineField>

        {/* Location — editable */}
        <InlineField
          value={event.location}
          placeholder="Location / city"
          onSave={(v) => patchField('location', v)}
        >
          {event.location ?? <span style={{ color: 'var(--text-dim)', fontStyle: 'italic' }}>Add location</span>}
        </InlineField>

        {/* Photo count — read-only */}
        <span style={{ color: 'var(--text-muted)' }}>
          {photoCount} photo{photoCount !== 1 ? 's' : ''}
        </span>
      </div>

      {event.description && (
        <p style={{ color: 'var(--text-secondary)', fontSize: 12, marginTop: 8, maxWidth: '42rem' }}>
          {event.description}
        </p>
      )}
    </div>
  )
}
