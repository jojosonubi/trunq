'use client'

import { useState, useEffect, useCallback } from 'react'
import { Check, X, MessageSquare, ChevronLeft, ChevronRight, Lock } from 'lucide-react'
import { transformUrl } from '@/lib/supabase/storage'

interface MediaItem {
  id:                string
  storage_path:      string
  original_filename: string
  score:             number | null
  signed_url:        string
  review:            { status: string; comment: string | null } | null
}

// ─── Password gate ─────────────────────────────────────────────────────────────

function PasswordGate({
  shareLinkId,
  onSuccess,
}: {
  shareLinkId:  string
  onSuccess:    (session: { hasWriteAccess: boolean; email: string | null }) => void
}) {
  const [password, setPassword]   = useState('')
  const [email, setEmail]         = useState('')
  const [error, setError]         = useState('')
  const [loading, setLoading]     = useState(false)
  const [shake, setShake]         = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!password || loading) return
    setLoading(true)
    setError('')

    try {
      const res  = await fetch(`/api/share/${shareLinkId}/auth`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ password, email: email || undefined }),
      })
      const json = await res.json() as { ok?: boolean; error?: string; hasWriteAccess?: boolean; email?: string }

      if (!res.ok) {
        setError(json.error ?? 'Incorrect password.')
        setShake(true)
        setTimeout(() => setShake(false), 600)
      } else {
        onSuccess({ hasWriteAccess: json.hasWriteAccess ?? false, email: json.email ?? null })
      }
    } catch {
      setError('Something went wrong. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: '#0a0a0a', padding: 24,
    }}>
      <div style={{
        width: '100%', maxWidth: 360,
        animation: shake ? 'shake 0.5s ease' : undefined,
      }}>
        <style>{`
          @keyframes shake {
            0%, 100% { transform: translateX(0); }
            20%       { transform: translateX(-8px); }
            40%       { transform: translateX(8px); }
            60%       { transform: translateX(-5px); }
            80%       { transform: translateX(5px); }
          }
        `}</style>

        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 28 }}>
          <div style={{
            width: 44, height: 44, borderRadius: 8,
            background: 'rgba(255,45,0,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <Lock size={20} style={{ color: '#ff2d00' }} />
          </div>
        </div>

        <h1 style={{ fontSize: 18, fontWeight: 600, color: '#fff', textAlign: 'center', marginBottom: 6, letterSpacing: '-0.03em' }}>
          Protected Gallery
        </h1>
        <p style={{ fontSize: 13, color: '#666', textAlign: 'center', marginBottom: 28 }}>
          Enter the password to view this gallery
        </p>

        <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div>
            <label style={{ fontSize: 11, color: '#888', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: 6 }}>
              Password
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoFocus
              placeholder="Enter password"
              style={{
                width: '100%', padding: '10px 12px', fontSize: 14,
                background: '#161616', border: '1px solid #2a2a2a',
                borderRadius: 4, color: '#fff', outline: 'none',
                boxSizing: 'border-box', fontFamily: 'inherit',
              }}
            />
          </div>

          <div>
            <label style={{ fontSize: 11, color: '#888', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: 6 }}>
              Your Email <span style={{ color: '#555', textTransform: 'none', fontSize: 11 }}>(optional — required for feedback)</span>
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="your@email.com"
              style={{
                width: '100%', padding: '10px 12px', fontSize: 14,
                background: '#161616', border: '1px solid #2a2a2a',
                borderRadius: 4, color: '#fff', outline: 'none',
                boxSizing: 'border-box', fontFamily: 'inherit',
              }}
            />
          </div>

          {error && (
            <p style={{ fontSize: 12, color: '#ff2d00', margin: 0 }}>{error}</p>
          )}

          <button
            type="submit"
            disabled={!password || loading}
            style={{
              padding: '10px', fontSize: 13, fontWeight: 500,
              background: password && !loading ? '#ff2d00' : '#2a2a2a',
              color: '#fff', border: 'none', borderRadius: 4,
              cursor: password && !loading ? 'pointer' : 'not-allowed',
              fontFamily: 'inherit', transition: 'background 0.15s',
              marginTop: 4,
            }}
          >
            {loading ? 'Verifying…' : 'View Gallery'}
          </button>
        </form>
      </div>
    </div>
  )
}

