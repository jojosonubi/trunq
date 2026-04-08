'use client'

import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import type { MediaFileWithTags } from '@/types'

// ─── Types ───────────────────────────────────────────────────────────────────

export type Platform = 'instagram' | 'story' | 'x' | 'tiktok'

/** All values are fractions of the natural image dimensions (0–1). */
export interface CropState {
  x: number // left edge / naturalWidth
  y: number // top edge / naturalHeight
  w: number // crop width / naturalWidth
  h: number // crop height / naturalHeight
}

// ─── Platform config ─────────────────────────────────────────────────────────

export const PLATFORMS: { id: Platform; label: string; ratio: number }[] = [
  { id: 'instagram', label: 'Instagram', ratio: 4 / 5   }, // 0.8  portrait
  { id: 'story',     label: 'Story',     ratio: 9 / 16  }, // 0.5625 vertical
  { id: 'x',         label: 'X',         ratio: 16 / 9  }, // ~1.778 landscape
  { id: 'tiktok',    label: 'TikTok',    ratio: 9 / 16  }, // 0.5625 vertical
]

export const PLATFORM_EXPORT: Record<Platform, { w: number; h: number }> = {
  instagram: { w: 1080, h: 1350 },
  story:     { w: 1080, h: 1920 },
  x:         { w: 1200, h: 675  },
  tiktok:    { w: 1080, h: 1920 },
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const CONTAINER_W = 268
const CONTAINER_H = 256

interface RenderedImg {
  w: number; h: number; ox: number; oy: number
}

function computeRendered(nw: number, nh: number): RenderedImg {
  const scale = Math.min(CONTAINER_W / nw, CONTAINER_H / nh)
  const w = nw * scale
  const h = nh * scale
  return { w, h, ox: (CONTAINER_W - w) / 2, oy: (CONTAINER_H - h) / 2 }
}

/** Compute a centered default crop in display-pixel space. */
function defaultCropPx(ratio: number, r: RenderedImg) {
  let cw = r.w * 0.88
  let ch = cw / ratio
  if (ch > r.h) { ch = r.h * 0.88; cw = ch * ratio }
  if (cw > r.w) { cw = r.w * 0.88; ch = cw / ratio }
  return { x: r.ox + (r.w - cw) / 2, y: r.oy + (r.h - ch) / 2, w: cw, h: ch }
}

function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v))
}

/** Convert display-pixel crop to 0–1 fractions of the rendered image region. */
function pxToFrac(px: { x: number; y: number; w: number; h: number }, r: RenderedImg): CropState {
  return {
    x: (px.x - r.ox) / r.w,
    y: (px.y - r.oy) / r.h,
    w: px.w / r.w,
    h: px.h / r.h,
  }
}

/** Convert 0–1 fractions back to display-pixel crop. */
function fracToPx(frac: CropState, r: RenderedImg) {
  return {
    x: frac.x * r.w + r.ox,
    y: frac.y * r.h + r.oy,
    w: frac.w * r.w,
    h: frac.h * r.h,
  }
}

// ─── Component ───────────────────────────────────────────────────────────────

interface Props {
  file: MediaFileWithTags
  platform: Platform
  /** Saved crop from a previous session on this image+platform (fractions). */
  savedCrop?: CropState
  onCropChange: (crop: CropState) => void
}

