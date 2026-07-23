'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { Loader2, Plus } from 'lucide-react'

interface CollectionRow { id: string; name: string; item_count: number }

/**
 * Add-to-collection modal — shared by search results and the gallery view.
 * `mediaIds` is snapshotted into `done` on success so the confirmation count
 * survives the parent clearing its selection via onAdded().
 */
export default function AddToCollectionModal({
  mediaIds,
  onClose,
  onAdded,
}: {
  mediaIds: string[]
  onClose: () => void
  onAdded: () => void
}) {
  const [collections, setCollections] = useState<CollectionRow[] | null>(null)
  const [newName, setNewName]         = useState('')
  const [busy, setBusy]               = useState(false)
  const [error, setError]             = useState<string | null>(null)
  const [done, setDone]               = useState<{ id: string; name: string; count: number } | null>(null)

  useEffect(() => {
    fetch('/api/collections')
      .then((r) => r.json())
      .then((d) => setCollections(d.collections ?? []))
      .catch(() => setCollections([]))
  }, [])

  async function addTo(collectionId: string, name: string) {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(`/api/collections/${collectionId}/items`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ media_ids: mediaIds }),
      })
      if (!res.ok) throw new Error((await res.json()).error ?? 'Failed to add')
      // Snapshot the count before onAdded() clears the parent selection —
      // otherwise the confirmation reads the now-empty mediaIds and shows 0.
      setDone({ id: collectionId, name, count: mediaIds.length })
      onAdded()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to add')
    } finally {
      setBusy(false)
    }
  }

  async function createAndAdd() {
    const name = newName.trim()
    if (!name) return
    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/collections', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      })
      if (!res.ok) throw new Error((await res.json()).error ?? 'Failed to create')
      const { collection } = await res.json() as { collection: CollectionRow }
      await addTo(collection.id, collection.name)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create')
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70" onClick={onClose}>
      <div
        className="w-full max-w-sm mx-4 rounded-xl bg-[#111] border border-[#2a2a2a] p-5"
        onClick={(e) => e.stopPropagation()}
      >
        {done ? (
          <>
            <h2 className="text-white text-lg font-semibold mb-1.5">Added</h2>
            <p className="text-[#888] text-base mb-5">
              {done.count} photo{done.count !== 1 ? 's' : ''} added to{' '}
              <span className="text-white font-medium">{done.name}</span>.
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={onClose}
                className="px-4 py-2 text-base text-[#888] hover:text-white border border-[#2a2a2a] hover:border-[#444] rounded-lg transition-colors"
              >
                Close
              </button>
              <Link
                href={`/collections/${done.id}`}
                className="px-4 py-2 text-base font-semibold bg-white text-black rounded-lg hover:bg-white/90 transition-colors"
              >
                View collection
              </Link>
            </div>
          </>
        ) : (
          <>
            <h2 className="text-white text-lg font-semibold mb-4">
              Add {mediaIds.length} photo{mediaIds.length !== 1 ? 's' : ''} to collection
            </h2>

            {/* Existing collections */}
            {collections === null ? (
              <div className="flex justify-center py-6">
                <Loader2 size={16} className="text-[#444] animate-spin" />
              </div>
            ) : collections.length > 0 ? (
              <div className="max-h-56 overflow-y-auto -mx-2 mb-4">
                {collections.map((c) => (
                  <button
                    key={c.id}
                    disabled={busy}
                    onClick={() => addTo(c.id, c.name)}
                    className="flex items-center justify-between w-full text-left px-3 py-2.5 rounded-lg hover:bg-white/5 transition-colors disabled:opacity-40"
                  >
                    <span className="text-white text-base truncate">{c.name}</span>
                    <span className="text-[#555] text-sm tabular-nums shrink-0 ml-3">
                      {c.item_count} photo{c.item_count !== 1 ? 's' : ''}
                    </span>
                  </button>
                ))}
              </div>
            ) : (
              <p className="text-[#555] text-base mb-4">No collections yet — create your first below.</p>
            )}

            {/* New collection */}
            <div className="flex gap-2 pt-3" style={{ borderTop: '1px solid #222' }}>
              <input
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') createAndAdd() }}
                placeholder="New collection name…"
                disabled={busy}
                className="flex-1 min-w-0 bg-surface-0 border border-[#1f1f1f] rounded-lg px-3 py-2 text-white text-base placeholder:text-[#3a3a3a] focus:outline-none focus:border-[#333] transition-colors"
              />
              <button
                onClick={createAndAdd}
                disabled={busy || !newName.trim()}
                className="inline-flex items-center gap-1.5 bg-white text-black text-base font-semibold px-3.5 py-2 rounded-lg hover:bg-white/90 transition-colors disabled:opacity-40 shrink-0"
              >
                {busy ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
                Create
              </button>
            </div>

            {error && <p className="text-red-400 text-sm mt-3">{error}</p>}
          </>
        )}
      </div>
    </div>
  )
}
