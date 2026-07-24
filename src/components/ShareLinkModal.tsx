'use client'

import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { Loader2, Link2, Copy, Check, Globe } from 'lucide-react'

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
  const [url, setUrl]       = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy]     = useState(false)
  const [copied, setCopied] = useState(false)

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
    } finally {
      setBusy(false)
    }
  }

  async function revoke() {
    if (!url) return
    setBusy(true)
    try {
      const token = url.split('/s/')[1]
      await fetch(`/api/shares?token=${token}`, { method: 'DELETE' })
      setUrl(null)
    } finally {
      setBusy(false)
    }
  }

  async function copy() {
    if (!url) return
    await navigator.clipboard.writeText(url)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70" onClick={onClose}>
      <div
        className="w-full max-w-md mx-4 rounded-xl bg-[#111] border border-[#2a2a2a] p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 mb-1">
          <Globe size={16} className="text-white/70" />
          <h2 className="text-white text-lg font-semibold">Public link</h2>
        </div>
        <p className="text-[#888] text-sm mb-5">
          Anyone with the link can view <span className="text-white font-medium">{targetName}</span> as a gallery — no login. View-only.
        </p>

        {loading ? (
          <div className="flex justify-center py-6"><Loader2 size={16} className="animate-spin text-[#444]" /></div>
        ) : url ? (
          <>
            <div className="flex items-center gap-2 bg-surface-0 border border-[#1f1f1f] rounded-lg px-3 py-2.5 mb-4">
              <Link2 size={14} className="text-[#555] shrink-0" />
              <span className="text-white text-sm truncate flex-1">{url}</span>
              <button onClick={copy} className="shrink-0 inline-flex items-center gap-1.5 text-sm text-[#888] hover:text-white transition-colors">
                {copied ? <Check size={13} className="text-emerald-400" /> : <Copy size={13} />}
                {copied ? 'Copied' : 'Copy'}
              </button>
            </div>
            <div className="flex items-center justify-between">
              <button
                onClick={revoke}
                disabled={busy}
                className="text-sm text-red-400/80 hover:text-red-400 transition-colors disabled:opacity-40"
              >
                {busy ? 'Stopping…' : 'Stop sharing'}
              </button>
              <button onClick={onClose} className="px-4 py-2 text-sm font-medium bg-white text-black rounded-lg hover:bg-white/90 transition-colors">
                Done
              </button>
            </div>
          </>
        ) : (
          <div className="flex justify-end gap-3">
            <button onClick={onClose} className="px-4 py-2 text-sm text-[#888] hover:text-white border border-[#2a2a2a] hover:border-[#444] rounded-lg transition-colors">
              Cancel
            </button>
            <button
              onClick={createLink}
              disabled={busy}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold bg-white text-black rounded-lg hover:bg-white/90 transition-colors disabled:opacity-40"
            >
              {busy ? <Loader2 size={14} className="animate-spin" /> : <Globe size={14} />}
              Create public link
            </button>
          </div>
        )}
      </div>
    </div>,
    document.body,
  )
}