// ─── Lightbox ─────────────────────────────────────────────────────────────────

function Lightbox({
  items,
  index,
  onClose,
  onNav,
  onReview,
  hasWriteAccess,
  email,
}: {
  items:          MediaItem[]
  index:          number
  onClose:        () => void
  onNav:          (i: number) => void
  onReview:       (mediaId: string, status: 'approved' | 'rejected', comment: string) => Promise<void>
  hasWriteAccess: boolean
  email:          string | null
}) {
  const item        = items[index]
  const [comment, setComment]     = useState(item?.review?.comment ?? '')
  const [saving, setSaving]       = useState(false)
  const [showComment, setShowComment] = useState(false)

  useEffect(() => {
    setComment(item?.review?.comment ?? '')
    setShowComment(false)
  }, [index, item?.review?.comment])

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape')      onClose()
      if (e.key === 'ArrowLeft')   onNav(Math.max(0, index - 1))
      if (e.key === 'ArrowRight')  onNav(Math.min(items.length - 1, index + 1))
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [index, items.length, onClose, onNav])

  async function handleReview(status: 'approved' | 'rejected') {
    if (!item || saving) return
    setSaving(true)
    try {
      await onReview(item.id, status, comment)
    } finally {
      setSaving(false)
    }
  }

  if (!item) return null

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 9999,
        background: 'rgba(0,0,0,0.95)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
    >
      {/* Close */}
      <button
        onClick={onClose}
        style={{ position: 'absolute', top: 16, right: 16, background: 'rgba(255,255,255,0.08)', border: 'none', borderRadius: 4, padding: 8, cursor: 'pointer', color: '#fff', display: 'flex' }}
      >
        <X size={18} />
      </button>

      {/* Nav */}
      {index > 0 && (
        <button onClick={(e) => { e.stopPropagation(); onNav(index - 1) }} style={{
          position: 'absolute', left: 16, top: '50%', transform: 'translateY(-50%)',
          background: 'rgba(255,255,255,0.08)', border: 'none', borderRadius: 4,
          padding: '10px 8px', cursor: 'pointer', color: '#fff', display: 'flex',
        }}>
          <ChevronLeft size={20} />
        </button>
      )}
      {index < items.length - 1 && (
        <button onClick={(e) => { e.stopPropagation(); onNav(index + 1) }} style={{
          position: 'absolute', right: 16, top: '50%', transform: 'translateY(-50%)',
          background: 'rgba(255,255,255,0.08)', border: 'none', borderRadius: 4,
          padding: '10px 8px', cursor: 'pointer', color: '#fff', display: 'flex',
        }}>
          <ChevronRight size={20} />
        </button>
      )}

      {/* Image */}
      <div onClick={(e) => e.stopPropagation()} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16, maxWidth: '90vw', maxHeight: '90vh' }}>
        <img
          src={transformUrl(item.signed_url, 1600, 85)}
          alt={item.original_filename}
          style={{ maxWidth: '80vw', maxHeight: '70vh', objectFit: 'contain', borderRadius: 4 }}
        />

        {/* Review panel */}
        {hasWriteAccess && email && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, width: '100%', maxWidth: 480 }}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <button
                onClick={() => handleReview('approved')}
                disabled={saving}
                style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  padding: '8px 16px', fontSize: 12, fontWeight: 500,
                  background: item.review?.status === 'approved' ? 'rgba(34,197,94,0.2)' : 'rgba(255,255,255,0.06)',
                  border: item.review?.status === 'approved' ? '1px solid rgba(34,197,94,0.5)' : '1px solid rgba(255,255,255,0.1)',
                  color: item.review?.status === 'approved' ? '#4ade80' : '#aaa',
                  borderRadius: 4, cursor: 'pointer', fontFamily: 'inherit', flex: 1,
                  justifyContent: 'center', transition: 'all 0.15s',
                }}
              >
                <Check size={13} /> Approve
              </button>
              <button
                onClick={() => handleReview('rejected')}
                disabled={saving}
                style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  padding: '8px 16px', fontSize: 12, fontWeight: 500,
                  background: item.review?.status === 'rejected' ? 'rgba(239,68,68,0.2)' : 'rgba(255,255,255,0.06)',
                  border: item.review?.status === 'rejected' ? '1px solid rgba(239,68,68,0.5)' : '1px solid rgba(255,255,255,0.1)',
                  color: item.review?.status === 'rejected' ? '#f87171' : '#aaa',
                  borderRadius: 4, cursor: 'pointer', fontFamily: 'inherit', flex: 1,
                  justifyContent: 'center', transition: 'all 0.15s',
                }}
              >
                <X size={13} /> Reject
              </button>
              <button
                onClick={() => setShowComment((v) => !v)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  padding: '8px 12px', fontSize: 12,
                  background: showComment ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0.06)',
                  border: '1px solid rgba(255,255,255,0.1)',
                  color: '#aaa', borderRadius: 4, cursor: 'pointer', fontFamily: 'inherit',
                }}
              >
                <MessageSquare size={13} />
              </button>
            </div>

            {showComment && (
              <div style={{ display: 'flex', gap: 6 }}>
                <input
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter' && item.review?.status) handleReview(item.review.status as 'approved' | 'rejected') }}
                  placeholder="Add a note…"
                  style={{
                    flex: 1, padding: '7px 10px', fontSize: 12,
                    background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)',
                    borderRadius: 4, color: '#fff', outline: 'none', fontFamily: 'inherit',
                  }}
                />
                {item.review?.status && (
                  <button
                    onClick={() => handleReview(item.review!.status as 'approved' | 'rejected')}
                    disabled={saving}
                    style={{
                      padding: '7px 10px', fontSize: 11,
                      background: '#ff2d00', border: 'none', borderRadius: 4,
                      color: '#fff', cursor: 'pointer', fontFamily: 'inherit',
                    }}
                  >
                    Save
                  </button>
                )}
              </div>
            )}

            {item.review?.comment && !showComment && (
              <p style={{ fontSize: 11, color: '#666', margin: 0 }}>"{item.review.comment}"</p>
            )}
          </div>
        )}

        {/* Position indicator */}
        <p style={{ fontSize: 11, color: '#555', margin: 0 }}>
          {index + 1} / {items.length}
        </p>
      </div>
    </div>
  )
}

