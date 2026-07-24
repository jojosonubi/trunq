'use client'

import { useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { ArrowLeft, ExternalLink, ImageIcon, X, Globe } from 'lucide-react'
import ShareLinkModal from '@/components/ShareLinkModal'

export interface CollectionPhoto {
  id: string
  event_id: string
  event_name: string
  event_date: string
  description: string | null
  url: string | null
}

function fmtDate(dateStr: string): string {
  if (!dateStr) return ''
  return new Date(dateStr).toLocaleDateString('en-GB', {
    day: 'numeric', month: 'short', year: 'numeric',
  })
}

export default function CollectionDetailClient({
  collectionId,
  name,
  initialPhotos,
}: {
  collectionId: string
  name: string
  initialPhotos: CollectionPhoto[]
}) {
  const [photos, setPhotos] = useState(initialPhotos)
  const [shareOpen, setShareOpen] = useState(false)

  async function remove(mediaId: string) {
    const prev = photos
    setPhotos((p) => p.filter((x) => x.id !== mediaId))
    const res = await fetch(`/api/collections/${collectionId}/items`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ media_ids: [mediaId] }),
    })
    if (!res.ok) setPhotos(prev)
  }

  return (
    <div className="flex-1 min-w-0 px-6 py-6">
      <div className="flex items-center gap-3 mb-5">
        <Link href="/collections" aria-label="Back to collections" className="shrink-0 hover:opacity-70 transition-opacity" style={{ color: 'var(--text-muted)' }}>
          <ArrowLeft size={16} />
        </Link>
        <h1 className="text-xl font-semibold truncate" style={{ color: 'var(--text-primary)' }}>{name}</h1>
        <span className="text-sm tabular-nums shrink-0" style={{ color: 'var(--text-muted)' }}>
          {photos.length} photo{photos.length !== 1 ? 's' : ''}
        </span>
        <button
          onClick={() => setShareOpen(true)}
          className="ml-auto shrink-0 inline-flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg border transition-colors"
          style={{ borderColor: 'var(--surface-3)', color: 'var(--text-secondary)' }}
        >
          <Globe size={13} />
          Share
        </button>
      </div>

      {shareOpen && (
        <ShareLinkModal kind="collection" targetId={collectionId} targetName={name} onClose={() => setShareOpen(false)} />
      )}

      {photos.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-center border border-dashed rounded-lg" style={{ borderColor: 'var(--surface-3)' }}>
          <ImageIcon size={28} className="mb-3" style={{ color: 'var(--text-dim)' }} />
          <p className="text-base" style={{ color: 'var(--text-secondary)' }}>This collection is empty</p>
          <Link
            href="/search"
            className="mt-2 text-sm underline underline-offset-2 hover:opacity-80"
            style={{ color: 'var(--text-secondary)' }}
          >
            Add photos from search
          </Link>
        </div>
      ) : (
        <div className="columns-2 sm:columns-3 lg:columns-4 gap-2 space-y-2">
          {photos.map((photo) => (
            <div
              key={photo.id}
              className="relative break-inside-avoid overflow-hidden rounded-lg border border-[#1a1a1a] hover:border-[#333] transition-colors group"
              style={{ background: 'var(--surface-0)' }}
            >
              <button
                onClick={() => remove(photo.id)}
                aria-label="Remove from collection"
                className="absolute top-2 right-2 z-10 w-6 h-6 rounded-full bg-black/60 text-white/70 hover:text-white hover:bg-black/80 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all"
              >
                <X size={13} />
              </button>
              {photo.url ? (
                <Image
                  src={photo.url}
                  alt={photo.description ?? ''}
                  width={400}
                  height={300}
                  className="w-full h-auto"
                  unoptimized
                />
              ) : (
                <div className="aspect-video flex items-center justify-center">
                  <ImageIcon size={20} style={{ color: 'var(--text-dim)' }} />
                </div>
              )}
              <div className="px-2.5 py-2 flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate" style={{ color: 'var(--text-primary)' }}>{photo.event_name}</p>
                  <p className="text-xs mt-0.5 tabular-nums" style={{ color: 'var(--text-muted)' }}>{fmtDate(photo.event_date)}</p>
                </div>
                <Link
                  href={`/projects/${photo.event_id}?photo=${photo.id}`}
                  aria-label="Open in project"
                  className="shrink-0 hover:opacity-70 transition-opacity"
                  style={{ color: 'var(--text-muted)' }}
                >
                  <ExternalLink size={13} />
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
