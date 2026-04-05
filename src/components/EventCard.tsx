'use client'

import { useState, useRef, useEffect } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import { createPortal } from 'react-dom'
import type { Event } from '@/types'
import { Calendar, MapPin, Building2, ImageIcon, Clock, MoreHorizontal, Pencil, Trash2, ImagePlus } from 'lucide-react'
import EventCoverPicker from '@/components/EventCoverPicker'
import { transformUrl } from '@/lib/supabase/storage'

interface Props {
  event: Event
  photoCount?: number
  folderCount?: number
  role?: string
}

const PLACEHOLDER_GRADIENTS = [
  'from-violet-900/50 to-indigo-900/50',
  'from-rose-900/50 to-orange-900/50',
  'from-cyan-900/50 to-teal-900/50',
  'from-amber-900/50 to-yellow-900/50',
  'from-fuchsia-900/50 to-pink-900/50',
  'from-emerald-900/50 to-green-900/50',
]

function getGradient(id: string): string {
  return PLACEHOLDER_GRADIENTS[id.charCodeAt(0) % PLACEHOLDER_GRADIENTS.length]
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-GB', {
    day: 'numeric', month: 'short', year: 'numeric',
  })
}

function formatRelative(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const days = Math.floor(diff / 86_400_000)
  if (days === 0) return 'Today'
  if (days === 1) return 'Yesterday'
  if (days < 7)  return `${days} days ago`
  if (days < 30) return `${Math.floor(days / 7)} week${days >= 14 ? 's' : ''} ago`
  if (days < 365) return `${Math.floor(days / 30)} month${days >= 60 ? 's' : ''} ago`
  return `${Math.floor(days / 365)} year${days >= 730 ? 's' : ''} ago`
}

