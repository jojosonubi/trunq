'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import Link from 'next/link'
import {
  X, ChevronLeft, ChevronRight, Calendar, Camera, MapPin, Building2, Aperture,
  Maximize2, Sparkles, RotateCcw, RotateCw, Star, Trash2, Shield, Users,
  Tag as TagIcon, Download, ExternalLink,
} from 'lucide-react'
import Pill, { ScorePill } from '@/components/ui/Pill'
import type { MediaFileWithTags, Tag, Folder, Event } from '@/types'
import { transformUrl } from '@/lib/supabase/storage'
import { formatDate } from '@/lib/format'

// THE app-standard photo lightbox (extracted from MediaGrid): full detail
// panel — AI tags + re-tag, capture/exposure EXIF, usage rights, folder
// assign, star, rotate, trash — plus Download full res, an optional
// "Visually similar" strip, and an optional Open-in-project footer so
// cross-event surfaces (search) can use the same component.

export interface StarProps {
  isStarredFn: (id: string) => boolean
  onToggle: (id: string) => void
}

export interface FolderProps {
  folders: Folder[]
  currentFolderId: string | null | undefined
  onAssign: (folderId: string | null) => void
}

/** Cross-event surfaces can annotate each file with its own event label. */
export type LightboxFile = MediaFileWithTags & {
  event_name?: string
  event_date?: string
}

