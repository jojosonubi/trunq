'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import { Check, Star, FolderInput, Folder as FolderIcon, Users, Tag as TagIcon, MoreHorizontal, RotateCw, Trash2, Shield } from 'lucide-react'
import Pill, { ScorePill } from '@/components/ui/Pill'
import { X, ChevronLeft, ChevronRight, Calendar, Camera, MapPin, Building2, Aperture, Maximize2, Sparkles, RotateCcw } from 'lucide-react'
import type { MediaFileWithTags, Tag, Folder, Event } from '@/types'
import clsx from 'clsx'

// ─── Star props ──────────────────────────────────────────────────────────────

export interface StarProps {
  isStarredFn: (id: string) => boolean
  onToggle: (id: string) => void
}

// ─── Selection prop shape ────────────────────────────────────────────────────

interface SelectionProps {
  selectedIds: Set<string>
  recommendedIds: Set<string>
  onToggle: (id: string) => void
}

interface FolderProps {
  folders: Folder[]
  currentFolderId: string | null | undefined
  onAssign: (folderId: string | null) => void
}

interface Props {
  files: MediaFileWithTags[]
  /** Pass when in social-selection mode to enable click-to-select and overlays */
  selection?: SelectionProps
  /** Use 3-col max (for when a sidebar is open alongside the grid) */
  compact?: boolean
  /** Pass to show star buttons and allow toggling from the gallery */
  stars?: StarProps
  /** Pass to enable hover-button folder assignment */
  folderProps?: (file: MediaFileWithTags) => FolderProps | undefined
  /** Open the lightbox for this photo ID on mount (deep-link from search) */
  initialOpenPhotoId?: string | null
  /** Event context shown in the lightbox detail panel */
  event?: Pick<Event, 'name' | 'venue' | 'location'>
  /** Called when admin moves a photo to trash */
  onTrash?: (id: string) => void
  /** When provided, shows a hover checkbox on each card in normal mode for quick selection */
  onQuickSelect?: (id: string) => void
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', {
    day: 'numeric', month: 'long', year: 'numeric',
  })
}

function formatGps(lat: number, lng: number): string {
  return `${Math.abs(lat).toFixed(5)}° ${lat >= 0 ? 'N' : 'S'}, ${Math.abs(lng).toFixed(5)}° ${lng >= 0 ? 'E' : 'W'}`
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}


// ─── MetaRow ─────────────────────────────────────────────────────────────────

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

// ─── Lightbox ────────────────────────────────────────────────────────────────

