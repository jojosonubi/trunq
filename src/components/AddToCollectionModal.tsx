'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { Plus } from 'lucide-react'
import Modal from '@/components/ui/Modal'
import Button from '@/components/ui/Button'
import Spinner from '@/components/ui/Spinner'
import { Input } from '@/components/ui/Input'
import { toast } from '@/components/ui/Toast'

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
  const [done, setDone]               = useState<{ id: string; name: string; count: number } | null>(null)

  useEffect(() => {
    fetch('/api/collections')
      .then((r) => r.json())
      .then((d) => setCollections(d.collections ?? []))
      .catch(() => setCollections([]))
  }, [])

  async function addTo(collectionId: string, name: string) {
    setBusy(true)
    try {
      const res = await fetch(`/api/collections/${collectionId}/items`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ media_ids: mediaIds }),
      })
      if (!res.ok) throw new Error((await res.json()).error ?? 'Failed to add')
      // Snapshot the count before onAdded() clears the parent selection.
      setDone({ id: collectionId, name, count: mediaIds.length })
      onAdded()
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Failed to add to collection', 'error')
    } finally {
      setBusy(false)
    }
  }

  async function createAndAdd() {
    const name = newName.trim()
    if (!name) return
    setBusy(true)
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
      toast(e instanceof Error ? e.message : 'Failed to create collection', 'error')
      setBusy(false)
    }
  }

  return (
    <Modal onClose={onClose} labelledBy="collect-title">
      {done ? (
        <>
          <h2 id="collect-title" className="text-lg font-semibold mb-1.5" style={{ color: 'var(--text-primary)' }}>Added</h2>
          <p className="text-base mb-5" style={{ color: 'var(--text-secondary)' }}>
            {done.count} photo{done.count !== 1 ? 's' : ''} added to{' '}
            <span className="font-medium" style={{ color: 'var(--text-primary)' }}>{done.name}</span>.
          </p>
          <div className="flex gap-3 justify-end">
            <Button variant="ghost" size="sm" onClick={onClose}>Close</Button>
            <Link
              href={`/collections/${done.id}`}
              className="inline-flex items-center rounded-lg px-3 py-1.5 text-sm font-semibold transition-[filter] hover:brightness-95"
              style={{ background: 'var(--accent)', color: 'var(--accent-fg)' }}
            >
              View collection
            </Link>
          </div>
        </>
      ) : (
        <>
          <h2 id="collect-title" className="text-lg font-semibold mb-4" style={{ color: 'var(--text-primary)' }}>
            Add {mediaIds.length} photo{mediaIds.length !== 1 ? 's' : ''} to collection
          </h2>

          {/* Existing collections */}
          {collections === null ? (
            <div className="flex justify-center py-6"><Spinner /></div>
          ) : collections.length > 0 ? (
            <div className="max-h-56 overflow-y-auto -mx-2 mb-4">
              {collections.map((c) => (
                <button
                  key={c.id}
                  disabled={busy}
                  onClick={() => addTo(c.id, c.name)}
                  className="flex items-center justify-between w-full text-left px-3 py-2.5 rounded-lg transition-colors disabled:opacity-40 hover:bg-[var(--surface-2)]"
                >
                  <span className="text-base truncate" style={{ color: 'var(--text-primary)' }}>{c.name}</span>
                  <span className="text-sm tabular-nums shrink-0 ml-3" style={{ color: 'var(--text-muted)' }}>
                    {c.item_count} photo{c.item_count !== 1 ? 's' : ''}
                  </span>
                </button>
              ))}
            </div>
          ) : (
            <p className="text-base mb-4" style={{ color: 'var(--text-muted)' }}>
              No collections yet — create your first below.
            </p>
          )}

          {/* New collection */}
          <div className="flex gap-2 pt-3" style={{ borderTop: 'var(--border-rule)' }}>
            <Input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') createAndAdd() }}
              placeholder="New collection name…"
              disabled={busy}
              className="min-w-0 flex-1"
            />
            <Button variant="primary" size="sm" onClick={createAndAdd} disabled={busy || !newName.trim()} className="shrink-0">
              {busy ? <Spinner size={14} /> : <Plus size={14} />}
              Create
            </Button>
          </div>
        </>
      )}
    </Modal>
  )
}
