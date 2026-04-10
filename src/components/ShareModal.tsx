'use client'

import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { Share2, Copy, Check, X, Eye, EyeOff, Plus, Trash2 } from 'lucide-react'
import type { Folder } from '@/types'

interface Props {
  projectId: string
  folders:   Folder[]
  onClose:   () => void
}

export default function ShareModal({ projectId, folders, onClose }: Props) {
  const [password, setPassword]       = useState('')
  const [showPass, setShowPass]       = useState(false)
  const [label, setLabel]             = useState('')
  const [folderId, setFolderId]       = useState<string | null>(null)
  const [expiresAt, setExpiresAt]     = useState('')
  const [showWatermark, setShowWatermark] = useState(false)
  const [allowlist, setAllowlist]     = useState<string[]>([])
  const [emailDraft, setEmailDraft]   = useState('')
  const [creating, setCreating]       = useState(false)
  const [result, setResult]           = useState<{ url: string } | null>(null)
  const [copied, setCopied]           = useState(false)
  const [error, setError]             = useState('')

  // Escape to close
  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  function addEmail() {
    const email = emailDraft.trim().toLowerCase()
    if (!email || allowlist.includes(email)) return
    setAllowlist((prev) => [...prev, email])
    setEmailDraft('')
  }

  async function create() {
    if (!password || creating) return
    setCreating(true)
    setError('')
    try {
      const res  = await fetch('/api/share', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId,
          folderId:      folderId || null,
          password,
          expiresAt:     expiresAt || null,
          showWatermark,
          allowlist,
          label:         label.trim() || null,
        }),
      })
      const json = await res.json() as { url?: string; error?: string }
      if (!res.ok || !json.url) {
        setError(json.error ?? 'Failed to create link.')
      } else {
        setResult({ url: json.url })
      }
    } finally {
      setCreating(false)
    }
  }

  async function copyUrl() {
    if (!result) return
    await navigator.clipboard.writeText(result.url)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '8px 10px', fontSize: 13,
    background: 'var(--surface-1)', border: 'var(--border-rule)',
    borderRadius: 3, color: 'var(--text-primary)', outline: 'none',
    boxSizing: 'border-box', fontFamily: 'inherit',
  }

  const labelStyle: React.CSSProperties = {
    fontSize: 11, color: 'var(--text-secondary)', fontWeight: 500,
    textTransform: 'uppercase', letterSpacing: '0.06em',
    display: 'block', marginBottom: 6,
  }

  return createPortal(
    <div
      onClick={onClose}
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
          borderRadius: 6, padding: '24px 24px 20px',
          width: 420, maxWidth: '100%', maxHeight: '90vh', overflowY: 'auto',
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              width: 32, height: 32, borderRadius: 4, background: 'var(--surface-2)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <Share2 size={15} style={{ color: 'var(--text-secondary)' }} />
            </div>
            <div>
              <h2 style={{ margin: 0, fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', letterSpacing: '-0.02em' }}>
                Share gallery
              </h2>
              <p style={{ margin: 0, fontSize: 11, color: 'var(--text-muted)' }}>
                Create a password-protected link
              </p>
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex', padding: 4 }}>
            <X size={16} />
          </button>
        </div>

        {result ? (
          // ── Success state ──────────────────────────────────────────────────
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: 0 }}>
              Your share link is ready. Copy it below.
            </p>
            <div style={{
              display: 'flex', alignItems: 'center', gap: 6,
              background: 'var(--surface-1)', border: 'var(--border-rule)',
              borderRadius: 3, padding: '8px 10px',
            }}>
              <span style={{ flex: 1, fontSize: 11, color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {result.url}
              </span>
              <button
                onClick={copyUrl}
                style={{
                  display: 'flex', alignItems: 'center', gap: 5,
                  padding: '5px 10px', fontSize: 11, fontWeight: 500,
                  background: copied ? 'var(--approved-bg)' : 'var(--accent)',
                  color: '#fff', border: 'none', borderRadius: 2,
                  cursor: 'pointer', fontFamily: 'inherit', flexShrink: 0,
                  transition: 'background 0.15s',
                }}
              >
                {copied ? <><Check size={11} /> Copied</> : <><Copy size={11} /> Copy</>}
              </button>
            </div>
            <button
              onClick={onClose}
              style={{
                padding: '8px', fontSize: 12,
                background: 'transparent', color: 'var(--text-muted)',
                border: 'none', borderRadius: 3, cursor: 'pointer',
                fontFamily: 'inherit',
              }}
            >
              Done
            </button>
          </div>
        ) : (
          // ── Form ─────────────────────────────────────────────────────────
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

            {/* Password */}
            <div>
              <label style={labelStyle}>Password *</label>
              <div style={{ position: 'relative' }}>
                <input
                  type={showPass ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Set a password for this link"
                  autoFocus
                  style={{ ...inputStyle, paddingRight: 36 }}
                />
                <button
                  type="button"
                  onClick={() => setShowPass((v) => !v)}
                  style={{
                    position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)',
                    background: 'none', border: 'none', cursor: 'pointer',
                    color: 'var(--text-muted)', display: 'flex', padding: 4,
                  }}
                >
                  {showPass ? <EyeOff size={13} /> : <Eye size={13} />}
                </button>
              </div>
            </div>

            {/* Scope: whole project or a folder */}
            {folders.length > 0 && (
              <div>
                <label style={labelStyle}>Scope</label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  <button
                    type="button"
                    onClick={() => setFolderId(null)}
                    style={{
                      padding: '5px 12px', fontSize: 12, borderRadius: 99, border: 'var(--border-rule)',
                      background: folderId === null ? 'var(--accent)' : 'var(--surface-1)',
                      color: folderId === null ? '#fff' : 'var(--text-primary)',
                      cursor: 'pointer', fontFamily: 'inherit',
                    }}
                  >
                    All photos
                  </button>
                  {folders.map((f) => (
                    <button
                      key={f.id}
                      type="button"
                      onClick={() => setFolderId(f.id)}
                      style={{
                        padding: '5px 12px', fontSize: 12, borderRadius: 99, border: 'var(--border-rule)',
                        background: folderId === f.id ? 'var(--accent)' : 'var(--surface-1)',
                        color: folderId === f.id ? '#fff' : 'var(--text-primary)',
                        cursor: 'pointer', fontFamily: 'inherit',
                      }}
                    >
                      {f.name.replace(/\s*·.*$/, '')}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Label (optional) */}
            <div>
              <label style={labelStyle}>Label <span style={{ textTransform: 'none', fontWeight: 400, color: 'var(--text-dim)' }}>(optional)</span></label>
              <input
                type="text"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="e.g. Client review"
                style={inputStyle}
              />
            </div>

            {/* Expiry */}
            <div>
              <label style={labelStyle}>Expires <span style={{ textTransform: 'none', fontWeight: 400, color: 'var(--text-dim)' }}>(optional)</span></label>
              <input
                type="date"
                value={expiresAt}
                onChange={(e) => setExpiresAt(e.target.value)}
                min={new Date().toISOString().slice(0, 10)}
                style={inputStyle}
              />
            </div>

            {/* Allowlist */}
            <div>
              <label style={labelStyle}>
                Reviewer emails <span style={{ textTransform: 'none', fontWeight: 400, color: 'var(--text-dim)' }}>(optional — grants approve/reject access)</span>
              </label>
              <div style={{ display: 'flex', gap: 6, marginBottom: allowlist.length ? 8 : 0 }}>
                <input
                  type="email"
                  value={emailDraft}
                  onChange={(e) => setEmailDraft(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addEmail() } }}
                  placeholder="name@example.com"
                  style={{ ...inputStyle, flex: 1 }}
                />
                <button
                  type="button"
                  onClick={addEmail}
                  disabled={!emailDraft.trim()}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 4,
                    padding: '8px 10px', fontSize: 12,
                    background: 'var(--surface-2)', border: 'var(--border-rule)',
                    borderRadius: 3, color: 'var(--text-secondary)',
                    cursor: emailDraft.trim() ? 'pointer' : 'not-allowed', fontFamily: 'inherit',
                  }}
                >
                  <Plus size={12} /> Add
                </button>
              </div>
              {allowlist.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {allowlist.map((email) => (
                    <div key={email} style={{
                      display: 'flex', alignItems: 'center', gap: 4,
                      padding: '4px 8px', fontSize: 11, borderRadius: 99,
                      background: 'var(--surface-2)', border: 'var(--border-rule)',
                      color: 'var(--text-secondary)',
                    }}>
                      {email}
                      <button
                        type="button"
                        onClick={() => setAllowlist((prev) => prev.filter((e) => e !== email))}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex', padding: 0 }}
                      >
                        <X size={10} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
              {allowlist.length === 0 && (
                <p style={{ fontSize: 11, color: 'var(--text-dim)', margin: '4px 0 0' }}>
                  Without an allowlist, anyone with the password can leave reviews.
                </p>
              )}
            </div>

            {/* Watermark */}
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={showWatermark}
                onChange={(e) => setShowWatermark(e.target.checked)}
                style={{ accentColor: 'var(--accent)', width: 13, height: 13 }}
              />
              <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Show "PROOF" watermark on thumbnails</span>
            </label>

            {error && <p style={{ fontSize: 12, color: 'var(--flagged-fg)', margin: 0 }}>{error}</p>}

            {/* CTAs */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 4 }}>
              <button
                type="button"
                onClick={create}
                disabled={!password || creating}
                style={{
                  width: '100%', padding: '10px', fontSize: 13, fontWeight: 500,
                  background: password && !creating ? 'var(--accent)' : 'var(--surface-2)',
                  color: password && !creating ? '#fff' : 'var(--text-muted)',
                  border: 'none', borderRadius: 3, cursor: password && !creating ? 'pointer' : 'not-allowed',
                  fontFamily: 'inherit', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                  transition: 'background 0.15s',
                }}
              >
                <Share2 size={13} />
                {creating ? 'Creating…' : 'Generate link'}
              </button>
              <button
                type="button"
                onClick={onClose}
                style={{
                  padding: '8px', fontSize: 12,
                  background: 'transparent', color: 'var(--text-muted)',
                  border: 'none', borderRadius: 3, cursor: 'pointer', fontFamily: 'inherit',
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    </div>,
    document.body
  )
}
