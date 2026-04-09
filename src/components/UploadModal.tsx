'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { UploadCloud, User } from 'lucide-react'
import type { Folder } from '@/types'

function fmt(bytes: number): string {
  if (bytes < 1_048_576) return `${(bytes / 1_024).toFixed(0)} KB`
  return `${(bytes / 1_048_576).toFixed(1)} MB`
}

// ─── Photographer autocomplete ────────────────────────────────────────────────

interface PhotographerHit { id: string; name: string }

function PhotographerAutocomplete({
  value,
  onChange,
}: {
  value: string
  onChange: (v: string) => void
}) {
  const [suggestions, setSuggestions] = useState<PhotographerHit[]>([])
  const [open, setOpen]               = useState(false)
  const [hi, setHi]                   = useState(-1)
  const inputRef  = useRef<HTMLInputElement>(null)
  const panelRef  = useRef<HTMLDivElement>(null)
  const timerRef  = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current)
    const q = value.trim()
    if (!q) { setSuggestions([]); setOpen(false); return }
    timerRef.current = setTimeout(async () => {
      try {
        const res  = await fetch(`/api/photographers?q=${encodeURIComponent(q)}`)
        const json = await res.json() as { photographers?: PhotographerHit[] }
        const list = json.photographers ?? []
        setSuggestions(list)
        setOpen(list.length > 0)
        setHi(-1)
      } catch { setSuggestions([]) }
    }, 200)
  }, [value])

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

  function pick(name: string) { onChange(name); setOpen(false); setSuggestions([]) }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown') { e.preventDefault(); setHi((h) => Math.min(h + 1, suggestions.length - 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setHi((h) => Math.max(h - 1, -1)) }
    else if (e.key === 'Enter' && hi >= 0 && suggestions[hi]) { e.preventDefault(); pick(suggestions[hi].name) }
    else if (e.key === 'Escape') setOpen(false)
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
        placeholder="Type to search photographers…"
        autoComplete="off"
        style={{
          width: '100%', background: 'var(--surface-1)', border: 'var(--border-rule)',
          borderRadius: 2, padding: '8px 10px', fontSize: 13, color: 'var(--text-primary)',
          fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box',
        }}
      />
      {open && suggestions.length > 0 && (
        <div
          ref={panelRef}
          style={{
            position: 'absolute', top: '100%', left: 0, right: 0, marginTop: 4,
            background: 'var(--surface-0)', border: 'var(--border-rule)',
            borderRadius: 4, overflow: 'hidden', zIndex: 60,
            boxShadow: '0 4px 16px rgba(0,0,0,0.12)',
          }}
        >
          {suggestions.map((p, i) => (
            <button
              key={p.id}
              type="button"
              onMouseDown={(e) => { e.preventDefault(); pick(p.name) }}
              style={{
                width: '100%', display: 'flex', alignItems: 'center', gap: 8,
                padding: '8px 10px', fontSize: 13, textAlign: 'left',
                background: i === hi ? 'var(--surface-2)' : 'transparent',
                color: 'var(--text-primary)', border: 'none', cursor: 'pointer', fontFamily: 'inherit',
              }}
              onMouseEnter={() => setHi(i)}
              onMouseLeave={() => setHi(-1)}
            >
              <User size={12} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
              {p.name}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Modal ────────────────────────────────────────────────────────────────────

interface Props {
  files:            File[]
  photographers:    string[]
  folders:          Folder[]
  onStart:          (photographer: string | null, folderId: string | null) => void
  onSkip:           () => void
  onCreateFolder:   (name: string) => Promise<Folder>
}

export default function UploadModal({ files, photographers, folders, onStart, onSkip, onCreateFolder }: Props) {
  const totalBytes = files.reduce((s, f) => s + f.size, 0)

  // Pre-select if exactly one project photographer
  const [selected, setSelected] = useState<string | null>(
    photographers.length === 1 ? photographers[0] : null
  )
  const [customName, setCustomName] = useState('')
  const [showCustom, setShowCustom] = useState(photographers.length === 0)

  // Pre-select first folder if folders exist
  const [folderId, setFolderId] = useState<string | null>(
    folders.length > 0 ? folders[0].id : null
  )
  const [localFolders, setLocalFolders] = useState<Folder[]>(folders)

  // Folder creation state
  const [creatingFolder, setCreatingFolder] = useState(false)
  const [draftFolder, setDraftFolder]       = useState('')
  const [savingFolder, setSavingFolder]     = useState(false)
  const folderInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (creatingFolder) folderInputRef.current?.focus()
  }, [creatingFolder])

  async function submitFolder() {
    const name = draftFolder.trim()
    if (!name || savingFolder) return
    setSavingFolder(true)
    try {
      const folder = await onCreateFolder(name)
      setLocalFolders((prev) => [...prev, folder])
      setFolderId(folder.id)
    } finally {
      setSavingFolder(false)
      setDraftFolder('')
      setCreatingFolder(false)
    }
  }

  // Escape key
  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onSkip() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onSkip])

  const resolvedPhotographer = showCustom
    ? (customName.trim() || null)
    : selected

  const handleStart = useCallback(() => {
    onStart(resolvedPhotographer, folderId)
  }, [resolvedPhotographer, folderId, onStart])

  return createPortal(
    <div
      onClick={onSkip}
      style={{
        position: 'fixed', inset: 0, zIndex: 9999,
        background: 'var(--overlay-bg)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '0 16px',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: 'var(--surface-0)', border: 'var(--border-rule)',
          borderRadius: 6, padding: '28px 28px 24px',
          width: 440, maxWidth: '100%', maxHeight: '90vh', overflowY: 'auto',
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 20 }}>
          <div style={{
            width: 36, height: 36, borderRadius: 4, background: 'var(--surface-2)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
          }}>
            <UploadCloud size={18} style={{ color: 'var(--text-secondary)' }} />
          </div>
          <div>
            <h2 style={{ margin: 0, fontSize: 15, fontWeight: 600, color: 'var(--text-primary)', letterSpacing: '-0.02em' }}>
              Who shot {files.length === 1 ? 'this photo' : `these ${files.length} photos`}?
            </h2>
            <p style={{ margin: '3px 0 0', fontSize: 12, color: 'var(--text-muted)' }}>
              {files.length} file{files.length !== 1 ? 's' : ''} ready to upload · {fmt(totalBytes)}
            </p>
          </div>
        </div>

        {/* Photographer section */}
        <div style={{ marginBottom: 20 }}>
          <p style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 8, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            Photographer
          </p>

          {/* Project photographer quick-pick pills */}
          {photographers.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: showCustom ? 10 : 0 }}>
              {photographers.map((name) => {
                const active = !showCustom && selected === name
                return (
                  <button
                    key={name}
                    type="button"
                    onClick={() => { setSelected(name); setShowCustom(false); setCustomName('') }}
                    style={{
                      padding: '6px 12px', fontSize: 12, borderRadius: 99, border: 'var(--border-rule)',
                      background: active ? 'var(--accent)' : 'var(--surface-1)',
                      color: active ? '#fff' : 'var(--text-primary)',
                      cursor: 'pointer', fontFamily: 'inherit', transition: 'background 0.12s',
                    }}
                  >
                    {name}
                  </button>
                )
              })}
              <button
                type="button"
                onClick={() => { setSelected(null); setShowCustom(false); setCustomName('') }}
                style={{
                  padding: '6px 12px', fontSize: 12, borderRadius: 99, border: 'var(--border-rule)',
                  background: !showCustom && selected === null ? 'var(--surface-3)' : 'transparent',
                  color: !showCustom && selected === null ? 'var(--text-primary)' : 'var(--text-muted)',
                  cursor: 'pointer', fontFamily: 'inherit', transition: 'background 0.12s',
                }}
              >
                Unassigned
              </button>
              <button
                type="button"
                onClick={() => { setShowCustom(true); setSelected(null) }}
                style={{
                  padding: '6px 12px', fontSize: 12, borderRadius: 99, border: 'var(--border-rule)',
                  background: showCustom ? 'var(--surface-2)' : 'transparent',
                  color: showCustom ? 'var(--text-primary)' : 'var(--text-muted)',
                  cursor: 'pointer', fontFamily: 'inherit', borderStyle: 'dashed', transition: 'background 0.12s',
                }}
              >
                Other…
              </button>
            </div>
          )}

          {/* Autocomplete input (when no project photographers, or "Other" clicked) */}
          {showCustom && (
            <PhotographerAutocomplete value={customName} onChange={setCustomName} />
          )}

          {/* Just "Unassigned" if no project photographers */}
          {photographers.length === 0 && !showCustom && (
            <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0 }}>
              No photographers assigned to this project.{' '}
              <button
                type="button"
                onClick={() => setShowCustom(true)}
                style={{ background: 'none', border: 'none', color: 'var(--accent)', cursor: 'pointer', fontFamily: 'inherit', fontSize: 12, padding: 0 }}
              >
                Assign one
              </button>
            </p>
          )}
        </div>

        {/* Folder / session selector */}
        {localFolders.length > 0 && (
          <div style={{ marginBottom: 20 }}>
            <p style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 8, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              Uploading to
            </p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {localFolders.map((folder) => {
                const active = folderId === folder.id
                return (
                  <button
                    key={folder.id}
                    type="button"
                    onClick={() => setFolderId(folder.id)}
                    style={{
                      padding: '6px 12px', fontSize: 12, borderRadius: 99, border: 'var(--border-rule)',
                      background: active ? 'var(--accent)' : 'var(--surface-1)',
                      color: active ? '#fff' : 'var(--text-primary)',
                      cursor: 'pointer', fontFamily: 'inherit', transition: 'background 0.12s',
                    }}
                  >
                    {folder.name.replace(/\s*·.*$/, '')}
                  </button>
                )
              })}

              {/* Inline new folder */}
              {creatingFolder ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <input
                    ref={folderInputRef}
                    value={draftFolder}
                    onChange={(e) => setDraftFolder(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter')  submitFolder()
                      if (e.key === 'Escape') { setCreatingFolder(false); setDraftFolder('') }
                    }}
                    placeholder="Folder name…"
                    style={{
                      background: 'var(--surface-1)', border: 'var(--border-rule)', borderRadius: 99,
                      padding: '5px 10px', fontSize: 12, color: 'var(--text-primary)',
                      width: 120, outline: 'none', fontFamily: 'inherit',
                    }}
                  />
                  <button
                    type="button"
                    onClick={submitFolder}
                    disabled={savingFolder || !draftFolder.trim()}
                    style={{ background: 'none', border: 'none', color: 'var(--accent)', cursor: 'pointer', fontSize: 11, padding: '0 2px' }}
                  >
                    {savingFolder ? '…' : '✓'}
                  </button>
                  <button
                    type="button"
                    onClick={() => { setCreatingFolder(false); setDraftFolder('') }}
                    style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 11, padding: '0 2px' }}
                  >
                    ✕
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setCreatingFolder(true)}
                  style={{
                    padding: '6px 12px', fontSize: 12, borderRadius: 99, border: 'var(--border-rule)',
                    background: 'transparent', color: 'var(--text-muted)', cursor: 'pointer',
                    fontFamily: 'inherit', borderStyle: 'dashed',
                  }}
                >
                  + New folder
                </button>
              )}
            </div>
          </div>
        )}

        {/* CTAs */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <button
            type="button"
            onClick={handleStart}
            style={{
              width: '100%', padding: '10px', fontSize: 13, fontWeight: 500,
              background: 'var(--accent)', color: '#fff',
              border: 'none', borderRadius: 3, cursor: 'pointer',
              fontFamily: 'inherit', letterSpacing: '-0.01em',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
            }}
          >
            <UploadCloud size={14} />
            Start Upload
          </button>
          <button
            type="button"
            onClick={onSkip}
            style={{
              width: '100%', padding: '8px', fontSize: 12,
              background: 'transparent', color: 'var(--text-muted)',
              border: 'none', borderRadius: 3, cursor: 'pointer',
              fontFamily: 'inherit',
            }}
          >
            Skip — upload without assigning
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}
