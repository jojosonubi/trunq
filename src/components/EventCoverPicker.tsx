'use client'

import { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import { X, Check, Upload, ImageIcon, Loader2 } from 'lucide-react'

interface GalleryPhoto {
  id: string
  storage_path: string
  signed_url: string
}

interface Props {
  eventId: string
  onClose: () => void
}

export default function EventCoverPicker({ eventId, onClose }: Props) {
  const router = useRouter()
  const [tab, setTab] = useState<'gallery' | 'upload'>('gallery')
  const [photos, setPhotos] = useState<GalleryPhoto[]>([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [uploadFile, setUploadFile] = useState<File | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    fetch(`/api/projects/${eventId}/covers`)
      .then((r) => r.json())
      .then((d) => { setPhotos(d.photos ?? []); setLoading(false) })
      .catch(() => setLoading(false))
  }, [eventId])

  useEffect(() => {
    if (!uploadFile) { setPreviewUrl(null); return }
    const url = URL.createObjectURL(uploadFile)
    setPreviewUrl(url)
    return () => URL.revokeObjectURL(url)
  }, [uploadFile])

  async function save() {
    setSaving(true)
    try {
      if (tab === 'gallery' && selected) {
        await fetch(`/api/projects/${eventId}/cover`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ storage_path: selected }),
        })
      } else if (tab === 'upload' && uploadFile) {
        const fd = new FormData()
        fd.append('file', uploadFile)
        await fetch(`/api/projects/${eventId}/cover`, { method: 'POST', body: fd })
      }
      router.refresh()
      onClose()
    } finally {
      setSaving(false)
    }
  }

  const canSave = (tab === 'gallery' && !!selected) || (tab === 'upload' && !!uploadFile)

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm"
      onClick={() => !saving && onClose()}
    >
      <div
        className="bg-surface-0 border border-[#2a2a2a] rounded-xl shadow-2xl w-full max-w-2xl mx-4 flex flex-col max-h-[85vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#1f1f1f] shrink-0">
          <h2 className="text-white text-sm font-semibold">Change cover</h2>
          <button
            onClick={onClose}
            disabled={saving}
            className="text-[#555] hover:text-white transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex gap-0 px-5 pt-4 shrink-0">
          {(['gallery', 'upload'] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-4 py-1.5 text-xs font-medium rounded-lg transition-colors capitalize ${
                tab === t
                  ? 'bg-white/8 text-white'
                  : 'text-[#555] hover:text-[#888]'
              }`}
            >
              {t === 'gallery' ? 'From gallery' : 'Upload image'}
            </button>
          ))}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {tab === 'gallery' && (
            <>
              {loading && (
                <div className="flex items-center justify-center py-16">
                  <Loader2 size={20} className="text-[#444] animate-spin" />
                </div>
              )}
              {!loading && photos.length === 0 && (
                <div className="flex flex-col items-center justify-center py-16 text-center">
                  <ImageIcon size={28} className="text-[#333] mb-3" />
                  <p className="text-[#555] text-sm">No photos in this event yet.</p>
                </div>
              )}
              {!loading && photos.length > 0 && (
                <div className="grid grid-cols-4 sm:grid-cols-5 gap-2">
                  {photos.map((photo) => {
                    const isSelected = selected === photo.storage_path
                    return (
                      <button
                        key={photo.id}
                        onClick={() => setSelected(photo.storage_path)}
                        className={`relative aspect-square rounded-lg overflow-hidden border-2 transition-all ${
                          isSelected
                            ? 'border-white scale-[0.97]'
                            : 'border-transparent hover:border-white/30'
                        }`}
                      >
                        <Image
                          src={photo.signed_url}
                          alt=""
                          fill
                          className="object-cover"
                          unoptimized
                          sizes="120px"
                        />
                        {isSelected && (
                          <div className="absolute inset-0 bg-white/20 flex items-center justify-center">
                            <Check size={18} className="text-white drop-shadow" />
                          </div>
                        )}
                      </button>
                    )
                  })}
                </div>
              )}
            </>
          )}

          {tab === 'upload' && (
            <div className="flex flex-col items-center gap-4">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => setUploadFile(e.target.files?.[0] ?? null)}
              />
              {previewUrl ? (
                <div className="relative w-full aspect-[16/10] rounded-xl overflow-hidden bg-surface-0">
                  <Image src={previewUrl} alt="" fill className="object-cover" unoptimized sizes="600px" />
                  <button
                    onClick={() => { setUploadFile(null); fileInputRef.current && (fileInputRef.current.value = '') }}
                    className="absolute top-2 right-2 w-7 h-7 flex items-center justify-center bg-black/60 rounded-md text-white/70 hover:text-white transition-colors"
                  >
                    <X size={13} />
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full border-2 border-dashed border-[#2a2a2a] hover:border-[#444] rounded-xl py-16 flex flex-col items-center gap-3 transition-colors"
                >
                  <Upload size={22} className="text-[#444]" />
                  <span className="text-[#555] text-sm">Click to choose an image</span>
                  <span className="text-[#333] text-xs">JPG, PNG, WebP</span>
                </button>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-5 py-4 border-t border-[#1f1f1f] shrink-0">
          <button
            onClick={onClose}
            disabled={saving}
            className="px-4 py-2 text-sm text-[#888] hover:text-white border border-[#2a2a2a] hover:border-[#444] rounded-lg transition-colors disabled:opacity-40"
          >
            Cancel
          </button>
          <button
            onClick={save}
            disabled={!canSave || saving}
            className="px-4 py-2 text-sm font-medium bg-white text-black rounded-lg hover:bg-white/90 transition-colors disabled:opacity-30 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {saving && <Loader2 size={13} className="animate-spin" />}
            {saving ? 'Saving…' : 'Set as cover'}
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}