interface Props {
  files: LightboxFile[]
  index: number
  onClose: () => void
  onNavigate: (i: number) => void
  stars?: StarProps
  folderProps?: FolderProps
  event?: Pick<Event, 'name' | 'venue' | 'location'>
  onTrash?: (id: string) => void
  /** Show the "Visually similar" embedding strip (authed surfaces). */
  showSimilar?: boolean
  /** Show per-file event line + an Open-in-project footer link (search). */
  openInProject?: boolean
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatGps(lat: number, lng: number): string {
  return `${Math.abs(lat).toFixed(5)}° ${lat >= 0 ? 'N' : 'S'}, ${Math.abs(lng).toFixed(5)}° ${lng >= 0 ? 'E' : 'W'}`
}

function formatFileSize(bytes: number): string {
  if (!bytes) return ''
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function MetaRow({
  icon, label, value, href,
}: { icon: React.ReactNode; label: string; value: string; href?: string }) {
  return (
    <div style={{ display: 'flex', gap: 10 }}>
      <div style={{ color: 'var(--text-muted)', marginTop: 1, flexShrink: 0 }}>{icon}</div>
      <div style={{ minWidth: 0 }}>
        <p style={{ color: 'var(--text-muted)', fontSize: 10, marginBottom: 2, marginTop: 0 }}>{label}</p>
        {href ? (
          <a href={href} target="_blank" rel="noopener noreferrer"
            style={{ color: 'var(--text-primary)', fontSize: 12, wordBreak: 'break-word', textDecoration: 'none' }}>
            {value}
          </a>
        ) : (
          <p style={{ color: 'var(--text-primary)', fontSize: 12, wordBreak: 'break-word', margin: 0 }}>{value}</p>
        )}
      </div>
    </div>
  )
}

// ─── Visually similar strip ──────────────────────────────────────────────────

interface SimilarPhoto {
  id: string
  event_id: string
  event_name: string
  description: string | null
  signed_url?: string
}

function SimilarStrip({ photoId, onClose }: { photoId: string; onClose: () => void }) {
  const [similar, setSimilar] = useState<SimilarPhoto[] | null>(null)

  useEffect(() => {
    setSimilar(null)
    let active = true
    fetch(`/api/search/similar?id=${photoId}&limit=12`)
      .then((r) => r.json())
      .then((d) => { if (active) setSimilar(d.photos ?? []) })
      .catch(() => { if (active) setSimilar([]) })
    return () => { active = false }
  }, [photoId])

  if (similar !== null && similar.length === 0) return null

  return (
    <div>
      <p style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.14em', color: 'var(--text-muted)', borderBottom: 'var(--border-rule)', paddingBottom: 6, marginBottom: 10, marginTop: 0, display: 'flex', alignItems: 'center', gap: 5 }}>
        <Sparkles size={10} />
        Visually similar
      </p>
      {similar === null ? (
        <div className="grid grid-cols-3 gap-1.5">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="aspect-square rounded bg-white/5 animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-1.5">
          {similar.map((s) => (
            <Link
              key={s.id}
              href={`/projects/${s.event_id}?photo=${s.id}`}
              onClick={onClose}
              className="relative aspect-square rounded overflow-hidden border border-[var(--surface-3)] hover:border-white/40 transition-colors group"
              title={s.event_name}
            >
              {s.signed_url && (
                <Image src={s.signed_url} alt={s.description ?? ''} fill sizes="100px" className="object-cover group-hover:opacity-80 transition-opacity" unoptimized />
              )}
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Lightbox ────────────────────────────────────────────────────────────────

export default function Lightbox({ files, index, onClose, onNavigate, stars, folderProps, event, onTrash, showSimilar, openInProject }: Props) {
  const router = useRouter()
  const file = files[index]
  const hasPrev = index > 0
  const hasNext = index < files.length - 1

  const [localTags, setLocalTags] = useState<Tag[] | null>(null)
  const [rotation, setRotation] = useState(0)
  const [localScore, setLocalScore] = useState<number | null | undefined>(undefined)
  const [localDescription, setLocalDescription] = useState<string | null | undefined>(undefined)
  const [retagging, setRetagging] = useState(false)
  const [retagError, setRetagError] = useState<string | null>(null)

  type UsageType = 'all_rights' | 'editorial_only' | 'client_use' | 'restricted' | null
  const [localUsageType, setLocalUsageType]       = useState<UsageType | undefined>(undefined)
  const [localUsageExpires, setLocalUsageExpires] = useState<string | undefined>(undefined)
  const [localUsageNotes, setLocalUsageNotes]     = useState<string | undefined>(undefined)
  const [usageSaving, setUsageSaving]             = useState(false)

  useEffect(() => {
    setLocalTags(null)
    setLocalScore(undefined)
    setLocalDescription(undefined)
    setRetagError(null)
    setRotation(0)
    setLocalUsageType(undefined)
    setLocalUsageExpires(undefined)
    setLocalUsageNotes(undefined)
  }, [file.id])

  const displayUsageType    = localUsageType    !== undefined ? localUsageType    : file.usage_type
  const displayUsageExpires = localUsageExpires !== undefined ? localUsageExpires : (file.usage_expires_at ?? '')
  const displayUsageNotes   = localUsageNotes   !== undefined ? localUsageNotes   : (file.usage_notes ?? '')

  const USAGE_LABELS: Record<NonNullable<UsageType>, string> = {
    all_rights:     'All rights',
    editorial_only: 'Editorial only',
    client_use:     'Client use',
    restricted:     'Restricted',
  }

  async function saveUsage() {
    setUsageSaving(true)
    try {
      const res = await fetch('/api/usage', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id:               file.id,
          usage_type:       localUsageType !== undefined ? localUsageType : file.usage_type,
          usage_expires_at: localUsageExpires !== undefined ? (localUsageExpires || null) : file.usage_expires_at,
          usage_notes:      localUsageNotes !== undefined ? (localUsageNotes || null) : file.usage_notes,
        }),
      })
      if (res.ok) router.refresh()
    } finally {
      setUsageSaving(false)
    }
  }

  const displayTags        = localTags        ?? file.tags        ?? []
  const displayScore       = localScore       !== undefined ? localScore       : file.quality_score
  const displayDescription = localDescription !== undefined ? localDescription : file.description

  // Ordered tag types — known types first, then any unknowns alphabetically
  const TAG_TYPE_ORDER: string[] = ['scene', 'subject', 'mood', 'gesture', 'hair', 'garment', 'cultural_dress', 'accessory']
  const TAG_TYPE_LABELS: Record<string, string> = {
    scene:          'Scene',
    subject:        'Subject',
    mood:           'Mood',
    gesture:        'Gesture',
    hair:           'Hair',
    garment:        'Garment',
    cultural_dress: 'Cultural Dress',
    accessory:      'Accessory',
  }

  const tagsByType = displayTags.reduce<Record<string, typeof displayTags>>((acc, t) => {
    ;(acc[t.tag_type] ??= []).push(t)
    return acc
  }, {})

  const allTypes = Object.keys(tagsByType)
  const knownTypes    = TAG_TYPE_ORDER.filter((type) => tagsByType[type]?.length)
  const unknownTypes  = allTypes.filter((type) => !TAG_TYPE_ORDER.includes(type)).sort()
  const orderedTypes  = [...knownTypes, ...unknownTypes]

  const hasTags = orderedTypes.length > 0

  async function handleRetag() {
    setRetagging(true)
    setRetagError(null)
    try {
      const res = await fetch('/api/tag', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ media_file_id: file.id }),
      })
      const json = await res.json()
      if (!res.ok) {
        setRetagError(json.error ?? 'Tagging failed')
        return
      }
      setLocalTags(json.tags ?? [])
      setLocalScore(json.quality_score ?? null)
      setLocalDescription(json.description ?? null)
      router.refresh()
    } catch (err) {
      setRetagError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setRetagging(false)
    }
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape')                    onClose()
      if (e.key === 'ArrowLeft'  && hasPrev)     onNavigate(index - 1)
      if (e.key === 'ArrowRight' && hasNext)     onNavigate(index + 1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [index, hasPrev, hasNext, onClose, onNavigate])

  useEffect(() => {
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = '' }
  }, [])

  const mapsHref =
    file.exif_gps_lat != null && file.exif_gps_lng != null
      ? `https://www.google.com/maps?q=${file.exif_gps_lat},${file.exif_gps_lng}`
      : undefined

  const isStarred = stars?.isStarredFn(file.id) ?? false
  const fileMeta  = [file.file_type.toUpperCase(), formatFileSize(file.file_size)].filter(Boolean).join(' · ')
  const downloadHref = `/api/download?path=${encodeURIComponent(file.storage_path)}&filename=${encodeURIComponent(file.filename)}`

  return (
    <div className="fixed inset-0 z-50 bg-black flex flex-col md:flex-row" onClick={onClose}>
      <div
        className="relative flex-1 flex items-center justify-center bg-[#080808] min-h-[45vh] md:min-h-0"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="absolute top-4 right-4 z-10 flex items-center gap-2">
          {file.file_type !== 'video' && (
            <button
              className="w-8 h-8 flex items-center justify-center text-white/50 hover:text-white transition-colors"
              onClick={() => setRotation((r) => (r + 90) % 360)}
              aria-label="Rotate clockwise"
            >
              <RotateCw size={18} />
            </button>
          )}
          <button
            className="w-8 h-8 flex items-center justify-center text-white/50 hover:text-white transition-colors"
            onClick={onClose} aria-label="Close"
          >
            <X size={20} />
          </button>
        </div>

        {hasPrev && (
          <button
            className="absolute left-4 top-1/2 -translate-y-1/2 z-10 w-9 h-9 flex items-center justify-center text-white/50 hover:text-white bg-white/5 hover:bg-white/10 rounded-full transition-all"
            onClick={() => onNavigate(index - 1)} aria-label="Previous"
          >
            <ChevronLeft size={20} />
          </button>
        )}

        {hasNext && (
          <button
            className="absolute right-4 top-1/2 -translate-y-1/2 z-10 w-9 h-9 flex items-center justify-center text-white/50 hover:text-white bg-white/5 hover:bg-white/10 rounded-full transition-all"
            onClick={() => onNavigate(index + 1)} aria-label="Next"
          >
            <ChevronRight size={20} />
          </button>
        )}

        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 text-white/30 text-sm tabular-nums">
          {index + 1} / {files.length}
        </div>

        {file.file_type === 'video' ? (
          <video src={file.signed_url ?? file.public_url} controls className="max-w-full max-h-full" />
        ) : (
          <div className="absolute inset-0">
            <Image
              src={transformUrl(file.signed_url ?? file.public_url, 2000, 85)} alt={file.filename} fill
              sizes="(max-width: 1280px) 70vw, 80vw" className="object-contain" priority
              style={{ transform: `rotate(${rotation}deg)`, transition: 'transform 0.2s' }}
              unoptimized
            />
          </div>
        )}
      </div>

      <div
        className="w-full md:w-72 shrink-0 flex flex-col overflow-y-auto max-h-[55vh] md:max-h-none border-t md:border-t-0 md:border-l border-[var(--surface-3)]"
        style={{ background: 'var(--surface-0)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ padding: '16px 20px', borderBottom: 'var(--border-rule)' }}>
          {/* Filename + star + quality score + download */}
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8, marginBottom: 6 }}>
            <p style={{ color: 'var(--text-primary)', fontSize: 12, fontWeight: 500, wordBreak: 'break-all', lineHeight: 1.4, flex: 1, margin: 0 }}>
              {file.filename}
            </p>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
              <a
                href={downloadHref}
                download={file.filename}
                aria-label="Download full resolution"
                title="Download full res"
                style={{ color: 'var(--text-dim)', display: 'flex' }}
                onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--text-primary)' }}
                onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--text-dim)' }}
              >
                <Download size={14} />
              </a>
              {stars && (
                <button
                  onClick={() => stars.onToggle(file.id)}
                  aria-label={isStarred ? 'Unstar' : 'Star'}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, display: 'flex' }}
                >
                  <Star
                    size={14}
                    fill={isStarred ? 'currentColor' : 'none'}
                    style={{ color: isStarred ? '#f59e0b' : 'var(--text-dim)' }}
                  />
                </button>
              )}
              {displayScore != null && (
                <ScorePill score={displayScore} />
              )}
            </div>
          </div>
          {fileMeta && (
            <p style={{ color: 'var(--text-muted)', fontSize: 10, margin: 0 }}>{fileMeta}</p>
          )}
          {openInProject && file.event_name && (
            <p style={{ color: 'var(--text-muted)', fontSize: 10, marginTop: 4, marginBottom: 0 }}>
              <span style={{ color: 'var(--text-dim)' }}>Event</span> {file.event_name}
              {file.event_date ? ` · ${file.event_date}` : ''}
            </p>
          )}
          {file.photographer && (
            <p style={{ color: 'var(--text-muted)', fontSize: 10, marginTop: 4, marginBottom: 0 }}>
              <span style={{ color: 'var(--text-dim)' }}>By</span> {file.photographer}
            </p>
          )}
          {/* Performer tags */}
          {(file.performer_tags ?? []).length > 0 && (
            <div style={{ marginTop: 8, display: 'flex', flexWrap: 'wrap', gap: 4 }}>
              {(file.performer_tags ?? []).map((pt) => (
                <Pill key={pt.id} variant="ghost">
                  <Users size={9} style={{ marginRight: 3 }} />
                  {pt.performers.name}
                </Pill>
              ))}
            </div>
          )}

