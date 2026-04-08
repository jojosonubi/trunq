'use client'

import { useState, useEffect, useRef } from 'react'
import Image from 'next/image'
import { X, Download, ChevronLeft, ChevronRight, Sparkles } from 'lucide-react'
import clsx from 'clsx'
import CropTool, {
  PLATFORMS,
  PLATFORM_EXPORT,
  type Platform,
  type CropState,
} from '@/components/CropTool'
import type { MediaFileWithTags } from '@/types'

// ─── Export helpers ───────────────────────────────────────────────────────────

async function exportCrop(
  file: MediaFileWithTags,
  crop: CropState,
  platform: Platform,
): Promise<void> {
  // Proxy-fetch to avoid CORS canvas taint
  const proxy = `/api/download?path=${encodeURIComponent(file.storage_path)}&filename=${encodeURIComponent(file.filename)}`
  const blob    = await fetch(proxy).then((r) => r.blob())
  const blobUrl = URL.createObjectURL(blob)

  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = document.createElement('img')
    el.onload  = () => resolve(el)
    el.onerror = reject
    el.src     = blobUrl
  })

  const nw = img.naturalWidth
  const nh = img.naturalHeight

  const srcX = Math.round(crop.x * nw)
  const srcY = Math.round(crop.y * nh)
  const srcW = Math.round(crop.w * nw)
  const srcH = Math.round(crop.h * nh)

  const { w: dstW, h: dstH } = PLATFORM_EXPORT[platform]
  const canvas = document.createElement('canvas')
  canvas.width  = dstW
  canvas.height = dstH
  const ctx = canvas.getContext('2d')!
  ctx.drawImage(img, srcX, srcY, srcW, srcH, 0, 0, dstW, dstH)

  await new Promise<void>((resolve) => {
    canvas.toBlob(
      (b) => {
        if (!b) { resolve(); return }
        const url = URL.createObjectURL(b)
        const a   = document.createElement('a')
        a.href     = url
        a.download = `${platform}-${file.filename.replace(/\.[^.]+$/, '')}.jpg`
        document.body.appendChild(a)
        a.click()
        document.body.removeChild(a)
        URL.revokeObjectURL(url)
        resolve()
      },
      'image/jpeg',
      0.93,
    )
  })

  URL.revokeObjectURL(blobUrl)
}

/** Compute a default centered crop (fractions) without the display layer. */
function defaultCropFrac(
  fileW: number | null,
  fileH: number | null,
  ratio: number,
): CropState {
  if (!fileW || !fileH) return { x: 0, y: 0, w: 1, h: 1 }
  const imgRatio = fileW / fileH
  if (imgRatio > ratio) {
    // image wider than crop — constrain by height
    const cw = fileH * ratio
    return { x: (fileW - cw) / 2 / fileW, y: 0, w: cw / fileW, h: 1 }
  } else {
    // image taller than crop — constrain by width
    const ch = fileW / ratio
    return { x: 0, y: (fileH - ch) / 2 / fileH, w: 1, h: ch / fileH }
  }
}

// ─── Component ───────────────────────────────────────────────────────────────

interface Props {
  selectedFiles: MediaFileWithTags[]
  onDeselect: (id: string) => void
  onExit: () => void
}

