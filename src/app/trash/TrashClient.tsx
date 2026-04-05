'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import { Calendar, ImageIcon, RotateCcw, Trash2 } from 'lucide-react'
import type { Event, MediaFile } from '@/types'

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', {
    day: 'numeric', month: 'short', year: 'numeric',
  })
}

function daysUntilPurge(deletedAt: string): number {
  const trashDate = new Date(deletedAt).getTime()
  const purgeDate = trashDate + 30 * 24 * 60 * 60 * 1000
  const remaining = Math.ceil((purgeDate - Date.now()) / (24 * 60 * 60 * 1000))
  return Math.max(0, remaining)
}

export default function TrashClient({
  trashedEvents,
  trashedPhotos,
}: {
  trashedEvents: Event[]
  trashedPhotos: MediaFile[]
}) {
  const router  = useRouter()
  const [busy, setBusy] = useState<string | null>(null)

  async function restore(type: 'event' | 'photo', id: string) {
    setBusy(id)
    try {
      await fetch('/api/trash', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type, id }),
      })
      router.refresh()
    } finally {
      setBusy(null)
    }
  }

  async function permanentDelete(type: 'event' | 'photo', id: string) {
    if (!confirm('Permanently delete this item? This cannot be undone.')) return
    setBusy(id)
    try {
      await fetch(`/api/trash?type=${type}&id=${encodeURIComponent(id)}`, { method: 'DELETE' })
      router.refresh()
    } finally {
      setBusy(null)
    }
  }

  const isEmpty = trashedEvents.length === 0 && trashedPhotos.length === 0

  if (isEmpty) {
    return (
      <div className="flex flex-col items-center justify-center py-32 text-center">
        <div className="w-16 h-16 rounded-full bg-[#111] border border-[#1f1f1f] flex items-center justify-center mb-4">
          <Trash2 size={22} className="text-[#333]" />
        </div>
        <p className="text-[#555] text-sm">Trash is empty</p>
      </div>
    )
  }

  return (
    <div className="space-y-10">
      {/* ── Trashed events ──────────────────────────────────────────────────── */}
      {trashedEvents.length > 0 && (
        <section>
          <h2 className="text-white text-sm font-semibold mb-4 flex items-center gap-2">
            <Calendar size={14} className="text-[#555]" />
            Events ({trashedEvents.length})
          </h2>
          <div className="space-y-2">
            {trashedEvents.map((event) => (
              <div
                key={event.id}
                className="flex items-center gap-4 bg-[#111111] border border-[#1f1f1f] rounded-xl px-4 py-3"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-white text-sm font-medium truncate">{event.name}</p>
                  <p className="text-[#555] text-xs mt-0.5">
                    {formatDate(event.date)}
                    {event.deleted_at && (
                      <> · Trashed {formatDate(event.deleted_at)} · {daysUntilPurge(event.deleted_at)}d until auto-delete</>
                    )}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={() => restore('event', event.id)}
                    disabled={busy === event.id}
                    className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 border border-[#1f1f1f] text-[#555] hover:text-white hover:border-[#333] rounded-lg transition-all disabled:opacity-40"
                  >
                    <RotateCcw size={11} />
                    {busy === event.id ? 'Restoring…' : 'Restore'}
                  </button>
                  <button
                    onClick={() => permanentDelete('event', event.id)}
                    disabled={busy === event.id}
                    className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 border border-red-500/20 text-red-400/60 hover:text-red-400 hover:border-red-500/40 rounded-lg transition-all disabled:opacity-40"
                  >
                    <Trash2 size={11} />
                    Delete forever
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ── Trashed photos ──────────────────────────────────────────────────── */}
      {trashedPhotos.length > 0 && (
        <section>
          <h2 className="text-white text-sm font-semibold mb-4 flex items-center gap-2">
            <ImageIcon size={14} className="text-[#555]" />
            Photos ({trashedPhotos.length})
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {trashedPhotos.map((photo) => (
              <div key={photo.id} className="group relative bg-[#111111] border border-[#1f1f1f] rounded-xl overflow-hidden">
                {/* Thumbnail */}
                <div className="relative aspect-square bg-[#0d0d0d]">
                  {photo.public_url ? (
                    <Image
                      src={photo.public_url}
                      alt={photo.filename}
                      fill
                      sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
                      className="object-cover"
                      unoptimized={
                        photo.filename.toLowerCase().endsWith('.heic') ||
                        photo.filename.toLowerCase().endsWith('.heif')
                      }
                    />
                  ) : (
                    <div className="absolute inset-0 flex items-center justify-center">
                      <ImageIcon size={20} className="text-[#333]" />
                    </div>
                  )}

                  {/* Countdown badge */}
                  {photo.deleted_at && (
                    <div className="absolute top-2 right-2 text-[10px] bg-black/70 text-[#888] px-1.5 py-0.5 rounded">
                      {daysUntilPurge(photo.deleted_at)}d
                    </div>
                  )}
                </div>

                {/* Info + actions */}
                <div className="p-3">
                  <p className="text-[#888] text-xs truncate mb-2">{photo.filename}</p>
                  <div className="flex gap-1.5">
                    <button
                      onClick={() => restore('photo', photo.id)}
                      disabled={busy === photo.id}
                      className="flex-1 inline-flex items-center justify-center gap-1 text-[10px] px-2 py-1.5 border border-[#1f1f1f] text-[#555] hover:text-white hover:border-[#333] rounded-lg transition-all disabled:opacity-40"
                    >
                      <RotateCcw size={9} />
                      {busy === photo.id ? '…' : 'Restore'}
                    </button>
                    <button
                      onClick={() => permanentDelete('photo', photo.id)}
                      disabled={busy === photo.id}
                      className="flex-1 inline-flex items-center justify-center gap-1 text-[10px] px-2 py-1.5 border border-red-500/20 text-red-400/60 hover:text-red-400 hover:border-red-500/40 rounded-lg transition-all disabled:opacity-40"
                    >
                      <Trash2 size={9} />
                      Delete
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}
