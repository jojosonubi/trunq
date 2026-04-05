'use client'

import { useState, useEffect } from 'react'
import Image from 'next/image'
import { Download, Archive, Calendar, MapPin } from 'lucide-react'
import type { MediaFile, Event } from '@/types'
import { transformUrl } from '@/lib/supabase/storage'

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
    <div className="min-h-screen bg-[#0a0a0a]">
      {/* ── Header ───────────────────────────────────────────────────────── */}
      <header className="border-b border-[#1f1f1f]">
        <div className="max-w-6xl mx-auto px-6 py-5 flex items-start justify-between gap-4">
          <div>
            <p className="font-mono text-[10px] text-[#444] uppercase tracking-widest mb-2">
              Archive · Photo Delivery
            </p>
            <h1 className="text-white text-xl font-semibold mb-2">{event.name}</h1>
            <div className="flex flex-wrap items-center gap-4 text-[#666] text-sm">
              {event.date && (
                <span className="inline-flex items-center gap-1.5">
                  <Calendar size={12} />
                  {formatDate(event.date)}
                </span>
              )}
              {event.location && (
                <span className="inline-flex items-center gap-1.5">
                  <MapPin size={12} />
                  {event.location}
                </span>
              )}
              <span className="text-[#444]">
                {files.length} approved photo{files.length !== 1 ? 's' : ''}
              </span>
            </div>
          </div>

          {files.length > 0 && (
            <button
              onClick={downloadAll}
              disabled={downloading}
              className="inline-flex items-center gap-2 px-4 py-2.5 bg-white text-black text-sm font-medium rounded-lg hover:bg-white/90 transition-all disabled:opacity-60 shrink-0"
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
      <main className="max-w-6xl mx-auto px-6 py-10">
        {files.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <p className="text-[#666] text-sm">No photos available yet.</p>
            <p className="text-[#444] text-xs mt-1">Check back soon.</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {files.map((file, i) => (
              <div
                key={file.id}
                className="group relative aspect-square bg-[#111111] rounded-lg overflow-hidden border border-[#1f1f1f] cursor-pointer"
                onClick={() => setLightboxIndex(i)}
              >
                <Image
                  src={transformUrl(file.signed_url ?? file.public_url, 400)}
                  alt={file.filename}
                  fill
                  sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
                  className="object-cover transition-transform duration-300 group-hover:scale-[1.03]"
                  unoptimized
                />

                {/* Hover overlay with download button */}
                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/50 transition-all flex items-center justify-center opacity-0 group-hover:opacity-100">
                  <a
                    href={downloadUrl(file)}
                    download={file.filename}
                    onClick={(e) => e.stopPropagation()}
                    className="w-10 h-10 rounded-full bg-white flex items-center justify-center hover:scale-105 transition-transform"
                    title="Download"
                  >
                    <Download size={16} className="text-black" />
                  </a>
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
              src={transformUrl(lightboxFile.signed_url ?? lightboxFile.public_url, 800)}
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
              <a
                href={downloadUrl(lightboxFile)}
                download={lightboxFile.filename}
                onClick={(e) => e.stopPropagation()}
                className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 bg-white text-black rounded-lg hover:bg-white/90 transition-all"
              >
                <Download size={12} />
                Download
              </a>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
