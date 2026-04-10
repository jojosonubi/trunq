'use client'

import { useState, useEffect } from 'react'
import { Copy, Check, Trash2, ExternalLink, ChevronDown, ChevronRight } from 'lucide-react'

interface ShareLinkRow {
  id:             string
  label:          string | null
  folder_id:      string | null
  is_active:      boolean
  expires_at:     string | null
  show_watermark: boolean
  created_at:     string
  sessions:       { email: string | null; has_write_access: boolean; last_seen_at: string }[]
  reviews:        { media_id: string; reviewer_email: string; status: string; comment: string | null; updated_at: string }[]
}

interface Props {
  projectId: string
}

function fmt(dateStr: string) {
  return new Date(dateStr).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

function ReviewBadge({ status }: { status: string }) {
  const colors: Record<string, { bg: string; color: string }> = {
    approved: { bg: 'rgba(34,197,94,0.12)', color: '#4ade80' },
    rejected: { bg: 'rgba(239,68,68,0.12)', color: '#f87171' },
    pending:  { bg: 'rgba(255,255,255,0.06)', color: '#888' },
  }
  const s = colors[status] ?? colors.pending
  return (
    <span style={{
      fontSize: 10, fontWeight: 500, padding: '2px 7px', borderRadius: 99,
      background: s.bg, color: s.color, textTransform: 'capitalize',
    }}>
      {status}
    </span>
  )
}

export default function SharesTab({ projectId }: Props) {
  const [links, setLinks]     = useState<ShareLinkRow[]>([])
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [copied, setCopied]   = useState<string | null>(null)
  const [revoking, setRevoking] = useState<string | null>(null)

  useEffect(() => {
    fetch(`/api/share?projectId=${encodeURIComponent(projectId)}`)
      .then((r) => r.json() as Promise<{ links?: ShareLinkRow[] }>)
      .then(({ links: data }) => { if (data) setLinks(data) })
      .finally(() => setLoading(false))
  }, [projectId])

  async function copy(id: string) {
    const url = `${window.location.origin}/share/${id}`
    await navigator.clipboard.writeText(url)
    setCopied(id)
    setTimeout(() => setCopied(null), 2000)
  }

  async function revoke(id: string) {
    if (revoking) return
    setRevoking(id)
    await fetch(`/api/share/${id}/revoke`, { method: 'POST' })
    setLinks((prev) => prev.map((l) => l.id === id ? { ...l, is_active: false } : l))
    setRevoking(null)
  }

  function toggle(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  if (loading) {
    return <p style={{ fontSize: 13, color: 'var(--text-muted)', padding: '32px 0' }}>Loading share links…</p>
  }

  if (links.length === 0) {
    return (
      <div style={{ padding: '48px 0', textAlign: 'center' }}>
        <p style={{ fontSize: 14, color: 'var(--text-secondary)', marginBottom: 6 }}>No share links yet</p>
        <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>Use the Share button in the header to create a gated gallery link.</p>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {links.map((link) => {
        const isExpanded  = expanded.has(link.id)
        const approvedN   = link.reviews.filter((r) => r.status === 'approved').length
        const rejectedN   = link.reviews.filter((r) => r.status === 'rejected').length
        const sessionN    = link.sessions.length
        const expired     = link.expires_at ? new Date(link.expires_at) < new Date() : false

        return (
          <div key={link.id} style={{
            border: 'var(--border-rule)', borderRadius: 4,
            background: 'var(--surface-1)',
            opacity: (!link.is_active || expired) ? 0.5 : 1,
          }}>
            {/* Header row */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px' }}>
              <button
                onClick={() => toggle(link.id)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex', padding: 0 }}
              >
                {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
              </button>

              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-primary)' }}>
                    {link.label ?? 'Share link'}
                  </span>
                  {!link.is_active && (
                    <span style={{ fontSize: 10, color: 'var(--text-dim)', padding: '1px 6px', borderRadius: 99, border: 'var(--border-rule)' }}>revoked</span>
                  )}
                  {expired && link.is_active && (
                    <span style={{ fontSize: 10, color: 'var(--text-dim)', padding: '1px 6px', borderRadius: 99, border: 'var(--border-rule)' }}>expired</span>
                  )}
                </div>
                <div style={{ display: 'flex', gap: 12, marginTop: 3, fontSize: 11, color: 'var(--text-muted)' }}>
                  <span>Created {fmt(link.created_at)}</span>
                  {link.expires_at && <span>Expires {fmt(link.expires_at)}</span>}
                  {sessionN > 0 && <span>{sessionN} view{sessionN !== 1 ? 's' : ''}</span>}
                  {approvedN > 0 && <span style={{ color: 'var(--approved-fg)' }}>{approvedN} approved</span>}
                  {rejectedN > 0 && <span style={{ color: 'var(--flagged-fg)' }}>{rejectedN} rejected</span>}
                </div>
              </div>

              <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                <button
                  onClick={() => copy(link.id)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 4,
                    padding: '5px 9px', fontSize: 11,
                    background: 'var(--surface-2)', border: 'var(--border-rule)',
                    borderRadius: 3, color: 'var(--text-secondary)',
                    cursor: 'pointer', fontFamily: 'inherit',
                  }}
                >
                  {copied === link.id ? <><Check size={11} style={{ color: 'var(--approved-fg)' }} /> Copied</> : <><Copy size={11} /> Copy link</>}
                </button>
                <a
                  href={`/share/${link.id}`}
                  target="_blank"
                  rel="noreferrer"
                  style={{
                    display: 'flex', alignItems: 'center', padding: '5px 7px',
                    background: 'var(--surface-2)', border: 'var(--border-rule)',
                    borderRadius: 3, color: 'var(--text-muted)',
                  }}
                >
                  <ExternalLink size={11} />
                </a>
                {link.is_active && !expired && (
                  <button
                    onClick={() => revoke(link.id)}
                    disabled={revoking === link.id}
                    style={{
                      display: 'flex', alignItems: 'center', padding: '5px 7px',
                      background: 'var(--surface-2)', border: 'var(--border-rule)',
                      borderRadius: 3, color: 'var(--flagged-fg)',
                      cursor: 'pointer', fontFamily: 'inherit',
                    }}
                  >
                    <Trash2 size={11} />
                  </button>
                )}
              </div>
            </div>

            {/* Expanded: sessions + per-image reviews */}
            {isExpanded && (
              <div style={{ borderTop: 'var(--border-rule)', padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 12 }}>
                {/* Access log */}
                {link.sessions.length > 0 && (
                  <div>
                    <p style={{ fontSize: 11, fontWeight: 500, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>Access log</p>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                      {link.sessions.map((s, i) => (
                        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 12 }}>
                          <span style={{ flex: 1, color: 'var(--text-primary)' }}>{s.email ?? 'Anonymous'}</span>
                          {s.has_write_access && (
                            <span style={{ fontSize: 10, color: 'var(--accent)', padding: '1px 6px', borderRadius: 99, border: '1px solid rgba(255,45,0,0.3)', background: 'rgba(255,45,0,0.08)' }}>reviewer</span>
                          )}
                          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Last seen {fmt(s.last_seen_at)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Reviews */}
                {link.reviews.length > 0 && (
                  <div>
                    <p style={{ fontSize: 11, fontWeight: 500, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>Reviews</p>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                      {link.reviews.map((r) => (
                        <div key={`${r.media_id}-${r.reviewer_email}`} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 12 }}>
                          <ReviewBadge status={r.status} />
                          <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>{r.reviewer_email}</span>
                          {r.comment && (
                            <span style={{ flex: 1, color: 'var(--text-secondary)', fontStyle: 'italic', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              "{r.comment}"
                            </span>
                          )}
                          <span style={{ fontSize: 11, color: 'var(--text-dim)', flexShrink: 0 }}>{fmt(r.updated_at)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {link.sessions.length === 0 && link.reviews.length === 0 && (
                  <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>No one has accessed this link yet.</p>
                )}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
