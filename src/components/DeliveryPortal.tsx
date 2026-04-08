'use client'

import { useState, useEffect } from 'react'
import Image from 'next/image'
import { Download, Archive, Calendar, MapPin, ShieldOff } from 'lucide-react'
import type { MediaFile, Event } from '@/types'

// ─── Types ────────────────────────────────────────────────────────────────────

interface Props {
  event: Event
  files: MediaFile[]
}

// ─── DeliveryPortal ───────────────────────────────────────────────────────────

export default function DeliveryPortal({ event, files }: Props) {
  const [downloading, setDownloading] = useState(false)
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null)

  function formatDate(dateStr: string): string {
    return new Date(dateStr).toLocaleDateString('en-GB', {
      day: 'numeric', month: 'long', year: 'numeric',
    })
  }

  function downloadUrl(file: MediaFile): string {
    return `/api/download?path=${encodeURIComponent(file.storage_path)}&filename=${encodeURIComponent(file.filename)}`
  }

  async function downloadAll() {
    setDownloading(true)
    try {
      // Fetch all files and zip them client-side
      const JSZip = (await import('jszip')).default
      const zip = new JSZip()
      await Promise.all(
        files.map(async (file) => {
          const res = await fetch(downloadUrl(file))
          const blob = await res.blob()
          zip.file(file.filename, blob)
        })
      )
      const blob = await zip.generateAsync({ type: 'blob' })
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob)
      a.download = `${event.name.replace(/[^a-z0-9]/gi, '_')}_photos.zip`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(a.href)
    } catch (err) {
      console.error('Zip failed:', err)
    }
    setDownloading(false)
  }

  const lightboxFile = lightboxIndex !== null ? files[lightboxIndex] : null

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (lightboxIndex === null) return
      if (e.key === 'ArrowRight' && lightboxIndex < files.length - 1)
        setLightboxIndex(lightboxIndex + 1)
      if (e.key === 'ArrowLeft' && lightboxIndex > 0)
        setLightboxIndex(lightboxIndex - 1)
      if (e.key === 'Escape')
        setLightboxIndex(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [lightboxIndex, files.length])

  return (
    <div className="min-h-screen" style={{ background: 'var(--surface-0)' }}>
      {/* ── Header ───────────────────────────────────────────────────────── */}
      <header style={{ borderBottom: 'var(--border-rule)' }}>
        <div className="max-w-6xl mx-auto page-px py-4 flex items-start justify-between gap-4">
          <div>
            <p className="font-mono text-[10px] uppercase track-label mb-2" style={{ color: 'var(--text-dim)' }}>
              Archive · Photo Delivery
            </p>
            <h1 className="text-xl font-semibold track-heading mb-2" style={{ color: 'var(--text-primary)' }}>{event.name}</h1>
            <div className="flex flex-wrap items-center gap-4 text-sm" style={{ color: 'var(--text-muted)' }}>
              {event.date && (
                <span className="inline-flex items-center gap-2">
                  <Calendar size={12} />
                  {formatDate(event.date)}
                </span>
              )}
              {event.location && (
                <span className="inline-flex items-center gap-2">
                  <MapPin size={12} />
                  {event.location}
                </span>
              )}
              <span style={{ color: 'var(--text-dim)' }}>
                {files.length} approved photo{files.length !== 1 ? 's' : ''}
              </span>
            </div>
          </div>

          {files.length > 0 && (
            <button
              onClick={downloadAll}
              disabled={downloading}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded transition-opacity disabled:opacity-60 shrink-0"
              style={{ background: 'var(--accent)', color: 'var(--text-primary)' }}
            >
              <Archive size={14} />
              {downloading
                ? 'Downloading…'
                : `Download all (${files.length})`}
            </button>
          )}
        </div>
      </header>

      {/* ── Gallery ──────────────────────────────────────────────────────── */}
      <main className="max-w-6xl mx-auto page-px py-8">
        {files.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>No photos available yet.</p>
            <p className="text-xs mt-1" style={{ color: 'var(--text-dim)' }}>Check back soon.</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {files.map((file, i) => (
              <div
                key={file.id}
                className="group relative aspect-square bg-surface-0 rounded-lg overflow-hidden border border-[#1f1f1f] cursor-pointer"
                onClick={() => setLightboxIndex(i)}
              >
                <Image
                  src={file.signed_url ?? file.public_url}
                  alt={file.filename}
                  fill
                  sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
                  className="object-cover transition-transform duration-300 group-hover:scale-[1.03]"
                  unoptimized
                />

                {/* Hover overlay with download button */}
                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/50 transition-all flex items-center justify-center opacity-0 group-hover:opacity-100">
                  {file.usage_type === 'restricted' ? (
                    <div className="flex flex-col items-center gap-1">
                      <ShieldOff size={18} className="text-red-400" />
                      <span className="text-red-400 text-[10px] font-medium">Restricted</span>
                    </div>
                  ) : (
                    <a
                      href={downloadUrl(file)}
                      download={file.filename}
                      onClick={(e) => e.stopPropagation()}
                      className="w-10 h-10 rounded-full bg-white flex items-center justify-center hover:scale-105 transition-transform"
                      title="Download"
                    >
                      <Download size={16} className="text-black" />
                    </a>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      {/* ── Lightbox ─────────────────────────────────────────────────────── */}
      {lightboxFile && lightboxIndex !== null && (
        <div
          className="fixed inset-0 z-50 bg-black/95 flex items-center justify-center"
          onClick={() => setLightboxIndex(null)}
        >
          <div
            className="relative w-full h-full flex items-center justify-center p-4"
            onClick={(e) => e.stopPropagation()}
          >
            <Image
              src={lightboxFile.signed_url ?? lightboxFile.public_url}
              alt={lightboxFile.filename}
              fill
              sizes="100vw"
              className="object-contain"
              unoptimized
            />

            {/* Close */}
            <button
              onClick={() => setLightboxIndex(null)}
              className="absolute top-4 right-4 w-9 h-9 flex items-center justify-center text-white/50 hover:text-white bg-white/5 hover:bg-white/10 rounded-full transition-all"
            >
              ✕
            </button>

            {/* Prev */}
            {lightboxIndex > 0 && (
              <button
                onClick={() => setLightboxIndex(lightboxIndex - 1)}
                className="absolute left-4 top-1/2 -translate-y-1/2 w-9 h-9 flex items-center justify-center text-white/50 hover:text-white bg-white/5 hover:bg-white/10 rounded-full transition-all"
              >
                ‹
              </button>
            )}

            {/* Next */}
            {lightboxIndex < files.length - 1 && (
              <button
                onClick={() => setLightboxIndex(lightboxIndex + 1)}
                className="absolute right-4 top-1/2 -translate-y-1/2 w-9 h-9 flex items-center justify-center text-white/50 hover:text-white bg-white/5 hover:bg-white/10 rounded-full transition-all"
              >
                ›
              </button>
            )}

            {/* Download + counter */}
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-4">
              <span className="text-white/30 text-xs tabular-nums">
                {lightboxIndex + 1} / {files.length}
              </span>
              {lightboxFile.usage_type === 'restricted' ? (
                <span className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 bg-red-500/10 text-red-400 border border-red-500/20 rounded-lg">
                  <ShieldOff size={12} />
                  Restricted — download unavailable
                </span>
              ) : (
                <a
                  href={downloadUrl(lightboxFile)}
                  download={lightboxFile.filename}
                  onClick={(e) => e.stopPropagation()}
                  className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 bg-white text-black rounded-lg hover:bg-white/90 transition-all"
                >
                  <Download size={12} />
                  Download
                </a>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
