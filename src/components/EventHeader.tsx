'use client'

import { useState, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Pencil, Check, X, Loader2, Copy, Link2 } from 'lucide-react'
import type { Event } from '@/types'
import type { UserRole } from '@/lib/auth'

interface Props {
  event:          Event
  photoCount:     number
  role:           UserRole
  existingToken?: string | null
  eventId?:       string
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

const SEP = <span style={{ color: 'var(--text-dim)', margin: '0 2px' }}>·</span>

export default function EventHeader({ event, photoCount, role, existingToken, eventId }: Props) {
  const router = useRouter()

  const [token, setToken]         = useState<string | null>(existingToken ?? null)
  const [generating, setGenerating] = useState(false)
  const [copied, setCopied]       = useState(false)

  async function patchField(field: string, value: string | null) {
    await fetch(`/api/projects/${event.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ [field]: value }),
    })
    router.refresh()
  }

  async function generateLink() {
    if (!eventId) return
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

  const ghostBtn: React.CSSProperties = {
    display:      'inline-flex',
    alignItems:   'center',
    gap:          4,
    fontSize:     10,
    color:        'var(--text-secondary)',
    background:   'transparent',
    border:       'var(--border-rule)',
    borderRadius: 2,
    padding:      '4px 10px',
    cursor:       'pointer',
    fontFamily:   'inherit',
    letterSpacing: '0.02em',
    flexShrink:   0,
  }

  return (
    <div style={{ marginBottom: 20 }}>
      {/* Back link */}
      <a
        href="/projects"
        style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12, color: 'var(--text-muted)', textDecoration: 'none', marginBottom: 10, opacity: 0.7 }}
        onMouseEnter={e => (e.currentTarget.style.opacity = '1')}
        onMouseLeave={e => (e.currentTarget.style.opacity = '0.7')}
      >
        ← Projects
      </a>

      {/* Title */}
      <h1 style={{ fontSize: 28, fontWeight: 700, letterSpacing: '-0.03em', color: 'var(--text-primary)', margin: '0 0 6px' }}>
        {event.name}
      </h1>

      {/* Meta row + Deliver button */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 4, fontSize: 12, color: 'var(--text-muted)' }}>
        <InlineField
          value={event.date?.slice(0, 10) ?? null}
          placeholder="Event date"
          type="date"
          onSave={(v) => patchField('date', v ?? event.date)}
        >
          {formatDate(event.date)}
        </InlineField>

        {SEP}

        <InlineField
          value={event.venue}
          placeholder="Venue"
          onSave={(v) => patchField('venue', v)}
        >
          {event.venue ?? <span style={{ color: 'var(--text-dim)', fontStyle: 'italic' }}>Add venue</span>}
        </InlineField>

        {SEP}

        <InlineField
          value={event.location}
          placeholder="Location / city"
          onSave={(v) => patchField('location', v)}
        >
          {event.location ?? <span style={{ color: 'var(--text-dim)', fontStyle: 'italic' }}>Add location</span>}
        </InlineField>

        {SEP}

          <span>{photoCount} photo{photoCount !== 1 ? 's' : ''}</span>
        </div>

        {role !== 'photographer' && (
          token ? (
            <button onClick={copyLink} style={{ ...ghostBtn, flexShrink: 0 }}>
              {copied ? <Check size={10} style={{ color: 'var(--approved-fg)' }} /> : <Copy size={10} />}
              {copied ? 'Copied' : 'Copy link'}
            </button>
          ) : (
            <button onClick={generateLink} disabled={generating} style={{ ...ghostBtn, flexShrink: 0, opacity: generating ? 0.5 : 1, cursor: generating ? 'not-allowed' : 'pointer' }}>
              <Link2 size={10} />
              {generating ? 'Generating…' : 'Deliver'}
            </button>
          )
        )}
      </div>

      {event.description && (
        <p style={{ color: 'var(--text-secondary)', fontSize: 12, marginTop: 8, maxWidth: '42rem', margin: '8px 0 0' }}>
          {event.description}
        </p>
      )}
    </div>
  )
}