export default function CropTool({ file, platform, savedCrop, onCropChange }: Props) {
  const ratio = PLATFORMS.find((p) => p.id === platform)!.ratio

  const [naturalSize, setNaturalSize] = useState<{ w: number; h: number } | null>(null)
  const [cropPx, setCropPx]           = useState<{ x: number; y: number; w: number; h: number } | null>(null)

  const renderedImg = useMemo(
    () => (naturalSize ? computeRendered(naturalSize.w, naturalSize.h) : null),
    [naturalSize],
  )

  // Stable ref so drag handlers never go stale
  const cropPxRef     = useRef(cropPx)
  const renderedRef   = useRef(renderedImg)
  const onChangeRef   = useRef(onCropChange)
  useEffect(() => { cropPxRef.current   = cropPx      }, [cropPx])
  useEffect(() => { renderedRef.current = renderedImg  }, [renderedImg])
  useEffect(() => { onChangeRef.current = onCropChange }, [onCropChange])

  // Initialise crop once we know the rendered image size.
  // Component is keyed on `${file.id}-${platform}` by the parent so this runs
  // fresh each time the image or platform changes.
  const initialised = useRef(false)
  useEffect(() => {
    if (!renderedImg || initialised.current) return
    initialised.current = true
    const px = savedCrop ? fracToPx(savedCrop, renderedImg) : defaultCropPx(ratio, renderedImg)
    setCropPx(px)
    onChangeRef.current(pxToFrac(px, renderedImg))
  }, [renderedImg, savedCrop, ratio])

  // Emit fractional crop on every move
  useEffect(() => {
    if (!cropPx || !renderedImg) return
    onChangeRef.current(pxToFrac(cropPx, renderedImg))
  }, [cropPx, renderedImg])

  // ── Drag handling (mouse + touch) ─────────────────────────────────────────
  const drag = useRef<{ sx: number; sy: number; cx: number; cy: number } | null>(null)

  const startDrag = useCallback((clientX: number, clientY: number) => {
    if (!cropPxRef.current) return
    drag.current = { sx: clientX, sy: clientY, cx: cropPxRef.current.x, cy: cropPxRef.current.y }
  }, [])

  const moveDrag = useCallback((clientX: number, clientY: number) => {
    if (!drag.current || !renderedRef.current) return
    const r   = renderedRef.current
    const cp  = cropPxRef.current!
    const dx  = clientX - drag.current.sx
    const dy  = clientY - drag.current.sy
    setCropPx((prev) =>
      prev
        ? {
            ...prev,
            x: clamp(drag.current!.cx + dx, r.ox, r.ox + r.w - cp.w),
            y: clamp(drag.current!.cy + dy, r.oy, r.oy + r.h - cp.h),
          }
        : null,
    )
  }, [])

  useEffect(() => {
    const onMM = (e: MouseEvent) => moveDrag(e.clientX, e.clientY)
    const onTM = (e: TouchEvent) => { if (e.touches[0]) moveDrag(e.touches[0].clientX, e.touches[0].clientY) }
    const stop = () => { drag.current = null }
    window.addEventListener('mousemove', onMM)
    window.addEventListener('mouseup',   stop)
    window.addEventListener('touchmove', onTM, { passive: true })
    window.addEventListener('touchend',  stop)
    return () => {
      window.removeEventListener('mousemove', onMM)
      window.removeEventListener('mouseup',   stop)
      window.removeEventListener('touchmove', onTM)
      window.removeEventListener('touchend',  stop)
    }
  }, [moveDrag])

  // ── Preview dimensions ────────────────────────────────────────────────────
  const PREV_H = 72
  const prevW  = cropPx ? Math.round(PREV_H * (cropPx.w / cropPx.h)) : PREV_H

  return (
    <div className="space-y-2.5">
      {/* ── Crop frame ─────────────────────────────────────────────────────── */}
      <div
        className="relative overflow-hidden rounded-lg bg-black select-none"
        style={{ width: CONTAINER_W, height: CONTAINER_H }}
      >
        {/* Full image */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={file.signed_url ?? file.public_url}
          alt=""
          className="absolute inset-0 w-full h-full object-contain pointer-events-none"
          draggable={false}
          onLoad={(e) => {
            const el = e.currentTarget
            setNaturalSize({ w: el.naturalWidth, h: el.naturalHeight })
          }}
        />

        {/* Loading spinner */}
        {!naturalSize && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-5 h-5 rounded-full border-2 border-white/20 border-t-white/60 animate-spin" />
          </div>
        )}

        {/* Crop overlay: box-shadow creates the dark mask outside the crop frame */}
        {cropPx && (
          <div
            className="absolute cursor-move touch-none"
            style={{
              left:      cropPx.x,
              top:       cropPx.y,
              width:     cropPx.w,
              height:    cropPx.h,
              boxShadow: '0 0 0 9999px rgba(0,0,0,0.58)',
              border:    '1.5px solid rgba(255,255,255,0.85)',
            }}
            onMouseDown={(e) => { e.preventDefault(); startDrag(e.clientX, e.clientY) }}
            onTouchStart={(e) => { if (e.touches[0]) startDrag(e.touches[0].clientX, e.touches[0].clientY) }}
          >
            {/* Rule-of-thirds guides */}
            <div className="absolute inset-0 pointer-events-none" style={{ opacity: 0.25 }}>
              <div className="absolute top-1/3 left-0 right-0 h-px bg-white" />
              <div className="absolute top-2/3 left-0 right-0 h-px bg-white" />
              <div className="absolute left-1/3 top-0 bottom-0 w-px bg-white" />
              <div className="absolute left-2/3 top-0 bottom-0 w-px bg-white" />
            </div>

            {/* Corner brackets */}
            <Corner pos="tl" />
            <Corner pos="tr" />
            <Corner pos="bl" />
            <Corner pos="br" />
          </div>
        )}
      </div>

      {/* ── Live preview ───────────────────────────────────────────────────── */}
      {cropPx && renderedImg && (
        <div className="flex items-center gap-3">
          <span className="text-[#444] text-[10px] uppercase tracking-wider shrink-0">Preview</span>
          <div
            className="rounded overflow-hidden bg-black shrink-0 border border-[#1a1a1a]"
            style={{ width: prevW, height: PREV_H }}
          >
            {/* CSS crop: position the full image so only the crop region is visible */}
            <div className="relative overflow-hidden" style={{ width: prevW, height: PREV_H }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={file.signed_url ?? file.public_url}
                alt=""
                className="absolute pointer-events-none"
                draggable={false}
                style={{
                  width:  renderedImg.w * (prevW / cropPx.w),
                  height: renderedImg.h * (PREV_H / cropPx.h),
                  left:   -(cropPx.x - renderedImg.ox) * (prevW / cropPx.w),
                  top:    -(cropPx.y - renderedImg.oy) * (PREV_H / cropPx.h),
                }}
              />
            </div>
          </div>
          <span className="text-[#333] text-[10px] leading-snug">
            {PLATFORM_EXPORT[platform].w}×{PLATFORM_EXPORT[platform].h}<br />
            <span className="text-[#2a2a2a]">export px</span>
          </span>
        </div>
      )}
    </div>
  )
}

// ─── Corner bracket ──────────────────────────────────────────────────────────

function Corner({ pos }: { pos: 'tl' | 'tr' | 'bl' | 'br' }) {
  const SIZE = 10
  const T = pos[0] === 't'
  const L = pos[1] === 'l'
  return (
    <div
      className="absolute pointer-events-none"
      style={{
        width:        SIZE,
        height:       SIZE,
        top:          T ? -1 : undefined,
        bottom:       T ? undefined : -1,
        left:         L ? -1 : undefined,
        right:        L ? undefined : -1,
        borderTop:    T ? '2px solid white' : undefined,
        borderBottom: T ? undefined : '2px solid white',
        borderLeft:   L ? '2px solid white' : undefined,
        borderRight:  L ? undefined : '2px solid white',
      }}
    />
  )
}