// ─── Gallery ───────────────────────────────────────────────────────────────────

function Gallery({
  shareLinkId,
  projectName,
  label,
  showWatermark,
  session,
}: {
  shareLinkId:   string
  projectName:   string
  label:         string | null
  showWatermark: boolean
  session:       { hasWriteAccess: boolean; email: string | null }
}) {
  const [media, setMedia]       = useState<MediaItem[]>([])
  const [loading, setLoading]   = useState(true)
  const [lightbox, setLightbox] = useState<number | null>(null)

  useEffect(() => {
    fetch(`/api/share/${shareLinkId}/media`)
      .then((r) => r.json() as Promise<{ media?: MediaItem[]; error?: string }>)
      .then(({ media: items }) => { if (items) setMedia(items) })
      .finally(() => setLoading(false))
  }, [shareLinkId])

  const handleReview = useCallback(async (mediaId: string, status: 'approved' | 'rejected', comment: string) => {
    await fetch(`/api/share/${shareLinkId}/review`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ mediaId, status, comment }),
    })
    setMedia((prev) =>
      prev.map((m) =>
        m.id === mediaId
          ? { ...m, review: { status, comment: comment || null } }
          : m
      )
    )
  }, [shareLinkId])

  const displayName = label ?? projectName

  return (
    <div style={{ minHeight: '100vh', background: '#0a0a0a', color: '#fff', fontFamily: 'var(--font-mono, monospace)' }}>
      {/* Header */}
      <div style={{
        position: 'sticky', top: 0, zIndex: 50,
        background: 'rgba(10,10,10,0.92)', backdropFilter: 'blur(12px)',
        borderBottom: '1px solid #1a1a1a',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '12px 24px',
      }}>
        <div>
          <h1 style={{ fontSize: 14, fontWeight: 600, color: '#fff', margin: 0, letterSpacing: '-0.02em' }}>{displayName}</h1>
          {session.email && (
            <p style={{ fontSize: 11, color: '#555', margin: '2px 0 0' }}>{session.email}</p>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {session.hasWriteAccess && (
            <span style={{
              fontSize: 10, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.06em',
              padding: '3px 7px', borderRadius: 99,
              background: 'rgba(255,45,0,0.15)', color: '#ff2d00', border: '1px solid rgba(255,45,0,0.3)',
            }}>
              Reviewer
            </span>
          )}
          <span style={{ fontSize: 12, color: '#555' }}>{media.length} photos</span>
        </div>
      </div>

      {/* Grid */}
      <div style={{ padding: 24 }}>
        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: '80px 0' }}>
            <span style={{ fontSize: 13, color: '#555' }}>Loading gallery…</span>
          </div>
        ) : (
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
            gap: 6,
          }}>
            {media.map((item, i) => {
              const status = item.review?.status
              return (
                <div
                  key={item.id}
                  onClick={() => setLightbox(i)}
                  style={{
                    position: 'relative', cursor: 'pointer',
                    aspectRatio: '3/2', overflow: 'hidden', borderRadius: 3,
                    border: status === 'approved'
                      ? '2px solid rgba(34,197,94,0.6)'
                      : status === 'rejected'
                      ? '2px solid rgba(239,68,68,0.6)'
                      : '2px solid transparent',
                  }}
                >
                  <img
                    src={transformUrl(item.signed_url, 400, 75)}
                    alt={item.original_filename}
                    loading="lazy"
                    style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                  />

                  {/* Status badge */}
                  {status && (
                    <div style={{
                      position: 'absolute', top: 6, right: 6,
                      background: status === 'approved' ? 'rgba(34,197,94,0.85)' : 'rgba(239,68,68,0.85)',
                      borderRadius: '50%', width: 20, height: 20,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                      {status === 'approved'
                        ? <Check size={11} style={{ color: '#fff' }} />
                        : <X size={11} style={{ color: '#fff' }} />}
                    </div>
                  )}

                  {/* Watermark */}
                  {showWatermark && (
                    <div style={{
                      position: 'absolute', bottom: 6, right: 8,
                      fontSize: 9, color: 'rgba(255,255,255,0.4)',
                      fontFamily: 'monospace', letterSpacing: '0.02em',
                      textShadow: '0 1px 3px rgba(0,0,0,0.8)',
                      userSelect: 'none', pointerEvents: 'none',
                    }}>
                      PROOF
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Lightbox */}
      {lightbox !== null && (
        <Lightbox
          items={media}
          index={lightbox}
          onClose={() => setLightbox(null)}
          onNav={(i) => setLightbox(i)}
          onReview={handleReview}
          hasWriteAccess={session.hasWriteAccess}
          email={session.email}
        />
      )}
    </div>
  )
}

// ─── Root client component ────────────────────────────────────────────────────

export default function SharePortalClient({
  shareLinkId,
  projectName,
  label,
  showWatermark,
  initialSession,
}: {
  shareLinkId:    string
  projectName:    string
  label:          string | null
  showWatermark:  boolean
  initialSession: { hasWriteAccess: boolean; email: string | null } | null
}) {
  const [session, setSession] = useState<{ hasWriteAccess: boolean; email: string | null } | null>(initialSession)

  if (!session) {
    return (
      <PasswordGate
        shareLinkId={shareLinkId}
        onSuccess={(s) => setSession(s)}
      />
    )
  }

  return (
    <Gallery
      shareLinkId={shareLinkId}
      projectName={projectName}
      label={label}
      showWatermark={showWatermark}
      session={session}
    />
  )
}