          {/* Brand tags */}
          {(file.brand_tags ?? []).length > 0 && (
            <div style={{ marginTop: 6, display: 'flex', flexWrap: 'wrap', gap: 4 }}>
              {(file.brand_tags ?? []).map((bt) => (
                <Pill key={bt.id} variant="ghost">
                  <TagIcon size={9} style={{ marginRight: 3 }} />
                  {bt.brands.name}
                </Pill>
              ))}
            </div>
          )}

          {folderProps && folderProps.folders.length > 0 && (
            <div style={{ marginTop: 8 }}>
              <select
                value={folderProps.currentFolderId ?? ''}
                onChange={(e) => folderProps.onAssign(e.target.value || null)}
                style={{
                  width:        '100%',
                  background:   'var(--surface-1)',
                  border:       'var(--border-rule)',
                  color:        'var(--text-secondary)',
                  fontSize:     11,
                  borderRadius: 2,
                  padding:      '4px 8px',
                  outline:      'none',
                  cursor:       'pointer',
                  fontFamily:   'inherit',
                }}
              >
                <option value="">Unfiled</option>
                {folderProps.folders.map((folder) => (
                  <option key={folder.id} value={folder.id}>{folder.name}</option>
                ))}
              </select>
            </div>
          )}
          {displayDescription && (
            <p style={{ color: 'var(--text-secondary)', fontSize: 11, marginTop: 8, marginBottom: 0, lineHeight: 1.5 }}>
              {displayDescription}
            </p>
          )}

