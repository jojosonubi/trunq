'use client'

import { useState, useEffect } from 'react'
import { Link2, Globe } from 'lucide-react'
import Modal from '@/components/ui/Modal'
import Button from '@/components/ui/Button'
import Spinner from '@/components/ui/Spinner'
import CopyButton from '@/components/ui/CopyButton'
import { toast } from '@/components/ui/Toast'

/**
 * Public share-link modal for a collection or project (event). Creates an
 * unguessable no-login /s/<token> gallery link; idempotent create, revoke,
 * and copy. View-only (no download).
 */
export default function ShareLinkModal({
  kind,
  targetId,
  targetName,
  onClose,
}: {
  kind: 'collection' | 'event'
  targetId: string
  targetName: string
  onClose: () => void
}) {
  const [url, setUrl]         = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy]       = useState(false)

  useEffect(() => {
    fetch(`/api/shares?kind=${kind}&target_id=${targetId}`)
      .then((r) => r.json())
      .then((d) => setUrl(d.share?.url ?? null))
      .catch(() => setUrl(null))
      .finally(() => setLoading(false))
  }, [kind, targetId])

  async function createLink() {
    setBusy(true)
    try {
      const res = await fetch('/api/shares', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind, target_id: targetId }),
      })
      const d = await res.json()
      if (res.ok) setUrl(d.url)
      else toast(d.error ?? 'Failed to create link', 'error')
    } catch {
      toast('Failed to create link', 'error')
    } finally {
      setBusy(false)
    }
  }

  async function revoke() {
    if (!url) return
    setBusy(true)
    try {
      const token = url.split('/s/')[1]
      const res = await fetch(`/api/shares?token=${token}`, { method: 'DELETE' })
      if (!res.ok) throw new Error()
      setUrl(null)
      toast('Public link revoked', 'success')
    } catch {
      toast('Failed to revoke link', 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal onClose={onClose} labelledBy="share-link-title">
      <div className="flex items-center gap-2 mb-1">
        <Globe size={16} style={{ color: 'var(--text-secondary)' }} />
        <h2 id="share-link-title" className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>
          Public link
        </h2>
      </div>
      <p className="text-sm mb-5" style={{ color: 'var(--text-secondary)' }}>
        Anyone with the link can view{' '}
        <span className="font-medium" style={{ color: 'var(--text-primary)' }}>{targetName}</span>{' '}
        as a gallery — no login. View-only.
      </p>

      {loading ? (
        <div className="flex justify-center py-6"><Spinner /></div>
      ) : url ? (
        <>
          <div
            className="flex items-center gap-2 rounded-lg px-3 py-2.5 mb-4"
            style={{ background: 'var(--surface-0)', border: 'var(--border-rule)' }}
          >
            <Link2 size={14} className="shrink-0" style={{ color: 'var(--text-muted)' }} />
            <span className="text-sm truncate flex-1" style={{ color: 'var(--text-primary)' }}>{url}</span>
            <CopyButton value={url} className="shrink-0" />
          </div>
          <div className="flex items-center justify-between">
            <Button variant="subtle" size="sm" onClick={revoke} disabled={busy}
              style={{ color: 'var(--flagged-fg)' }}>
              {busy ? 'Stopping…' : 'Stop sharing'}
            </Button>
            <Button variant="primary" size="sm" onClick={onClose}>Done</Button>
          </div>
        </>
      ) : (
        <div className="flex justify-end gap-3">
          <Button variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
          <Button variant="primary" size="sm" onClick={createLink} disabled={busy}>
            {busy ? <Spinner size={14} /> : <Globe size={14} />}
            Create public link
          </Button>
        </div>
      )}
    </Modal>
  )
}
