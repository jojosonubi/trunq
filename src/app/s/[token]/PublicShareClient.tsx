'use client'

import { useState, useEffect, useCallback } from 'react'
import { X, ChevronLeft, ChevronRight, Loader2, ImageOff } from 'lucide-react'

interface SharePhoto {
  id: string
  event_name: string
  event_date: string
  card_url: string
  full_url: string
  description: string | null
}
interface ShareData {
  kind: 'collection' | 'event'
  title: string
  subtitle: string
  count: number
  photos: SharePhoto[]
}

export default function PublicShareClient({ token }: { token: string }) {
  const [data, setData]     = useState<ShareData | null>(null)
  const [status, setStatus] = useState<'loading' | 'ok' | 'error'>('loading')
  const [lightbox, setLightbox] = useState<number | null>(null)

  useEffect(() => {
    fetch(`/api/public/share/${token}`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d: ShareData) => { setData(d); setStatus('ok') })
      .catch(() => setStatus('error'))
  }, [token])

  const close = useCallback(() => setLightbox(null), [])
  useEffect(() => {
    if (lightbox === null || !data) return
    const count = data.photos.length
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setLightbox(null)
      if (e.key === 'ArrowLeft')  setLightbox((i) => (i !== null && i > 0 ? i - 1 : i))
      if (e.key === 'ArrowRight') setLightbox((i) => (i !== null && i < count - 1 ? i + 1 : i))
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [lightbox, data])

  if (status === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--surface-0)' }}>
        <Loader2 className="animate-spin" style={{ color: 'var(--text-dim)' }} size={22} />
      </div>
    )
  }

  if (status === 'error' || !data) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-3 px-6 text-center" style={{ background: 'var(--surface-0)' }}>
        <ImageOff size={30} style={{ color: 'var(--text-dim)' }} />
        <p className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>This link isn’t available</p>
        <p className="text-sm" style={{ color: 'var(--text-muted)' }}>It may have been revoked or never existed.</p>
      </div>
    )
  }

  const active = lightbox !== null ? data.photos[lightbox] : null

  return (
    <div className="min-h-screen" style={{ background: 'var(--surface-0)' }}>
      {/* Header */}
      <header className="sticky top-0 z-20 px-6 py-4" style={{ background: 'var(--surface-0)', borderBottom: 'var(--border-rule)' }}>
        <div className="max-w-6xl mx-auto flex items-end justify-between gap-4">
          <div className="min-w-0">
            <h1 className="text-2xl font-semibold truncate" style={{ color: 'var(--text-primary)' }}>{data.title}</h1>
            {data.subtitle && <p className="text-sm mt-0.5" style={{ color: 'var(--text-muted)' }}>{data.subtitle}</p>}
          </div>
          <span className="shrink-0 font-semibold tracking-[0.18em] text-sm" style={{ color: 'var(--text-dim)' }}>TRUNQ</span>
        </div>
      </header>

      {/* Gallery */}
      <main className="max-w-6xl mx-auto px-6 py-6">
        {data.photos.length === 0 ? (
          <p className="text-center py-24 text-base" style={{ color: 'var(--text-muted)' }}>This gallery is empty.</p>
        ) : (
          <div className="columns-2 sm:columns-3 lg:columns-4 gap-2 space-y-2">
            {data.photos.map((p, i) => (
              <button
                key={p.id}
                onClick={() => setLightbox(i)}
                className="block w-full break-inside-avoid overflow-hidden rounded-lg cursor-zoom-in"
                style={{ border: 'var(--border-rule)' }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={p.card_url} alt={p.description ?? p.event_name} loading="lazy" className="w-full h-auto block" />
              </button>
            ))}
          </div>
        )}
      </main>

      {/* Lightbox */}
      {active && (
        <div className="fixed inset-0 z-50 bg-black/95 flex items-center justify-center" onClick={close}>
          <button onClick={close} aria-label="Close" className="absolute top-4 right-4 z-10 w-9 h-9 flex items-center justify-center text-white/60 hover:text-white bg-white/5 hover:bg-white/10 rounded-full">
            <X size={20} />
          </button>
          {lightbox! > 0 && (
            <button onClick={(e) => { e.stopPropagation(); setLightbox(lightbox! - 1) }} aria-label="Previous" className="absolute left-4 top-1/2 -translate-y-1/2 z-10 w-10 h-10 flex items-center justify-center text-white/60 hover:text-white bg-white/5 hover:bg-white/10 rounded-full">
              <ChevronLeft size={24} />
            </button>
          )}
          {lightbox! < data.photos.length - 1 && (
            <button onClick={(e) => { e.stopPropagation(); setLightbox(lightbox! + 1) }} aria-label="Next" className="absolute right-4 top-1/2 -translate-y-1/2 z-10 w-10 h-10 flex items-center justify-center text-white/60 hover:text-white bg-white/5 hover:bg-white/10 rounded-full">
              <ChevronRight size={24} />
            </button>
          )}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={active.full_url || active.card_url}
            alt={active.description ?? active.event_name}
            className="max-w-[92vw] max-h-[92vh] object-contain"
            onClick={(e) => e.stopPropagation()}
          />
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 text-white/40 text-xs tabular-nums">
            {lightbox! + 1} / {data.photos.length}
          </div>
        </div>
      )}
    </div>
  )
}
