'use client'

import { useState, useRef, useEffect } from 'react'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import { createPortal } from 'react-dom'
import { MoreHorizontal, Download, Globe, Pencil, Trash2, ImageIcon, Loader2 } from 'lucide-react'
import ShareLinkModal from '@/components/ShareLinkModal'
import { buildZip, type ZipEntry } from '@/lib/zip'

export interface CollectionCardData {
  id: string
  name: string
  coverUrl: string | null
  count: number
  dateLabel: string
}

const MENU_ITEM: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 8, width: '100%', textAlign: 'left',
  fontSize: 13, padding: '9px 12px', color: 'var(--text-secondary)',
  background: 'transparent', border: 'none', cursor: 'pointer',
  fontFamily: 'inherit', whiteSpace: 'nowrap',
}

const hoverIn  = (e: React.MouseEvent<HTMLButtonElement>) => { e.currentTarget.style.background = 'var(--surface-1)'; e.currentTarget.style.color = 'var(--text-primary)' }
const hoverOut = (e: React.MouseEvent<HTMLButtonElement>) => { e.currentTarget.style.background = 'transparent';       e.currentTarget.style.color = 'var(--text-secondary)' }

export default function CollectionCard({ collection }: { collection: CollectionCardData }) {
  const router  = useRouter()
  const menuRef = useRef<HTMLDivElement>(null)

  const [hover, setHover]         = useState(false)
  const [menuOpen, setMenuOpen]   = useState(false)
  const [shareOpen, setShareOpen] = useState(false)
  const [renaming, setRenaming]   = useState(false)
  const [draft, setDraft]         = useState('')
  const [saving, setSaving]       = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting]   = useState(false)
  const [dl, setDl]               = useState<{ done: number; total: number } | null>(null)

  useEffect(() => {
    if (!menuOpen) return
    function onDown(e: MouseEvent) {
      if (!menuRef.current?.contains(e.target as Node)) setMenuOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [menuOpen])

  // ── Download full res: manifest → fetch originals (4-wide) → zip ────────────
  async function downloadFullRes() {
    if (dl) return
    setMenuOpen(false)
    setDl({ done: 0, total: 0 })
    try {
      const res = await fetch(`/api/collections/${collection.id}/download`)
      if (!res.ok) throw new Error()
      const { name, files } = await res.json() as { name: string; files: { filename: string; url: string }[] }
      if (files.length === 0) { setDl(null); return }
      setDl({ done: 0, total: files.length })

      const entries: ZipEntry[] = new Array(files.length)
      let idx = 0
      await Promise.all(Array.from({ length: Math.min(4, files.length) }, async () => {
        while (idx < files.length) {
          const i = idx++
          const r = await fetch(files[i].url)
          entries[i] = { filename: files[i].filename, data: new Uint8Array(await r.arrayBuffer()) }
          setDl((d) => (d ? { ...d, done: d.done + 1 } : d))
        }
      }))

      const blob = buildZip(entries.filter(Boolean))
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob)
      a.download = `${name.replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'collection'}.zip`
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(a.href)
    } catch {
      // fall through — button state resets below
    } finally {
      setDl(null)
    }
  }

  function startRename() {
    setMenuOpen(false)
    setDraft(collection.name)
    setRenaming(true)
  }

  async function commitRename() {
    const name = draft.trim()
    if (!name || name === collection.name) { setRenaming(false); return }
    setSaving(true)
    try {
      await fetch(`/api/collections/${collection.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      })
      router.refresh()
    } finally {
      setSaving(false)
      setRenaming(false)
    }
  }

  async function handleDelete() {
    setDeleting(true)
    try {
      await fetch(`/api/collections/${collection.id}`, { method: 'DELETE' })
      router.refresh()
      setConfirmDelete(false)
    } finally {
      setDeleting(false)
    }
  }

  const blocked = menuOpen || renaming || confirmDelete || shareOpen

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => { if (!blocked) router.push(`/collections/${collection.id}`) }}
      onKeyDown={(e) => { if (!blocked && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); router.push(`/collections/${collection.id}`) } }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      className="group rounded overflow-hidden transition-all cursor-pointer"
      style={{ background: hover ? 'var(--surface-1)' : 'var(--surface-0)', border: 'var(--border-rule)' }}
    >
      <div className="relative aspect-[16/10] w-full overflow-hidden">
        {collection.coverUrl ? (
          <Image
            src={collection.coverUrl}
            alt={collection.name}
            fill
            sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 25vw"
            className="object-cover group-hover:scale-[1.03] transition-transform duration-500"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center" style={{ background: 'var(--surface-2)' }}>
            <ImageIcon size={28} className="text-white/15" />
          </div>
        )}

        {/* ⋯ menu */}
        <div ref={menuRef} className="absolute top-2 right-2 z-10">
          <button
            onClick={(e) => { e.preventDefault(); e.stopPropagation(); setMenuOpen((v) => !v) }}
            aria-label="Collection options"
            className="w-7 h-7 flex items-center justify-center bg-black/60 backdrop-blur-sm rounded-md text-white/70 hover:text-white transition-opacity"
            style={{ opacity: hover || menuOpen || dl ? 1 : 0 }}
          >
            {dl ? <Loader2 size={13} className="animate-spin" /> : <MoreHorizontal size={14} />}
          </button>

          {menuOpen && (
            <div
              className="absolute top-9 right-0 z-20 rounded py-1 overflow-hidden"
              style={{ background: 'var(--surface-0)', border: 'var(--border-rule)', minWidth: 185 }}
            >
              <button onClick={(e) => { e.stopPropagation(); downloadFullRes() }} style={MENU_ITEM} onMouseEnter={hoverIn} onMouseLeave={hoverOut}>
                <Download size={13} /> Download full res
              </button>
              <button onClick={(e) => { e.stopPropagation(); setMenuOpen(false); setShareOpen(true) }} style={MENU_ITEM} onMouseEnter={hoverIn} onMouseLeave={hoverOut}>
                <Globe size={13} /> Share
              </button>
              <button onClick={(e) => { e.stopPropagation(); startRename() }} style={MENU_ITEM} onMouseEnter={hoverIn} onMouseLeave={hoverOut}>
                <Pencil size={13} /> Edit name
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); setMenuOpen(false); setConfirmDelete(true) }}
                style={MENU_ITEM}
                onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--surface-1)'; e.currentTarget.style.color = '#f87171' }}
                onMouseLeave={hoverOut}
              >
                <Trash2 size={13} /> Delete
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="p-4">
        {renaming ? (
          <input
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => {
              e.stopPropagation()
              if (e.key === 'Enter')  { e.preventDefault(); commitRename() }
              if (e.key === 'Escape') setRenaming(false)
            }}
            onBlur={commitRename}
            disabled={saving}
            className="w-full text-base font-semibold rounded px-2 py-1 focus:outline-none"
            style={{ background: 'var(--surface-0)', border: '1px solid var(--accent)', color: 'var(--text-primary)', opacity: saving ? 0.6 : 1 }}
          />
        ) : (
          <h3 className="text-base font-semibold truncate" style={{ color: 'var(--text-primary)' }}>
            {collection.name}
          </h3>
        )}
        <p className="text-sm mt-1 tabular-nums" style={{ color: 'var(--text-muted)' }}>
          {dl && dl.total > 0
            ? `Preparing ${dl.done}/${dl.total}…`
            : `${collection.count} photo${collection.count !== 1 ? 's' : ''} · ${collection.dateLabel}`}
        </p>
      </div>

      {/* Share modal */}
      {shareOpen && (
        <ShareLinkModal kind="collection" targetId={collection.id} targetName={collection.name} onClose={() => setShareOpen(false)} />
      )}

      {/* Delete confirm */}
      {confirmDelete && typeof window !== 'undefined' && createPortal(
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70"
          onClick={() => !deleting && setConfirmDelete(false)}
        >
          <div
            className="rounded p-6 max-w-sm w-full mx-4"
            style={{ background: 'var(--surface-0)', border: 'var(--border-rule)' }}
            onClick={(e) => e.stopPropagation()}
          >
            <p className="text-base font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>Delete collection?</p>
            <p className="text-sm leading-relaxed mb-5" style={{ color: 'var(--text-secondary)' }}>
              <strong style={{ color: 'var(--text-primary)' }}>{collection.name}</strong> will be deleted. The photos themselves stay in their projects.
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setConfirmDelete(false)}
                disabled={deleting}
                className="px-4 py-2 text-sm rounded-lg transition-colors disabled:opacity-40"
                style={{ border: 'var(--border-rule)', color: 'var(--text-secondary)' }}
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="px-4 py-2 text-sm font-medium bg-red-500/90 hover:bg-red-500 text-white rounded-lg transition-colors disabled:opacity-50"
              >
                {deleting ? 'Deleting…' : 'Delete'}
              </button>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </div>
  )
}
