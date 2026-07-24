'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { X, ChevronLeft, ChevronRight, Loader2, ImageOff } from 'lucide-react'

interface SharePhoto {
  id: string
  event_name: string
  event_date: string
  card_url: string
  description: string | null
}
interface SharePage {
  kind: 'collection' | 'event'
  title: string
  subtitle: string
  count: number
  page: number
  hasMore: boolean
  photos: SharePhoto[]
}

// Casual-copy deterrents: no right-click menu, no drag-out, no iOS long-press
// save. (Screenshots/DevTools can't be prevented; copied URLs are neutralised
// server-side by the same-origin proxy's fetch-metadata checks.)
const noCopyProps = {
  draggable: false,
  onContextMenu: (e: React.MouseEvent) => e.preventDefault(),
  style: { WebkitTouchCallout: 'none', userSelect: 'none' } as React.CSSProperties,
}

export default function PublicShareClient({ token }: { token: string }) {
  const [meta, setMeta]       = useState<Pick<SharePage, 'title' | 'subtitle' | 'count'> | null>(null)
  const [photos, setPhotos]   = useState<SharePhoto[]>([])
  const [status, setStatus]   = useState<'loading' | 'ok' | 'error'>('loading')
  const [hasMore, setHasMore] = useState(false)
  const [lightbox, setLightbox] = useState<number | null>(null)

  const pageRef    = useRef(0)
  const loadingRef = useRef(false)
  const sentinelRef = useRef<HTMLDivElement>(null)

  const loadPage = useCallback(async (page: number) => {
    if (loadingRef.current) return
    loadingRef.current = true
    try {
      const res = await fetch(`/api/public/share/${token}?page=${page}`)
      if (!res.ok) throw new Error()
      const d = await res.json() as SharePage
      setMeta({ title: d.title, subtitle: d.subtitle, count: d.count })
      setPhotos((prev) => (page === 0 ? d.photos : [...prev, ...d.photos]))
      setHasMore(d.hasMore)
      pageRef.current = page
      setStatus('ok')
    } catch {
      if (page === 0) setStatus('error')
    } finally {
      loadingRef.current = false
    }
  }, [token])

  useEffect(() => { loadPage(0) }, [loadPage])

  // Infinite scroll
  useEffect(() => {
    if (!hasMore || !sentinelRef.current) return
    const el = sentinelRef.current
    const io = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting) loadPage(pageRef.current + 1)
    }, { rootMargin: '600px' })
    io.observe(el)
    return () => io.disconnect()
  }, [hasMore, loadPage, photos.length])

  const close = useCallback(() => setLightbox(null), [])
  useEffect(() => {
    if (lightbox === null) return
    const count = photos.length
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setLightbox(null)
      if (e.key === 'ArrowLeft')  setLightbox((i) => (i !== null && i > 0 ? i - 1 : i))
      if (e.key === 'ArrowRight') setLightbox((i) => (i !== null && i < count - 1 ? i + 1 : i))
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [lightbox, photos.length])

  if (status === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--surface-0)' }}>
        <Loader2 className="animate-spin" style={{ color: 'var(--text-dim)' }} size={22} />
      </div>
    )
  }

  if (status === 'error' || !meta) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-3 px-6 text-center" style={{ background: 'var(--surface-0)' }}>
        <ImageOff size={30} style={{ color: 'var(--text-dim)' }} />
        <p className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>This link isn’t available</p>
        <p className="text-sm" style={{ color: 'var(--text-muted)' }}>It may have been revoked or never existed.</p>
      </div>
    )
  }

  const active = lightbox !== null ? photos[lightbox] : null

  return (
    <div className="min-h-screen" style={{ background: 'var(--surface-0)' }}>
      {/* Header */}
      <header className="sticky top-0 z-20 px-6 py-4" style={{ background: 'var(--surface-0)', borderBottom: 'var(--border-rule)' }}>
        <div className="max-w-6xl mx-auto flex items-end justify-between gap-4">
          <div className="min-w-0">
            <h1 className="text-2xl font-semibold truncate" style={{ color: 'var(--text-primary)' }}>{meta.title}</h1>
            {meta.subtitle && <p className="text-sm mt-0.5" style={{ color: 'var(--text-muted)' }}>{meta.subtitle}</p>}
          </div>
          <span className="shrink-0 font-semibold tracking-[0.18em] text-sm" style={{ color: 'var(--text-dim)' }}>TRUNQ</span>
        </div>
      </header>

      {/* Gallery */}
      <main className="max-w-6xl mx-auto px-6 py-6">
        {photos.length === 0 ? (
          <p className="text-center py-24 text-base" style={{ color: 'var(--text-muted)' }}>This gallery is empty.</p>
        ) : (
          <div className="columns-2 sm:columns-3 lg:columns-4 gap-2 space-y-2">
            {photos.map((p, i) => (
              <button
                key={p.id}
                onClick={() => setLightbox(i)}
                className="block w-full break-inside-avoid overflow-hidden rounded-lg cursor-zoom-in"
                style={{ border: 'var(--border-rule)' }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={p.card_url} alt={p.description ?? p.event_name} loading="lazy" className="w-full h-auto block" {...noCopyProps} />
              </button>
            ))}
          </div>
        )}
        {hasMore && (
          <div ref={sentinelRef} className="flex items-center justify-center py-8">
            <Loader2 size={18} className="animate-spin" style={{ color: 'var(--text-dim)' }} />
          </div>
        )}
      </main>

      {/* Lightbox — display-size streams from the same-origin proxy */}
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
          {lightbox! < photos.length - 1 && (
            <button onClick={(e) => { e.stopPropagation(); setLightbox(lightbox! + 1) }} aria-label="Next" className="absolute right-4 top-1/2 -translate-y-1/2 z-10 w-10 h-10 flex items-center justify-center text-white/60 hover:text-white bg-white/5 hover:bg-white/10 rounded-full">
              <ChevronRight size={24} />
            </button>
          )}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            key={active.id}
            src={`${active.card_url.split('?')[0]}?size=full`}
            alt={active.description ?? active.event_name}
            className="max-w-[92vw] max-h-[92vh] object-contain"
            onClick={(e) => e.stopPropagation()}
            style={{ backgroundImage: `url(${active.card_url})`, backgroundSize: 'contain', backgroundRepeat: 'no-repeat', backgroundPosition: 'center', ...noCopyProps.style }}
            draggable={false}
            onContextMenu={(e) => e.preventDefault()}
          />
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 text-white/40 text-xs tabular-nums">
            {lightbox! + 1} / {photos.length}
          </div>
        </div>
      )}
    </div>
  )
}