export default function EventCard({ event, photoCount = 0, folderCount = 0, role }: Props) {
  const router             = useRouter()
  const gradient           = getGradient(event.id)
  const photographerCount  = event.photographers?.length ?? 0

  const [menuOpen, setMenuOpen]           = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting]           = useState(false)
  const [coverPickerOpen, setCoverPickerOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  // Close dropdown on outside click / Escape
  useEffect(() => {
    if (!menuOpen) return
    function onDown(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false)
    }
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') setMenuOpen(false) }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [menuOpen])

  async function handleDelete() {
    setDeleting(true)
    try {
      await fetch('/api/trash', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'event', id: event.id }),
      })
      router.refresh()
    } finally {
      setDeleting(false)
      setConfirmDelete(false)
    }
  }

  return (
    <div className="group relative bg-[#111111] border border-[#1f1f1f] rounded-xl overflow-visible hover:border-[#2a2a2a] hover:bg-[#141414] transition-all duration-200">

      {/* ── Main link ─────────────────────────────────────────────────────── */}
      <Link href={`/events/${event.id}`} className="block rounded-xl overflow-hidden">
        {/* Cover image */}
        <div className="relative aspect-[16/10] w-full overflow-hidden bg-[#0d0d0d]">
          {event.cover_image_url ? (
            <Image
              src={transformUrl(event.cover_image_url, 400)}
              alt={event.name}
              fill
              sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 25vw"
              className="object-cover group-hover:scale-[1.03] transition-transform duration-500"
            />
          ) : (
            <div className={`w-full h-full bg-gradient-to-br ${gradient} flex items-center justify-center`}>
              <ImageIcon size={28} className="text-white/15" />
            </div>
          )}

          {/* Change cover button — admin only, appears on hover */}
          {role === 'admin' && (
            <button
              onClick={(e) => { e.preventDefault(); e.stopPropagation(); setCoverPickerOpen(true) }}
              className="absolute bottom-2.5 left-2.5 flex items-center gap-1.5 bg-black/65 backdrop-blur-sm text-white/80 hover:text-white text-[11px] font-medium px-2 py-1 rounded-md opacity-0 group-hover:opacity-100 transition-opacity"
            >
              <ImagePlus size={10} />
              Change cover
            </button>
          )}

          {/* File count badge */}
          {event.media_count > 0 && (
            <div className="absolute bottom-2.5 right-2.5 flex items-center gap-1 bg-black/65 backdrop-blur-sm text-white/80 text-[11px] font-medium px-2 py-1 rounded-md">
              <ImageIcon size={10} />
              {event.media_count.toLocaleString()}
            </div>
          )}
        </div>

        {/* Card body */}
        <div className="p-4">
          <h3 className="text-white text-sm font-semibold truncate mb-2.5 leading-snug">
            {event.name}
          </h3>

          <div className="space-y-1.5 text-[#666] text-xs">
            <div className="flex items-center gap-1.5">
              <Calendar size={11} className="shrink-0" />
              <span className="text-[#888]">{formatDate(event.date)}</span>
            </div>

            {event.venue && (
              <div className="flex items-center gap-1.5">
                <Building2 size={11} className="shrink-0" />
                <span className="truncate">{event.venue}</span>
              </div>
            )}

            {event.location && (
              <div className="flex items-center gap-1.5">
                <MapPin size={11} className="shrink-0" />
                <span className="truncate">{event.location}</span>
              </div>
            )}
          </div>

          {/* Stats pills */}
          <div className="flex flex-wrap gap-1.5 mt-2.5">
            {photoCount > 0 && (
              <span className="text-[10px] text-[#555] bg-[#161616] border border-[#1e1e1e] px-2 py-0.5 rounded-full tabular-nums">
                {photoCount.toLocaleString()} photo{photoCount !== 1 ? 's' : ''}
              </span>
            )}
            {photographerCount > 0 && (
              <span className="text-[10px] text-[#555] bg-[#161616] border border-[#1e1e1e] px-2 py-0.5 rounded-full tabular-nums">
                {photographerCount === 1
                  ? event.photographers[0]
                  : `${photographerCount} photographers`}
              </span>
            )}
            {folderCount > 0 && (
              <span className="text-[10px] text-[#555] bg-[#161616] border border-[#1e1e1e] px-2 py-0.5 rounded-full tabular-nums">
                {folderCount} folder{folderCount !== 1 ? 's' : ''}
              </span>
            )}
          </div>

          {/* Footer: relative timestamp */}
          <div className="mt-3 pt-3 border-t border-[#1a1a1a] flex items-center gap-1 text-[#3a3a3a] text-[10px]">
            <Clock size={9} className="shrink-0" />
            <span>{formatRelative(event.created_at)}</span>
          </div>
        </div>
      </Link>

      {/* ── Three-dot menu ────────────────────────────────────────────────── */}
      <div ref={menuRef} className="absolute top-2 right-2 z-20">
        <button
          onClick={(e) => { e.preventDefault(); e.stopPropagation(); setMenuOpen((v) => !v) }}
          className="w-7 h-7 flex items-center justify-center bg-black/60 backdrop-blur-sm rounded-md text-white/70 hover:text-white opacity-0 group-hover:opacity-100 transition-opacity"
          aria-label="Event options"
        >
          <MoreHorizontal size={14} />
        </button>

        {menuOpen && (
          <div className="absolute top-9 right-0 w-44 bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg shadow-2xl py-1 z-30">
            <Link
              href={`/events/${event.id}/edit`}
              onClick={() => setMenuOpen(false)}
              className="flex items-center gap-2.5 w-full px-3 py-2 text-sm text-[#888] hover:text-white hover:bg-white/4 transition-colors"
            >
              <Pencil size={13} className="shrink-0" />
              Edit event
            </Link>
            <button
              onClick={() => { setMenuOpen(false); setConfirmDelete(true) }}
              className="flex items-center gap-2.5 w-full text-left px-3 py-2 text-sm text-red-400/80 hover:text-red-400 hover:bg-white/4 transition-colors"
            >
              <Trash2 size={13} className="shrink-0" />
              Delete event
            </button>
          </div>
        )}
      </div>

      {/* ── Cover picker ──────────────────────────────────────────────────── */}
      {coverPickerOpen && (
        <EventCoverPicker eventId={event.id} onClose={() => setCoverPickerOpen(false)} />
      )}

      {/* ── Delete confirmation dialog ────────────────────────────────────── */}
      {confirmDelete && createPortal(
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70"
          onClick={() => !deleting && setConfirmDelete(false)}
        >
          <div
            className="bg-[#141414] border border-[#2a2a2a] rounded-xl p-6 max-w-sm w-full mx-4 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-white text-base font-semibold mb-2">Move to trash?</h2>
            <p className="text-[#888] text-sm leading-relaxed mb-5">
              <span className="text-white font-medium">{event.name}</span> will be moved to trash. You can restore it from the trash page within 30 days.
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setConfirmDelete(false)}
                disabled={deleting}
                className="px-4 py-2 text-sm text-[#888] hover:text-white border border-[#2a2a2a] hover:border-[#444] rounded-lg transition-colors disabled:opacity-40"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="px-4 py-2 text-sm font-medium bg-red-500/90 hover:bg-red-500 text-white rounded-lg transition-colors disabled:opacity-50"
              >
                {deleting ? 'Moving…' : 'Move to trash'}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  )
}
