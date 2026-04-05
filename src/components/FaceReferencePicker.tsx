'use client'

/**
 * FaceReferencePicker
 *
 * Lets a user pick a reference face photo for a performer. Two paths:
 *  1. "From archive"  — browse event photos → click one → draw a crop box
 *  2. "Upload photo"  — drag/drop or file input → draw a crop box
 *
 * The crop box is drawn as a CSS overlay (no canvas taint issues on display).
 * Extraction uses an off-screen canvas with a proxied blob URL so it works
 * regardless of CORS headers on the storage bucket.
 *
 * Calls onConfirm(blob) when the user confirms their selection/crop.
 */

import {
  useState, useRef, useCallback, useEffect,
  type MouseEvent as ReactMouseEvent,
} from 'react'
import Image from 'next/image'
import { X, Upload, Images, CornerDownRight, Check } from 'lucide-react'
import clsx from 'clsx'
import type { MediaFileWithTags } from '@/types'
import { transformUrl } from '@/lib/supabase/storage'

type Mode = 'choose' | 'archive-browse' | 'crop'

interface CropRect { x: number; y: number; w: number; h: number }

interface Props {
  /** All event photos — shown in the archive browser */
  files: MediaFileWithTags[]
  performerName: string
  onConfirm: (blob: Blob) => void
  onCancel: () => void
}

