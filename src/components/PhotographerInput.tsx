'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { Plus, X, User } from 'lucide-react'
import type { Photographer } from '@/types'

interface Props {
  value: string[]
  onChange: (names: string[]) => void
  /** Called when a photographer is committed (after DB upsert + optional folder creation) */
  onAdd?: (name: string) => void
}

export default function PhotographerInput({ value: photographers, onChange, onAdd }: Props) {
  const [input, setInput]           = useState('')
  const [suggestions, setSuggestions] = useState<Photographer[]>([])
  const [open, setOpen]             = useState(false)
  const [highlighted, setHighlighted] = useState(-1)
  const inputRef  = useRef<HTMLInputElement>(null)
  const panelRef  = useRef<HTMLDivElement>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Fetch suggestions on input change
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    const q = input.trim()
    if (!q) { setSuggestions([]); setOpen(false); return }

    debounceRef.current = setTimeout(async () => {
      try {
        const res  = await fetch(`/api/photographers?q=${encodeURIComponent(q)}`)
        const json = await res.json() as { photographers?: Photographer[] }
        setSuggestions(json.photographers ?? [])
        setOpen(true)
        setHighlighted(-1)
      } catch {
        setSuggestions([])
      }
    }, 200)
  }, [input])

  // Close on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (
        inputRef.current && !inputRef.current.contains(e.target as Node) &&
        panelRef.current && !panelRef.current.contains(e.target as Node)
      ) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const commit = useCallback((name: string) => {
    const trimmed = name.trim()
    if (!trimmed) return
    if (photographers.some((p) => p.toLowerCase() === trimmed.toLowerCase())) {
      setInput('')
      setOpen(false)
      return
    }
    onChange([...photographers, trimmed])
    onAdd?.(trimmed)
    setInput('')
    setSuggestions([])
    setOpen(false)
    setHighlighted(-1)
    inputRef.current?.focus()
  }, [photographers, onChange, onAdd])

  function remove(name: string) {
    onChange(photographers.filter((p) => p !== name))
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setHighlighted((h) => Math.min(h + 1, suggestions.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setHighlighted((h) => Math.max(h - 1, -1))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (highlighted >= 0 && suggestions[highlighted]) {
        commit(suggestions[highlighted].name)
      } else {
        commit(input)
      }
    } else if (e.key === 'Escape') {
      setOpen(false)
      setHighlighted(-1)
    }
  }

  return (
    <div>
      {/* Chips */}
      {photographers.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-2">
          {photographers.map((name) => (
            <span
              key={name}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                background: 'var(--surface-2)', border: 'var(--border-rule)',
                color: 'var(--text-primary)', fontSize: 11, padding: '3px 8px', borderRadius: 99,
              }}
            >
              <User size={10} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
              {name}
              <button
                type="button"
                onClick={() => remove(name)}
                style={{ color: 'var(--text-muted)', background: 'none', border: 'none', cursor: 'pointer', display: 'flex', padding: 0 }}
                aria-label={`Remove ${name}`}
              >
                <X size={11} />
              </button>
            </span>
          ))}
        </div>
      )}

      {/* Input + dropdown */}
      <div style={{ position: 'relative', display: 'flex', gap: 8 }}>
        <div style={{ position: 'relative', flex: 1 }}>
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            onFocus={() => { if (suggestions.length > 0) setOpen(true) }}
            placeholder="Add photographer name…"
            autoComplete="off"
            className="form-input"
          />

          {/* Autocomplete dropdown */}
          {open && suggestions.length > 0 && (
            <div
              ref={panelRef}
              style={{
                position: 'absolute', top: '100%', left: 0, right: 0, marginTop: 4,
                background: 'var(--surface-0)', border: 'var(--border-rule)', borderRadius: 4,
                overflow: 'hidden', zIndex: 30, boxShadow: '0 4px 16px rgba(0,0,0,0.12)',
              }}
            >
              {suggestions.map((p, i) => (
                <button
                  key={p.id}
                  type="button"
                  onMouseDown={(e) => { e.preventDefault(); commit(p.name) }}
                  style={{
                    width: '100%', display: 'flex', alignItems: 'center', gap: 8,
                    padding: '7px 10px', fontSize: 13, textAlign: 'left',
                    background: i === highlighted ? 'var(--surface-2)' : 'transparent',
                    color: 'var(--text-primary)', border: 'none', cursor: 'pointer', fontFamily: 'inherit',
                  }}
                  onMouseEnter={() => setHighlighted(i)}
                  onMouseLeave={() => setHighlighted(-1)}
                >
                  <User size={12} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
                  {p.name}
                </button>
              ))}
            </div>
          )}
        </div>

        <button
          type="button"
          onClick={() => commit(input)}
          disabled={!input.trim()}
          style={{
            padding: '0 12px', background: 'var(--surface-1)', border: 'var(--border-rule)',
            color: 'var(--text-muted)', borderRadius: 2, cursor: 'pointer', display: 'flex',
            alignItems: 'center', opacity: input.trim() ? 1 : 0.3, fontFamily: 'inherit',
          }}
          aria-label="Add photographer"
        >
          <Plus size={15} />
        </button>
      </div>
      <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 6, marginBottom: 0 }}>
        Press Enter or + to add. Existing names autocomplete.
      </p>
    </div>
  )
}