export default function SocialPanel({ selectedFiles, onDeselect, onExit }: Props) {
  const [currentIndex, setCurrentIndex] = useState(0)
  const [platform, setPlatform]         = useState<Platform>('instagram')
  // Crops stored per `${fileId}-${platform}` key
  const [crops, setCrops] = useState<Record<string, CropState>>({})
  const [exporting, setExporting]    = useState(false)
  const [exportingAll, setExportingAll] = useState(false)
  const [justExported, setJustExported] = useState(false)

  // Keep currentIndex in bounds when selection changes
  const safeIndex = Math.min(currentIndex, Math.max(0, selectedFiles.length - 1))
  const currentFile = selectedFiles[safeIndex]

  // Auto-select platform based on image orientation when navigating to a new image
  const lastAutoIndexRef = useRef(-1)
  useEffect(() => {
    if (safeIndex === lastAutoIndexRef.current) return
    lastAutoIndexRef.current = safeIndex
    const file = selectedFiles[safeIndex]
    if (!file) return
    // Only auto-switch if no crop has been saved for this image yet
    const hasCrop = Object.keys(crops).some((k) => k.startsWith(file.id + '-'))
    if (!hasCrop && file.width && file.height) {
      setPlatform(file.height > file.width ? 'instagram' : 'x')
    }
  }, [safeIndex, selectedFiles, crops])

  const cropKey     = currentFile ? `${currentFile.id}-${platform}` : ''
  const currentCrop = crops[cropKey]

  function saveCrop(crop: CropState) {
    if (!cropKey) return
    setCrops((prev) => ({ ...prev, [cropKey]: crop }))
  }

  async function handleExport() {
    if (!currentFile || !currentCrop) return
    setExporting(true)
    try {
      await exportCrop(currentFile, currentCrop, platform)
      setJustExported(true)
      setTimeout(() => setJustExported(false), 2000)
    } finally {
      setExporting(false)
    }
  }

  async function handleExportAll() {
    setExportingAll(true)
    const ratio = PLATFORMS.find((p) => p.id === platform)!.ratio
    try {
      for (const file of selectedFiles) {
        const key  = `${file.id}-${platform}`
        const crop = crops[key] ?? defaultCropFrac(file.width, file.height, ratio)
        await exportCrop(file, crop, platform)
        await new Promise((r) => setTimeout(r, 350)) // gap prevents browser blocking
      }
    } finally {
      setExportingAll(false)
    }
  }

  // ── Empty state ────────────────────────────────────────────────────────────
  const isEmpty = selectedFiles.length === 0

  return (
    <div className="w-[300px] shrink-0 sticky top-6 self-start bg-surface-0 border border-[#1a1a1a] rounded-xl overflow-hidden flex flex-col max-h-[calc(100vh-6rem)]">

      {/* ── Header ───────────────────────────────────────────────────────── */}
      <div className="px-4 py-3.5 border-b border-[#1a1a1a] flex items-center justify-between gap-2">
        <div>
          <p className="text-white text-sm font-medium">Social Export</p>
          <p className="text-[#555] text-[11px] mt-0.5">
            {isEmpty ? 'No images selected' : `${selectedFiles.length} selected`}
          </p>
        </div>
        <button
          onClick={onExit}
          className="w-7 h-7 shrink-0 flex items-center justify-center text-[#555] hover:text-white transition-colors rounded-lg hover:bg-white/5"
          aria-label="Exit selection mode"
        >
          <X size={14} />
        </button>
      </div>

      {/* ── Platform tabs ────────────────────────────────────────────────── */}
      <div className="px-4 pt-3 pb-3 border-b border-[#1a1a1a]">
        <div className="flex gap-1">
          {PLATFORMS.map((p) => (
            <button
              key={p.id}
              onClick={() => setPlatform(p.id)}
              className={clsx(
                'flex-1 py-1.5 rounded-md text-[11px] font-medium transition-all',
                platform === p.id
                  ? 'bg-white text-black'
                  : 'text-[#555] hover:text-[#999] hover:bg-white/5',
              )}
            >
              {p.label}
            </button>
          ))}
        </div>
        <p className="text-[#333] text-[10px] mt-1.5 text-center">
          {PLATFORM_EXPORT[platform].w} × {PLATFORM_EXPORT[platform].h}px
          {' · '}
          {platform === 'instagram' ? '4∶5' : platform === 'x' ? '16∶9' : '9∶16'}
        </p>
      </div>

      {/* ── Main content ─────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto">
        {isEmpty ? (
          <div className="flex flex-col items-center justify-center py-14 px-4 text-center">
            <div className="w-10 h-10 rounded-full bg-surface-0 flex items-center justify-center mb-3">
              <Download size={18} className="text-[#444]" />
            </div>
            <p className="text-[#555] text-sm">No images selected</p>
            <p className="text-[#333] text-xs mt-1">Click images in the gallery to add them</p>
          </div>
        ) : (
          <div className="px-4 py-4 space-y-4">
            {/* Image navigation */}
            <div className="flex items-center justify-between">
              <button
                onClick={() => setCurrentIndex((i) => Math.max(0, i - 1))}
                disabled={safeIndex === 0}
                className="w-7 h-7 flex items-center justify-center text-[#555] hover:text-white transition-colors disabled:opacity-20 rounded-md hover:bg-white/5"
              >
                <ChevronLeft size={16} />
              </button>

              <div className="text-center">
                <p className="text-white text-xs font-medium truncate max-w-[160px]">
                  {currentFile?.filename}
                </p>
                <p className="text-[#444] text-[10px]">
                  {safeIndex + 1} of {selectedFiles.length}
                </p>
              </div>

              <button
                onClick={() => setCurrentIndex((i) => Math.min(selectedFiles.length - 1, i + 1))}
                disabled={safeIndex === selectedFiles.length - 1}
                className="w-7 h-7 flex items-center justify-center text-[#555] hover:text-white transition-colors disabled:opacity-20 rounded-md hover:bg-white/5"
              >
                <ChevronRight size={16} />
              </button>
            </div>

            {/* Crop tool — remounts on key change so init logic runs fresh */}
            {currentFile && (
              <CropTool
                key={cropKey}
                file={currentFile}
                platform={platform}
                savedCrop={currentCrop}
                onCropChange={saveCrop}
              />
            )}

            {/* Export this image */}
            <button
              onClick={handleExport}
              disabled={exporting || !currentCrop}
              className={clsx(
                'w-full flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-medium transition-all',
                justExported
                  ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                  : 'bg-white/8 hover:bg-white/12 border border-[#2a2a2a] hover:border-[#3a3a3a] text-white',
                (exporting || !currentCrop) && 'opacity-40',
              )}
            >
              {exporting ? (
                <><Sparkles size={13} className="animate-pulse" /> Exporting…</>
              ) : justExported ? (
                <>✓ Saved</>
              ) : (
                <><Download size={13} /> Export crop</>
              )}
            </button>
          </div>
        )}
      </div>

      {/* ── Thumbnail strip ───────────────────────────────────────────────── */}
      {!isEmpty && (
        <div className="border-t border-[#1a1a1a] px-4 py-3">
          <div className="flex gap-1.5 overflow-x-auto pb-0.5">
            {selectedFiles.map((file, i) => {
              const hasCrop = !!crops[`${file.id}-${platform}`]
              return (
                <button
                  key={file.id}
                  onClick={() => setCurrentIndex(i)}
                  className={clsx(
                    'relative shrink-0 w-10 h-10 rounded-md overflow-hidden border transition-all',
                    i === safeIndex
                      ? 'border-white/60 ring-1 ring-white/40'
                      : 'border-[#222] hover:border-[#444]',
                  )}
                >
                  <Image
                    src={file.signed_url ?? file.public_url}
                    alt=""
                    fill
                    className="object-cover"
                    sizes="40px"
                    unoptimized
                  />
                  {/* Dot indicator: crop saved for this platform */}
                  {hasCrop && (
                    <div className="absolute bottom-0.5 right-0.5 w-1.5 h-1.5 rounded-full bg-emerald-400" />
                  )}
                  {/* Remove button on hover */}
                  <div className="absolute inset-0 bg-black/0 hover:bg-black/50 transition-all flex items-center justify-center opacity-0 hover:opacity-100"
                    onClick={(e) => { e.stopPropagation(); onDeselect(file.id) }}>
                    <X size={10} className="text-white" />
                  </div>
                </button>
              )
            })}
          </div>

          {/* Export all */}
          <button
            onClick={handleExportAll}
            disabled={exportingAll}
            className="mt-3 w-full flex items-center justify-center gap-2 py-2 bg-white text-black text-sm font-medium rounded-lg hover:bg-white/90 transition-colors disabled:opacity-50"
          >
            {exportingAll ? (
              <><Sparkles size={13} className="animate-pulse" /> Exporting…</>
            ) : (
              <><Download size={13} /> Export all {selectedFiles.length}</>
            )}
          </button>
        </div>
      )}
    </div>
  )
}
