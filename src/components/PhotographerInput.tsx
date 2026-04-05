'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { Plus, X, User } from 'lucide-react'
import clsx from 'clsx'
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
              className="inline-flex items-center gap-1.5 bg-[#1a1a1a] border border-[#2a2a2a] text-white text-xs px-2.5 py-1 rounded-full"
            >
              <User size={10} className="text-[#555]" />
              {name}
              <button
                type="button"
                onClick={() => remove(name)}
                className="text-[#555] hover:text-white transition-colors"
                aria-label={`Remove ${name}`}
              >
                <X size={11} />
              </button>
            </span>
          ))}
        </div>
      )}

      {/* Input + dropdown */}
      <div className="relative flex gap-2">
        <div className="relative flex-1">
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            onFocus={() => { if (suggestions.length > 0) setOpen(true) }}
            placeholder="Add photographer name…"
            autoComplete="off"
            className="w-full bg-[#111111] border border-[#1f1f1f] rounded px-3 py-2.5 text-white text-sm placeholder-[#555] focus:outline-none focus:border-[#444] transition-colors"
          />

          {/* Autocomplete dropdown */}
          {open && suggestions.length > 0 && (
            <div
              ref={panelRef}
              className="absolute top-full left-0 right-0 mt-1 bg-[#111111] border border-[#2a2a2a] rounded-lg overflow-hidden z-20 shadow-2xl"
            >
              {suggestions.map((p, i) => (
                <button
                  key={p.id}
                  type="button"
                  onMouseDown={(e) => { e.preventDefault(); commit(p.name) }}
                  className={clsx(
                    'w-full flex items-center gap-2.5 px-3 py-2 text-sm text-left transition-colors',
                    i === highlighted
                      ? 'bg-white/8 text-white'
                      : 'text-[#888] hover:bg-white/5 hover:text-white'
                  )}
                >
                  <User size={12} className="text-[#555] shrink-0" />
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
          className="px-3 py-2.5 bg-[#1a1a1a] border border-[#2a2a2a] text-[#888] hover:text-white hover:border-[#444] rounded text-sm transition-colors disabled:opacity-30"
          aria-label="Add photographer"
        >
          <Plus size={15} />
        </button>
      </div>
      <p className="text-[#444] text-xs mt-1.5">Press Enter or + to add. Existing names autocomplete.</p>
    </div>
  )
}