          {/* Event venue */}
          {event?.venue && (
            <div style={{ marginTop: 6, display: 'flex', alignItems: 'center', gap: 5, color: 'var(--text-muted)', fontSize: 11 }}>
              <Building2 size={11} style={{ flexShrink: 0, color: 'var(--text-dim)' }} />
              <span>{event.venue}</span>
            </div>
          )}
        </div>

        <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 20, flex: 1 }}>

          {file.file_type === 'image' && (
            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: 'var(--border-rule)', paddingBottom: 6, marginBottom: 10 }}>
                <p style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.14em', color: 'var(--text-muted)', margin: 0 }}>AI Tags</p>
                <button
                  onClick={handleRetag}
                  disabled={retagging}
                  style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, color: 'var(--text-muted)', background: 'none', border: 'none', cursor: retagging ? 'default' : 'pointer', opacity: retagging ? 0.5 : 1, fontFamily: 'inherit', padding: 0 }}
                  aria-label="Re-tag with AI"
                >
                  {retagging
                    ? <Sparkles size={10} style={{ color: '#a78bfa' }} />
                    : <RotateCcw size={10} />}
                  {retagging ? 'Tagging…' : 'Re-tag'}
                </button>
              </div>

              {retagError && <p style={{ color: 'var(--flagged-fg)', fontSize: 10, marginBottom: 8 }}>{retagError}</p>}

              {hasTags ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {orderedTypes.map((type) => (
                    <div key={type}>
                      <p style={{ fontSize: 9, color: 'var(--text-muted)', marginBottom: 5, marginTop: 0 }}>
                        {TAG_TYPE_LABELS[type] ?? type.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())}
                      </p>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                        {tagsByType[type].map((t) => (
                          <Pill key={t.id} variant="ghost">{t.value}</Pill>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p style={{ color: 'var(--text-muted)', fontSize: 10, margin: 0 }}>
                  {retagging ? 'Analysing image…' : 'No tags yet — click Re-tag to generate.'}
                </p>
              )}
            </div>
          )}

          {(file.exif_date_taken || file.exif_camera_make || file.exif_camera_model) && (
            <div>
              <p style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.14em', color: 'var(--text-muted)', borderBottom: 'var(--border-rule)', paddingBottom: 6, marginBottom: 10, marginTop: 0 }}>Capture</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {file.exif_date_taken && (
                  <MetaRow icon={<Calendar size={12} />} label="Date taken" value={formatDate(file.exif_date_taken)} />
                )}
                {(file.exif_camera_make || file.exif_camera_model) && (
                  <MetaRow
                    icon={<Camera size={12} />} label="Camera"
                    value={[file.exif_camera_make, file.exif_camera_model].filter(Boolean).join(' ')}
                  />
                )}
              </div>
            </div>
          )}

          {(file.exif_aperture || file.exif_shutter_speed || file.exif_iso || file.exif_focal_length) && (
            <div>
              <p style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.14em', color: 'var(--text-muted)', borderBottom: 'var(--border-rule)', paddingBottom: 6, marginBottom: 10, marginTop: 0 }}>Exposure</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {file.exif_aperture && (
                  <MetaRow icon={<Aperture size={12} />} label="Aperture" value={`f/${file.exif_aperture}`} />
                )}
                {file.exif_shutter_speed && (
                  <MetaRow icon={<span style={{ fontSize: 10, fontFamily: 'monospace', color: 'var(--text-muted)' }}>S</span>} label="Shutter speed" value={`${file.exif_shutter_speed}s`} />
                )}
                {file.exif_iso && (
                  <MetaRow icon={<span style={{ fontSize: 10, fontFamily: 'monospace', color: 'var(--text-muted)' }}>ISO</span>} label="ISO" value={String(file.exif_iso)} />
                )}
                {file.exif_focal_length && (
                  <MetaRow icon={<span style={{ fontSize: 10, fontFamily: 'monospace', color: 'var(--text-muted)' }}>FL</span>} label="Focal length" value={`${file.exif_focal_length}mm`} />
                )}
              </div>
            </div>
          )}

          {file.width && file.height && (
            <div>
              <p style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.14em', color: 'var(--text-muted)', borderBottom: 'var(--border-rule)', paddingBottom: 6, marginBottom: 10, marginTop: 0 }}>Image</p>
              <MetaRow icon={<Maximize2 size={12} />} label="Dimensions" value={`${file.width} × ${file.height}px`} />
            </div>
          )}

          {file.exif_gps_lat != null && file.exif_gps_lng != null && (
            <div>
              <p style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.14em', color: 'var(--text-muted)', borderBottom: 'var(--border-rule)', paddingBottom: 6, marginBottom: 10, marginTop: 0 }}>Location</p>
              <MetaRow
                icon={<MapPin size={12} />} label="GPS"
                value={formatGps(file.exif_gps_lat, file.exif_gps_lng)}
                href={mapsHref}
              />
            </div>
          )}

          {/* ── Usage rights ──────────────────────────────────────────────── */}
          <div>
            <p style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.14em', color: 'var(--text-muted)', borderBottom: 'var(--border-rule)', paddingBottom: 6, marginBottom: 10, marginTop: 0, display: 'flex', alignItems: 'center', gap: 5 }}>
              <Shield size={10} />
              Usage rights
            </p>

            {!onTrash && displayUsageType && (
              <Pill variant={displayUsageType === 'restricted' ? 'flagged' : displayUsageType === 'all_rights' ? 'approved' : 'ghost'}>
                {USAGE_LABELS[displayUsageType]}
              </Pill>
            )}
            {!onTrash && !displayUsageType && (
              <p style={{ color: 'var(--text-muted)', fontSize: 10, margin: 0 }}>Unlicensed</p>
            )}

            {onTrash && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <select
                  value={displayUsageType ?? ''}
                  onChange={(e) => setLocalUsageType((e.target.value || null) as UsageType)}
                  style={{ width: '100%', background: 'var(--surface-1)', border: 'var(--border-rule)', borderRadius: 2, padding: '5px 8px', color: 'var(--text-primary)', fontSize: 11, outline: 'none', fontFamily: 'inherit', cursor: 'pointer' }}
                >
                  <option value="">Unlicensed</option>
                  <option value="all_rights">All rights</option>
                  <option value="editorial_only">Editorial only</option>
                  <option value="client_use">Client use</option>
                  <option value="restricted">Restricted</option>
                </select>

                <input
                  type="date"
                  value={displayUsageExpires}
                  onChange={(e) => setLocalUsageExpires(e.target.value)}
                  placeholder="Expires"
                  style={{ width: '100%', background: 'var(--surface-1)', border: 'var(--border-rule)', borderRadius: 2, padding: '5px 8px', color: 'var(--text-primary)', fontSize: 11, outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box' }}
                />

                <textarea
                  value={displayUsageNotes}
                  onChange={(e) => setLocalUsageNotes(e.target.value)}
                  placeholder="Notes…"
                  rows={2}
                  style={{ width: '100%', background: 'var(--surface-1)', border: 'var(--border-rule)', borderRadius: 2, padding: '5px 8px', color: 'var(--text-primary)', fontSize: 11, outline: 'none', fontFamily: 'inherit', resize: 'none', boxSizing: 'border-box' }}
                />

                <button
                  onClick={saveUsage}
                  disabled={usageSaving}
                  style={{ width: '100%', fontSize: 11, background: 'var(--surface-2)', border: 'var(--border-rule)', borderRadius: 2, color: 'var(--text-secondary)', padding: '6px', cursor: usageSaving ? 'not-allowed' : 'pointer', opacity: usageSaving ? 0.5 : 1, fontFamily: 'inherit' }}
                >
                  {usageSaving ? 'Saving…' : 'Save rights'}
                </button>
              </div>
            )}
          </div>

          {/* ── Visually similar ──────────────────────────────────────────── */}
          {showSimilar && file.file_type === 'image' && (
            <SimilarStrip photoId={file.id} onClose={onClose} />
          )}
        </div>

        {(onTrash || openInProject) && (
          <div style={{ padding: '12px 20px', borderTop: 'var(--border-rule)', flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
            {openInProject && (
              <Link
                href={`/projects/${file.event_id}?photo=${file.id}`}
                onClick={onClose}
                className="flex items-center justify-center gap-2 w-full px-3 py-2 text-sm rounded-lg transition-colors"
                style={{ border: 'var(--border-rule)', color: 'var(--text-secondary)' }}
              >
                <ExternalLink size={12} />
                Open in project
              </Link>
            )}
            {onTrash && (
              <button
                onClick={() => { onTrash(file.id); onClose() }}
                style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--flagged-fg)', opacity: 0.6, background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', padding: 0 }}
              >
                <Trash2 size={11} style={{ flexShrink: 0 }} />
                Move to trash
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
