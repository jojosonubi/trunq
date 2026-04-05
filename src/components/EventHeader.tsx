'use client'

import { useState, useRef, useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Calendar, Building2, MapPin, ImageIcon, Pencil, Check, X, Loader2 } from 'lucide-react'
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
        className="group inline-flex items-center gap-1.5 text-[#888] hover:text-white transition-colors"
        title={`Edit ${placeholder}`}
      >
        {children}
        <Pencil size={10} className="opacity-0 group-hover:opacity-60 transition-opacity" />
      </button>
    )
  }

  return (
    <span className="inline-flex items-center gap-1.5">
      <input
        ref={inputRef}
        type={type}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={onKey}
        placeholder={placeholder}
        className="bg-[#1a1a1a] border border-[#333] rounded px-2 py-0.5 text-white text-sm focus:outline-none focus:border-[#555] w-44"
      />
      {saving ? (
        <Loader2 size={13} className="animate-spin text-[#555]" />
      ) : (
        <>
          <button onClick={save}   className="text-emerald-400 hover:text-emerald-300 transition-colors"><Check  size={13} /></button>
          <button onClick={cancel} className="text-[#555]     hover:text-white          transition-colors"><X      size={13} /></button>
        </>
      )}
    </span>
  )
}

// ─── EventHeader ──────────────────────────────────────────────────────────────

export default function EventHeader({ event, photoCount, role }: Props) {
  const router = useRouter()

  async function patchField(field: string, value: string | null) {
    await fetch(`/api/events/${event.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ [field]: value }),
    })
    router.refresh()
  }

  return (
    <div className="mb-10">
      <h1 className="text-white text-2xl font-semibold mb-3">{event.name}</h1>
      <div className="flex flex-wrap items-center gap-4 text-sm">

        {/* Date — editable */}
        <InlineField
          value={event.date?.slice(0, 10) ?? null}
          placeholder="Event date"
          type="date"
          onSave={(v) => patchField('date', v ?? event.date)}
        >
          <Calendar size={13} className="shrink-0" />
          {formatDate(event.date)}
        </InlineField>

        {/* Venue — editable */}
        <InlineField
          value={event.venue}
          placeholder="Venue"
          onSave={(v) => patchField('venue', v)}
        >
          <Building2 size={13} className="shrink-0" />
          {event.venue ?? <span className="text-[#444] italic">Add venue</span>}
        </InlineField>

        {/* Location — editable */}
        <InlineField
          value={event.location}
          placeholder="Location / city"
          onSave={(v) => patchField('location', v)}
        >
          <MapPin size={13} className="shrink-0" />
          {event.location ?? <span className="text-[#444] italic">Add location</span>}
        </InlineField>

        {/* Photo count — read-only */}
        <span className="inline-flex items-center gap-1.5 text-[#666]">
          <ImageIcon size={13} />
          {photoCount} photo{photoCount !== 1 ? 's' : ''}
        </span>
      </div>

      {event.description && (
        <p className="text-[#888] text-sm mt-3 max-w-2xl">{event.description}</p>
      )}
    </div>
  )
}