function Lightbox({ files, index, onClose, onNavigate, stars, folderProps, event, onTrash }: {
  files: MediaFileWithTags[]
  index: number
  onClose: () => void
  onNavigate: (i: number) => void
  stars?: StarProps
  folderProps?: FolderProps
  event?: Pick<Event, 'name' | 'venue' | 'location'>
  onTrash?: (id: string) => void
}) {
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

  const sceneTags   = displayTags.filter((t) => t.tag_type === 'scene')
  const moodTags    = displayTags.filter((t) => t.tag_type === 'mood')
  const subjectTags = displayTags.filter((t) => t.tag_type === 'subject')
  const hasTags     = sceneTags.length + moodTags.length + subjectTags.length > 0

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

  return (
    <div className="fixed inset-0 z-50 bg-black flex" onClick={onClose}>
      <div
        className="relative flex-1 flex items-center justify-center bg-[#080808]"
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

        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 text-white/30 text-xs tabular-nums">
          {index + 1} / {files.length}
        </div>

        {file.file_type === 'video' ? (
          <video src={file.signed_url ?? file.public_url} controls className="max-w-full max-h-full" />
        ) : (
          <div className="absolute inset-0">
            <Image
              src={file.signed_url ?? file.public_url} alt={file.filename} fill
              sizes="(max-width: 1280px) 70vw, 80vw" className="object-contain" priority
              style={{ transform: `rotate(${rotation}deg)`, transition: 'transform 0.2s' }}
              unoptimized
            />
          </div>
        )}
      </div>

      <div
        style={{ width: 288, flexShrink: 0, background: 'var(--surface-0)', borderLeft: 'var(--border-rule)', display: 'flex', flexDirection: 'column', overflowY: 'auto' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ padding: '16px 20px', borderBottom: 'var(--border-rule)' }}>
          {/* Filename + star + quality score */}
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8, marginBottom: 6 }}>
            <p style={{ color: 'var(--text-primary)', fontSize: 12, fontWeight: 500, wordBreak: 'break-all', lineHeight: 1.4, flex: 1, margin: 0 }}>
              {file.filename}
            </p>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
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
          <p style={{ color: 'var(--text-muted)', fontSize: 10, margin: 0 }}>
            {file.file_type.toUpperCase()} · {formatFileSize(file.file_size)}
          </p>
          {file.photographer && (
            <p style={{ color: 'var(--text-muted)', fontSize: 10, marginTop: 4, marginBottom: 0 }}>
              <span style={{ color: 'var(--text-dim)' }}>By</span> {file.photographer}
            </p>
          )}
          {/* Performer tags */}
          {(file.performer_tags ?? []).length > 0 && (
            <div style={{ marginTop: 8, display: 'flex', flexWrap: 'wrap', gap: 4 }}>
              {file.performer_tags.map((pt) => (
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
              {file.brand_tags.map((bt) => (
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

          {/* ── Section label helper style ─────────────────────────────── */}
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
                  {sceneTags.length > 0 && (
                    <div>
                      <p style={{ fontSize: 9, color: 'var(--text-muted)', marginBottom: 5, marginTop: 0 }}>Scene</p>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                        {sceneTags.map((t) => (
                          <Pill key={t.id} variant="ghost">{t.value}</Pill>
                        ))}
                      </div>
                    </div>
                  )}
                  {moodTags.length > 0 && (
                    <div>
                      <p style={{ fontSize: 9, color: 'var(--text-muted)', marginBottom: 5, marginTop: 0 }}>Mood</p>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                        {moodTags.map((t) => (
                          <Pill key={t.id} variant="ghost">{t.value}</Pill>
                        ))}
                      </div>
                    </div>
                  )}
                  {subjectTags.length > 0 && (
                    <div>
                      <p style={{ fontSize: 9, color: 'var(--text-muted)', marginBottom: 5, marginTop: 0 }}>Subject</p>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                        {subjectTags.map((t) => (
                          <Pill key={t.id} variant="ghost">{t.value}</Pill>
                        ))}
                      </div>
                    </div>
                  )}
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
        </div>

        {onTrash && (
          <div style={{ padding: '12px 20px', borderTop: 'var(--border-rule)', flexShrink: 0 }}>
            <button
              onClick={() => { onTrash(file.id); onClose() }}
              style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--flagged-fg)', opacity: 0.6, background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', padding: 0 }}
            >
              <Trash2 size={11} style={{ flexShrink: 0 }} />
              Move to trash
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── ContextMenu ─────────────────────────────────────────────────────────────

interface ContextMenuState {
  x: number
  y: number
  fileId: string
  folderProps: FolderProps
}

function ContextMenu({ state, onClose }: { state: ContextMenuState; onClose: () => void }) {
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) onClose()
    }
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose() }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [onClose])

  // Adjust position to stay in viewport
  const style: React.CSSProperties = {
    position: 'fixed',
    top: state.y,
    left: state.x,
    zIndex: 9999,
  }

  const { folders, currentFolderId, onAssign } = state.folderProps

  return createPortal(
    <div
      ref={menuRef}
      style={style}
      className="min-w-[160px] bg-surface-0 border border-[#2a2a2a] rounded-lg shadow-2xl py-1 overflow-hidden"
    >
      <p className="px-3 py-1.5 text-[10px] text-[#444] uppercase tracking-wider font-medium">
        Move to folder
      </p>
      {folders.map((folder) => (
        <button
          key={folder.id}
          onClick={() => { onAssign(folder.id); onClose() }}
          className={clsx(
            'flex items-center gap-2.5 w-full text-left px-3 py-2 text-sm transition-colors',
            currentFolderId === folder.id
              ? 'text-white bg-white/8'
              : 'text-[#888] hover:text-white hover:bg-white/4'
          )}
        >
          <FolderIcon size={13} className="shrink-0" />
          {folder.name}
          {currentFolderId === folder.id && <Check size={11} className="ml-auto text-emerald-400" />}
        </button>
      ))}
      {currentFolderId !== null && (
        <button
          onClick={() => { onAssign(null); onClose() }}
          className="flex items-center gap-2.5 w-full text-left px-3 py-2 text-sm text-[#666] hover:text-white hover:bg-white/4 transition-colors border-t border-[#222] mt-1"
        >
          <FolderInput size={13} className="shrink-0" />
          Remove from folder
        </button>
      )}
    </div>,
    document.body
  )
}

// ─── MediaCell ───────────────────────────────────────────────────────────────

interface CellProps {
  file: MediaFileWithTags
  onClick: () => void
  cellSelection?: { isSelected: boolean; isRecommended: boolean }
  stars?: StarProps
  /** Called when the user triggers the options menu (hover button or long-press) */
  onMenuTrigger?: (x: number, y: number, file: MediaFileWithTags) => void
  /** When provided, shows a hover checkbox for quick multi-selection */
  onQuickSelect?: (id: string) => void
}

function MediaCell({ file, onClick, cellSelection, stars, onMenuTrigger, onQuickSelect }: CellProps) {
  const [loaded, setLoaded] = useState(false)
  const inSelectionMode = cellSelection !== undefined
  const isSelected      = cellSelection?.isSelected      ?? false
  const isRecommended   = cellSelection?.isRecommended   ?? false
  const isStarred       = stars?.isStarredFn(file.id)   ?? false

  const previewTags       = (file.tags ?? []).slice(0, 3)
  const previewPerformers = (file.performer_tags ?? []).slice(0, 2)
  const previewBrands     = (file.brand_tags ?? []).slice(0, 2)

  // Long-press for mobile
  const longPressRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  function handleTouchStart(e: React.TouchEvent) {
    if (!onMenuTrigger) return
    const touch = e.touches[0]
    longPressRef.current = setTimeout(() => {
      onMenuTrigger(touch.clientX, touch.clientY, file)
    }, 500)
  }

  function cancelLongPress() {
    if (longPressRef.current !== null) {
      clearTimeout(longPressRef.current)
      longPressRef.current = null
    }
  }

  const hasMeta = previewTags.length > 0 || previewPerformers.length > 0 || previewBrands.length > 0

  return (
    <div
      role="button"
      tabIndex={0}
      className={clsx(
        'group relative flex flex-col bg-surface-0 rounded-lg overflow-hidden transition-all duration-150 focus:outline-none cursor-pointer',
        inSelectionMode
          ? [
              isSelected && isRecommended  && 'ring-2 ring-inset ring-amber-400 border border-amber-400/40',
              isSelected && !isRecommended && 'ring-2 ring-inset ring-white/70 border border-white/20',
              !isSelected                  && 'border border-[#1f1f1f] opacity-50 hover:opacity-80',
            ]
          : 'border border-[#1f1f1f] hover:border-[#333]'
      )}
      draggable={!inSelectionMode}
      onDragStart={(e) => {
        e.dataTransfer.setData('text/plain', file.id)
        e.dataTransfer.effectAllowed = 'move'
      }}
      onClick={onClick}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick() } }}
      onTouchStart={handleTouchStart}
      onTouchEnd={cancelLongPress}
      onTouchMove={cancelLongPress}
      aria-label={`${inSelectionMode ? (isSelected ? 'Deselect' : 'Select') : 'Open'} ${file.filename}`}
    >
      {/* ── Image area ────────────────────────────────────────────────── */}
      <div className="relative aspect-square overflow-hidden">
        {!loaded && <div className="absolute inset-0 bg-surface-0 animate-pulse" />}

        {/* Quick-select checkbox — top-left, visible on hover in normal mode */}
        {!inSelectionMode && onQuickSelect && (
          <button
            onClick={(e) => { e.stopPropagation(); onQuickSelect(file.id) }}
            aria-label="Select"
            className="absolute top-1.5 left-1.5 z-10 opacity-0 group-hover:opacity-100 transition-opacity duration-100"
          >
            <div className="w-[18px] h-[18px] rounded-sm border border-white/50 bg-black/50 flex items-center justify-center" />
          </button>
        )}

        {/* Quality score badge — top-right */}
        {file.quality_score != null && (
          <div className="absolute top-2 right-2 z-10">
            <ScorePill score={file.quality_score} />
          </div>
        )}

        {/* Star button — top-left (normal mode only) */}
        {!inSelectionMode && stars && (
          <button
            onClick={(e) => { e.stopPropagation(); stars.onToggle(file.id) }}
            aria-label={isStarred ? 'Unstar' : 'Star'}
            className={clsx(
              'absolute top-2 left-2 z-10 w-6 h-6 flex items-center justify-center rounded-full bg-black/30 transition-all',
              isStarred ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
            )}
          >
            <Star
              size={12}
              fill={isStarred ? 'currentColor' : 'none'}
              className={isStarred ? 'text-amber-400' : 'text-white/70'}
            />
          </button>
        )}

        {/* Selection checkmark — top-left (selection mode only) */}
        {inSelectionMode && isSelected && (
          <div className={clsx(
            'absolute top-2 left-2 z-10 w-5 h-5 rounded-full flex items-center justify-center',
            isRecommended ? 'bg-amber-400' : 'bg-white'
          )}>
            <Check size={11} className="text-black" strokeWidth={3} />
          </div>
        )}

        {/* "AI Pick" label */}
        {inSelectionMode && isSelected && isRecommended && (
          <div className="absolute bottom-2 left-2 z-10">
            <Pill variant="label">AI PICK</Pill>
          </div>
        )}

        {/* Hollow ring for recommended-but-deselected */}
        {inSelectionMode && !isSelected && isRecommended && (
          <div className="absolute top-2 left-2 z-10 w-5 h-5 rounded-full border border-amber-400/50 flex items-center justify-center">
            <span className="text-amber-400/60 text-[9px] leading-none">✦</span>
          </div>
        )}

        {/* Review status pill — bottom-left (normal mode, non-pending only) */}
        {!inSelectionMode && file.review_status && file.review_status !== 'pending' && (
          <div className="absolute bottom-2 left-2 z-10">
            {file.review_status === 'approved' && <Pill variant="approved">approved</Pill>}
            {file.review_status === 'rejected' && <Pill variant="flagged">flagged</Pill>}
            {file.review_status === 'held'     && <Pill variant="ghost">held</Pill>}
          </div>
        )}

        {file.file_type === 'video' ? (
          <div className="absolute inset-0 flex items-center justify-center bg-surface-0">
            <div className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="white">
                <polygon points="5,3 19,12 5,21" />
              </svg>
            </div>
          </div>
        ) : (
          <Image
            src={file.signed_url ?? file.public_url} alt={file.filename} fill
            sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
            className={clsx(
              'object-contain transition-opacity duration-300',
              loaded ? 'opacity-100' : 'opacity-0'
            )}
            onLoad={() => setLoaded(true)}
            unoptimized
          />
        )}

        {/* Hover overlay — only three-dot menu, no text */}
        {!inSelectionMode && onMenuTrigger && (
          <div className="absolute inset-0 z-20 pointer-events-none bg-black/0 group-hover:bg-black/40 transition-all flex items-start justify-end p-2 opacity-0 group-hover:opacity-100">
            <button
              className="pointer-events-auto w-6 h-6 flex items-center justify-center bg-black/50 hover:bg-black/70 rounded text-white/80 hover:text-white transition-colors"
              onClick={(e) => { e.stopPropagation(); onMenuTrigger(e.clientX, e.clientY, file) }}
              aria-label="Options"
            >
              <MoreHorizontal size={12} />
            </button>
          </div>
        )}

        {/* Selection-mode hover: empty ring */}
        {inSelectionMode && !isSelected && (
          <div className="absolute inset-0 bg-black/0 group-hover:bg-black/25 transition-all flex items-center justify-center opacity-0 group-hover:opacity-100">
            <div className="w-7 h-7 rounded-full border-2 border-white/60" />
          </div>
        )}
      </div>

      {/* ── Metadata below image ──────────────────────────────────────── */}
      {hasMeta && (
        <div style={{ padding: '4px 6px 5px', display: 'flex', flexWrap: 'wrap', gap: 3 }}>
          {previewPerformers.map((pt) => (
            <Pill key={pt.id} variant="tag">{pt.performers.name}</Pill>
          ))}
          {previewBrands.map((bt) => (
            <Pill key={bt.id} variant="tag">{bt.brands.name}</Pill>
          ))}
          {previewTags.map((t) => (
            <Pill key={t.id} variant="tag">{t.value}</Pill>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── MediaGrid ───────────────────────────────────────────────────────────────

export default function MediaGrid({ files, selection, compact, stars, folderProps, initialOpenPhotoId, event, onTrash, onQuickSelect }: Props) {
  const [rotation, setRotation] = useState(0)
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null)
  const [contextMenu, setContextMenu]     = useState<ContextMenuState | null>(null)

  // Deep-link: open lightbox for the specified photo on first render
  useEffect(() => {
    if (!initialOpenPhotoId) return
    const idx = files.findIndex((f) => f.id === initialOpenPhotoId)
    if (idx !== -1) setLightboxIndex(idx)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const handleNavigate = useCallback((i: number) => setLightboxIndex(i), [])
  const handleClose    = useCallback(() => setLightboxIndex(null), [])

  const handleMenuTrigger = useCallback((x: number, y: number, file: MediaFileWithTags) => {
    if (!folderProps) return
    const fp = folderProps(file)
    if (!fp || fp.folders.length === 0) return
    setContextMenu({ x, y, fileId: file.id, folderProps: fp })
  }, [folderProps])

  if (files.length === 0) return null

  return (
    <>
      <div className={clsx(
        'grid gap-2',
        compact
          ? 'grid-cols-2 sm:grid-cols-3'
          : 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-4'
      )}>
        {files.map((file, i) => (
          <MediaCell
            key={file.id}
            file={file}
            onClick={
              selection
                ? () => selection.onToggle(file.id)
                : () => setLightboxIndex(i)
            }
            cellSelection={
              selection
                ? {
                    isSelected:    selection.selectedIds.has(file.id),
                    isRecommended: selection.recommendedIds.has(file.id),
                  }
                : undefined
            }
            stars={stars}
            onMenuTrigger={folderProps ? handleMenuTrigger : undefined}
            onQuickSelect={onQuickSelect}
          />
        ))}
      </div>

      {/* Lightbox — normal mode only */}
      {!selection && lightboxIndex !== null && (
        <Lightbox
          files={files}
          index={lightboxIndex}
          onClose={handleClose}
          onNavigate={handleNavigate}
          stars={stars}
          folderProps={folderProps ? folderProps(files[lightboxIndex]) : undefined}
          event={event}
          onTrash={onTrash}
        />
      )}

      {/* Context menu portal */}
      {contextMenu && (
        <ContextMenu
          state={contextMenu}
          onClose={() => setContextMenu(null)}
        />
      )}
    </>
  )
}