export default function FaceReferencePicker({ files, performerName, onConfirm, onCancel }: Props) {
  const [mode, setMode]                   = useState<Mode>('choose')
  const [imageSrc, setImageSrc]           = useState<string | null>(null)
  const [naturalSize, setNaturalSize]     = useState<{ w: number; h: number } | null>(null)
  const [cropRect, setCropRect]           = useState<CropRect | null>(null)
  const [isDragging, setIsDragging]       = useState(false)
  const [dragStart, setDragStart]         = useState<{ x: number; y: number } | null>(null)
  const [extracting, setExtracting]       = useState(false)

  const containerRef  = useRef<HTMLDivElement>(null)
  const imgRef        = useRef<HTMLImageElement>(null)
  const fileInputRef  = useRef<HTMLInputElement>(null)

  // ── Keyboard close ────────────────────────────────────────────────────────

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onCancel() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onCancel])

  useEffect(() => {
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = '' }
  }, [])

  // ── Archive pick ──────────────────────────────────────────────────────────

  function pickFromArchive(file: MediaFileWithTags) {
    setImageSrc(transformUrl(file.signed_url ?? file.public_url, 800))
    setCropRect(null)
    setMode('crop')
  }

  // ── File upload ───────────────────────────────────────────────────────────

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const objectUrl = URL.createObjectURL(file)
    setImageSrc(objectUrl)
    setCropRect(null)
    setMode('crop')
  }

  function handleDropFile(e: React.DragEvent) {
    e.preventDefault()
    const file = e.dataTransfer.files[0]
    if (!file || !file.type.startsWith('image/')) return
    const objectUrl = URL.createObjectURL(file)
    setImageSrc(objectUrl)
    setCropRect(null)
    setMode('crop')
  }

  // ── Crop mouse handlers ───────────────────────────────────────────────────

  function getRelativeCoords(e: ReactMouseEvent): { x: number; y: number } {
    const rect = containerRef.current!.getBoundingClientRect()
    return {
      x: Math.max(0, Math.min(e.clientX - rect.left, rect.width)),
      y: Math.max(0, Math.min(e.clientY - rect.top, rect.height)),
    }
  }

  const onMouseDown = useCallback((e: ReactMouseEvent) => {
    if (e.button !== 0) return
    e.preventDefault()
    const pos = getRelativeCoords(e)
    setDragStart(pos)
    setCropRect(null)
    setIsDragging(true)
  }, [])

  const onMouseMove = useCallback((e: ReactMouseEvent) => {
    if (!isDragging || !dragStart) return
    const pos = getRelativeCoords(e)
    setCropRect({
      x: Math.min(pos.x, dragStart.x),
      y: Math.min(pos.y, dragStart.y),
      w: Math.abs(pos.x - dragStart.x),
      h: Math.abs(pos.y - dragStart.y),
    })
  }, [isDragging, dragStart])

  const onMouseUp = useCallback(() => {
    setIsDragging(false)
    setDragStart(null)
  }, [])

  // ── Image load — record natural dimensions ────────────────────────────────

  function onImageLoad() {
    if (imgRef.current) {
      setNaturalSize({ w: imgRef.current.naturalWidth, h: imgRef.current.naturalHeight })
    }
  }

  // ── Crop extraction ───────────────────────────────────────────────────────

  const extractAndConfirm = useCallback(async (useFullImage: boolean) => {
    if (!imageSrc) return
    setExtracting(true)
    try {
      // Fetch image via proxy to avoid canvas CORS taint
      let blobUrl = imageSrc
      let ownedBlobUrl = false
      if (imageSrc.startsWith('http')) {
        const res = await fetch(`/api/download?url=${encodeURIComponent(imageSrc)}&filename=ref.jpg`)
        if (!res.ok) throw new Error('Failed to fetch image')
        blobUrl = URL.createObjectURL(await res.blob())
        ownedBlobUrl = true
      }

      const img  = document.createElement('img')
      await new Promise<void>((resolve, reject) => {
        img.onload  = () => resolve()
        img.onerror = () => reject(new Error('Image load failed'))
        img.src = blobUrl
      })

      const container = containerRef.current
      const displayW  = container?.clientWidth  ?? img.naturalWidth
      const displayH  = container?.clientHeight ?? img.naturalHeight
      const scaleX    = img.naturalWidth  / displayW
      const scaleY    = img.naturalHeight / displayH

      let sx = 0, sy = 0, sw = img.naturalWidth, sh = img.naturalHeight

      if (!useFullImage && cropRect && cropRect.w > 10 && cropRect.h > 10) {
        sx = Math.round(cropRect.x * scaleX)
        sy = Math.round(cropRect.y * scaleY)
        sw = Math.round(cropRect.w * scaleX)
        sh = Math.round(cropRect.h * scaleY)
      }

      const canvas  = document.createElement('canvas')
      canvas.width  = sw
      canvas.height = sh
      const ctx     = canvas.getContext('2d')!
      ctx.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh)

      canvas.toBlob((blob) => {
        if (blob) onConfirm(blob)
      }, 'image/jpeg', 0.92)

      if (ownedBlobUrl) URL.revokeObjectURL(blobUrl)
    } catch (err) {
      console.error('[FaceReferencePicker] extraction error:', err)
    } finally {
      setExtracting(false)
    }
  }, [imageSrc, cropRect, onConfirm])

  // ── Render ────────────────────────────────────────────────────────────────

  const hasCrop    = !!cropRect && cropRect.w > 10 && cropRect.h > 10
  const imageFiles = files.filter((f) => f.file_type === 'image')

  return (
    <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4" onClick={onCancel}>
      <div
        className="bg-[#0e0e0e] border border-[#1f1f1f] rounded-xl w-full max-w-3xl max-h-[90vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#1a1a1a] shrink-0">
          <div>
            <p className="text-white text-sm font-medium">Set reference photo</p>
            <p className="text-[#555] text-xs mt-0.5">{performerName}</p>
          </div>
          <button onClick={onCancel} className="text-[#555] hover:text-white transition-colors">
            <X size={18} />
          </button>
        </div>

        {/* ── Mode: choose ──────────────────────────────────────────────── */}
        {mode === 'choose' && (
          <div className="flex-1 flex items-center justify-center gap-6 p-10">
            {/* From archive */}
            <button
              onClick={() => setMode('archive-browse')}
              className="flex flex-col items-center gap-3 p-6 border border-[#1f1f1f] hover:border-[#333] rounded-xl transition-all group"
            >
              <div className="w-12 h-12 rounded-full bg-[#1a1a1a] group-hover:bg-[#222] flex items-center justify-center transition-colors">
                <Images size={20} className="text-[#888]" />
              </div>
              <div className="text-center">
                <p className="text-white text-sm font-medium">Pick from archive</p>
                <p className="text-[#555] text-xs mt-1">Select a photo and draw a box around their face</p>
              </div>
            </button>

            {/* Upload */}
            <div
              onDragOver={(e) => e.preventDefault()}
              onDrop={handleDropFile}
              className="flex flex-col items-center gap-3 p-6 border border-[#1f1f1f] hover:border-[#333] rounded-xl transition-all group cursor-pointer"
              onClick={() => fileInputRef.current?.click()}
            >
              <div className="w-12 h-12 rounded-full bg-[#1a1a1a] group-hover:bg-[#222] flex items-center justify-center transition-colors">
                <Upload size={20} className="text-[#888]" />
              </div>
              <div className="text-center">
                <p className="text-white text-sm font-medium">Upload reference photo</p>
                <p className="text-[#555] text-xs mt-1">Drop an image or click to browse</p>
              </div>
              <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFileChange} />
            </div>
          </div>
        )}

        {/* ── Mode: archive browse ──────────────────────────────────────── */}
        {mode === 'archive-browse' && (
          <div className="flex-1 overflow-y-auto p-4">
            <p className="text-[#555] text-xs mb-3">Click a photo to continue, then draw a box around the performer&apos;s face</p>
            <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-5 gap-2">
              {imageFiles.map((file) => (
                <button
                  key={file.id}
                  onClick={() => pickFromArchive(file)}
                  className="relative aspect-square bg-[#1a1a1a] rounded-lg overflow-hidden border border-[#1f1f1f] hover:border-white/30 transition-all group"
                >
                  <Image
                    src={transformUrl(file.signed_url ?? file.public_url, 400)} alt={file.filename} fill
                    sizes="150px" className="object-cover group-hover:scale-[1.05] transition-transform duration-200"
                    unoptimized
                  />
                </button>
              ))}
            </div>
          </div>
        )}

        {/* ── Mode: crop ───────────────────────────────────────────────── */}
        {mode === 'crop' && imageSrc && (
          <>
            <div className="flex-1 overflow-hidden relative bg-[#080808] flex items-center justify-center p-4">
              {/* Instruction */}
              <div className="absolute top-3 left-1/2 -translate-x-1/2 z-10 bg-black/60 text-white/70 text-xs px-3 py-1.5 rounded-full pointer-events-none">
                Click and drag to select the face area — or skip to use the full photo
              </div>

              {/* Image + crop overlay container */}
              <div
                ref={containerRef}
                className="relative select-none cursor-crosshair max-w-full max-h-full"
                style={{ userSelect: 'none' }}
                onMouseDown={onMouseDown}
                onMouseMove={onMouseMove}
                onMouseUp={onMouseUp}
                onMouseLeave={onMouseUp}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  ref={imgRef}
                  src={imageSrc}
                  alt="Reference"
                  className="block max-w-[680px] max-h-[480px] object-contain pointer-events-none"
                  onLoad={onImageLoad}
                  crossOrigin="anonymous"
                />

                {/* Darkened overlay — everything outside the crop */}
                {hasCrop && (
                  <div className="absolute inset-0 pointer-events-none">
                    <svg className="absolute inset-0 w-full h-full" style={{ position: 'absolute', inset: 0 }}>
                      <defs>
                        <mask id="crop-mask">
                          <rect width="100%" height="100%" fill="white" />
                          <rect
                            x={cropRect!.x} y={cropRect!.y}
                            width={cropRect!.w} height={cropRect!.h}
                            fill="black"
                          />
                        </mask>
                      </defs>
                      <rect width="100%" height="100%" fill="rgba(0,0,0,0.55)" mask="url(#crop-mask)" />
                    </svg>
                    {/* Dashed crop border */}
                    <div
                      className="absolute border-2 border-dashed border-white/80"
                      style={{
                        left:   cropRect!.x,
                        top:    cropRect!.y,
                        width:  cropRect!.w,
                        height: cropRect!.h,
                        boxSizing: 'border-box',
                      }}
                    />
                  </div>
                )}

                {/* Drag selection in progress */}
                {isDragging && cropRect && (
                  <div
                    className="absolute border border-dashed border-white/60 pointer-events-none"
                    style={{
                      left:   cropRect.x,
                      top:    cropRect.y,
                      width:  cropRect.w,
                      height: cropRect.h,
                    }}
                  />
                )}
              </div>
            </div>

            {/* Footer actions */}
            <div className="shrink-0 flex items-center justify-between gap-3 px-5 py-4 border-t border-[#1a1a1a]">
              <button
                onClick={() => { setMode('choose'); setImageSrc(null); setCropRect(null) }}
                className="text-[#555] hover:text-white text-sm transition-colors"
              >
                ← Back
              </button>

              <div className="flex items-center gap-2">
                {/* Skip crop: use full photo */}
                <button
                  onClick={() => extractAndConfirm(true)}
                  disabled={extracting}
                  className="inline-flex items-center gap-1.5 text-sm px-3 py-1.5 border border-[#1f1f1f] text-[#555] hover:text-white hover:border-[#333] rounded-lg transition-all disabled:opacity-40"
                >
                  <CornerDownRight size={13} />
                  Use full photo
                </button>

                {/* Use crop */}
                <button
                  onClick={() => extractAndConfirm(false)}
                  disabled={!hasCrop || extracting}
                  className="inline-flex items-center gap-1.5 text-sm px-4 py-1.5 bg-white text-black font-medium rounded-lg hover:bg-white/90 transition-all disabled:opacity-40"
                >
                  <Check size={13} />
                  {extracting ? 'Saving…' : hasCrop ? 'Use this crop' : 'Draw a selection first'}
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
