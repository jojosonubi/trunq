'use client'

import { useState, useRef, useEffect } from 'react'

interface Suggestion {
  id: string
  name: string
}

interface Props {
  value: string
  onChange: (v: string) => void
  placeholder?: string
  apiPath: string       // e.g. '/api/venues'
  responseKey: string   // e.g. 'venues'
}

export default function TextAutocomplete({ value, onChange, placeholder, apiPath, responseKey }: Props) {
  const [suggestions, setSuggestions] = useState<Suggestion[]>([])
  const [open, setOpen]               = useState(false)
  const [highlighted, setHighlighted] = useState(-1)
  const inputRef  = useRef<HTMLInputElement>(null)
  const panelRef  = useRef<HTMLDivElement>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    const q = value.trim()
    if (!q) { setSuggestions([]); setOpen(false); return }

    debounceRef.current = setTimeout(async () => {
      try {
        const res  = await fetch(`${apiPath}?q=${encodeURIComponent(q)}`)
        const json = await res.json() as Record<string, Suggestion[]>
        const list = json[responseKey] ?? []
        setSuggestions(list)
        setOpen(list.length > 0)
        setHighlighted(-1)
      } catch {
        setSuggestions([])
      }
    }, 200)
  }, [value, apiPath, responseKey])

  // Close on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (
        inputRef.current && !inputRef.current.contains(e.target as Node) &&
        panelRef.current && !panelRef.current.contains(e.target as Node)
      ) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  function pick(name: string) {
    onChange(name)
    setOpen(false)
    setSuggestions([])
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setHighlighted((h) => Math.min(h + 1, suggestions.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setHighlighted((h) => Math.max(h - 1, -1))
    } else if (e.key === 'Enter') {
      if (highlighted >= 0 && suggestions[highlighted]) {
        e.preventDefault()
        pick(suggestions[highlighted].name)
      }
    } else if (e.key === 'Escape') {
      setOpen(false)
    }
  }

  return (
    <div style={{ position: 'relative' }}>
      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={handleKeyDown}
        onFocus={() => { if (suggestions.length > 0) setOpen(true) }}
        placeholder={placeholder}
        autoComplete="off"
        className="form-input"
      />
      {open && suggestions.length > 0 && (
        <div
          ref={panelRef}
          style={{
            position:     'absolute',
            top:          '100%',
            left:         0,
            right:        0,
            marginTop:    4,
            background:   'var(--surface-0)',
            border:       'var(--border-rule)',
            borderRadius: 4,
            overflow:     'hidden',
            zIndex:       30,
            boxShadow:    '0 4px 16px rgba(0,0,0,0.12)',
          }}
        >
          {suggestions.map((s, i) => (
            <button
              key={s.id}
              type="button"
              onMouseDown={(e) => { e.preventDefault(); pick(s.name) }}
              style={{
                width:      '100%',
                display:    'block',
                textAlign:  'left',
                padding:    '7px 10px',
                fontSize:   13,
                background: i === highlighted ? 'var(--surface-2)' : 'transparent',
                color:      'var(--text-primary)',
                border:     'none',
                cursor:     'pointer',
                fontFamily: 'inherit',
              }}
              onMouseEnter={() => setHighlighted(i)}
              onMouseLeave={() => setHighlighted(-1)}
            >
              {s.name}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
