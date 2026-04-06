'use client'

import { useState, useCallback, useMemo, useRef } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import {
  Trash2, Scan, AlertTriangle, Loader2, Plus, Tag as TagIcon, Upload, CheckCircle2,
} from 'lucide-react'
import type { Brand, MediaFileWithTags } from '@/types'

interface Props {
  eventId: string
  initialBrands: Brand[]
  mediaFiles: MediaFileWithTags[]
}

interface ScanState {
  phase: 'idle' | 'scanning' | 'done'
  done: number
  total: number
  tagsFound: number
}

export default function BrandsTab({ eventId, initialBrands, mediaFiles }: Props) {
  const router = useRouter()

  const [brands, setBrands]                       = useState<Brand[]>(initialBrands)
  const [scanState, setScanState]                 = useState<ScanState>({ phase: 'idle', done: 0, total: 0, tagsFound: 0 })
  const [adding, setAdding]                       = useState(false)
  const [draftName, setDraftName]                 = useState('')
  const [saving, setSaving]                       = useState(false)
  const [uploadingRef, setUploadingRef]           = useState<string | null>(null)
  const fileInputRef    = useRef<HTMLInputElement>(null)
  const fileTargetId    = useRef<string | null>(null)

  const brandPhotoCounts = useMemo(() => {
    const counts: Record<string, number> = {}
    for (const file of mediaFiles) {
      for (const bt of file.brand_tags ?? []) {
        counts[bt.brand_id] = (counts[bt.brand_id] ?? 0) + 1
      }
    }
    return counts
  }, [mediaFiles])

  const unscannedFiles = useMemo(
    () => mediaFiles.filter((f) => f.file_type === 'image' && !f.brand_scanned),
    [mediaFiles]
  )

  const brandsWithRef = brands.filter((b) => b.reference_url)

  // ── Add brand ──────────────────────────────────────────────────────────────

  async function submitAdd() {
    if (!draftName.trim() || saving) return
    setSaving(true)
    try {
      const res  = await fetch('/api/brands', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ event_id: eventId, name: draftName.trim() }),
      })
      const json = await res.json() as { brand?: Brand }
      if (json.brand) setBrands((prev) => [...prev, json.brand!])
      setDraftName('')
      setAdding(false)
    } finally {
      setSaving(false)
    }
  }

  async function deleteBrand(id: string) {
    await fetch(`/api/brands/${id}`, { method: 'DELETE' })
    setBrands((prev) => prev.filter((b) => b.id !== id))
    router.refresh()
  }

  // ── Logo upload ────────────────────────────────────────────────────────────

  function openLogoUpload(brandId: string) {
    fileTargetId.current = brandId
    fileInputRef.current?.click()
  }

  async function handleLogoFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file   = e.target.files?.[0]
    const brandId = fileTargetId.current
    if (!file || !brandId) return
    e.target.value = ''
    setUploadingRef(brandId)
    try {
      const formData = new FormData()
      formData.append('file', file)
      const res  = await fetch(`/api/brands/${brandId}/reference`, { method: 'POST', body: formData })
      const json = await res.json() as { brand?: Brand }
      if (json.brand) setBrands((prev) => prev.map((b) => b.id === brandId ? json.brand! : b))
    } finally {
      setUploadingRef(null)
      fileTargetId.current = null
    }
  }

  // ── Brand scan ─────────────────────────────────────────────────────────────

  const startScan = useCallback(async () => {
    if (!brandsWithRef.length || !unscannedFiles.length) return
    setScanState({ phase: 'scanning', done: 0, total: unscannedFiles.length, tagsFound: 0 })
    let tagsFound = 0
    for (let i = 0; i < unscannedFiles.length; i++) {
      const file = unscannedFiles[i]
      try {
        const res  = await fetch('/api/brand-scan', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ event_id: eventId, media_file_id: file.id }),
        })
        const json = await res.json() as { tags_created?: number }
        tagsFound += json.tags_created ?? 0
      } catch { /* skip */ }
      setScanState({ phase: 'scanning', done: i + 1, total: unscannedFiles.length, tagsFound })
    }
    setScanState((prev) => ({ ...prev, phase: 'done' }))
    router.refresh()
  }, [brandsWithRef.length, unscannedFiles, eventId, router])

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleLogoFile} />

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-white text-sm font-medium">
            {brands.length} brand{brands.length !== 1 ? 's' : ''}
          </p>
          <p className="text-[#555] text-xs mt-0.5">
            Upload logos to track brand visibility across event photos
          </p>
        </div>
        <button
          onClick={() => setAdding(true)}
          className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 bg-white text-black font-medium rounded-lg hover:bg-white/90 transition-all"
        >
          <Plus size={13} />
          Add brand
        </button>
      </div>

      {/* Add form */}
      {adding && (
        <div className="bg-surface-0 border border-[#1f1f1f] rounded-lg p-4 space-y-3">
          <p className="text-white text-sm font-medium">New brand</p>
          <input
            autoFocus
            value={draftName}
            onChange={(e) => setDraftName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') submitAdd()
              if (e.key === 'Escape') { setAdding(false); setDraftName('') }
            }}
            placeholder="Brand name (e.g. Red Bull, Nike)"
            className="w-full bg-surface-0 border border-[#2a2a2a] text-white text-sm px-3 py-2 rounded-lg placeholder:text-[#444] focus:outline-none focus:border-[#444] transition-colors"
          />
          <div className="flex items-center gap-2">
            <button
              onClick={submitAdd}
              disabled={!draftName.trim() || saving}
              className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 bg-white text-black font-medium rounded-lg hover:bg-white/90 disabled:opacity-40 transition-all"
            >
              {saving ? <Loader2 size={12} className="animate-spin" /> : <CheckCircle2 size={12} />}
              Add
            </button>
            <button
              onClick={() => { setAdding(false); setDraftName('') }}
              className="text-xs text-[#555] hover:text-white transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Brand cards */}
      {brands.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {brands.map((brand) => {
            const count       = brandPhotoCounts[brand.id] ?? 0
            const isUploading = uploadingRef === brand.id

            return (
              <div key={brand.id} className="bg-surface-0 border border-[#1f1f1f] rounded-lg p-4 flex items-start gap-3">
                <div className="w-12 h-12 rounded-lg shrink-0 bg-surface-0 border border-[#222] overflow-hidden flex items-center justify-center relative">
                  {isUploading ? (
                    <Loader2 size={16} className="text-[#555] animate-spin" />
                  ) : brand.reference_url ? (
                    <Image src={brand.reference_url} alt={brand.name} fill className="object-contain p-1" unoptimized />
                  ) : (
                    <TagIcon size={18} className="text-[#333]" />
                  )}
                </div>

                <div className="flex-1 min-w-0">
                  <p className="text-white text-sm font-medium truncate">{brand.name}</p>
                  <div className="flex items-center gap-3 mt-1.5">
                    <span className="text-[#444] text-xs tabular-nums">
                      {count} photo{count !== 1 ? 's' : ''}
                    </span>
                    <button
                      onClick={() => openLogoUpload(brand.id)}
                      disabled={isUploading}
                      className="inline-flex items-center gap-1 text-[10px] text-[#555] hover:text-white transition-colors disabled:opacity-40"
                    >
                      <Upload size={10} />
                      {brand.reference_url ? 'Change logo' : 'Upload logo'}
                    </button>
                  </div>
                  {!brand.reference_url && (
                    <p className="text-orange-400/70 text-[10px] mt-1.5 flex items-center gap-1">
                      <AlertTriangle size={9} />
                      Logo needed for scanning
                    </p>
                  )}
                </div>

                <button
                  onClick={() => deleteBrand(brand.id)}
                  className="text-[#333] hover:text-red-400 transition-colors shrink-0 mt-0.5"
                  aria-label="Delete brand"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            )
          })}
        </div>
      )}

      {brands.length === 0 && !adding && (
        <div className="flex flex-col items-center justify-center py-16 border border-dashed border-[#1f1f1f] rounded-lg text-center">
          <TagIcon size={28} className="text-[#333] mb-3" />
          <p className="text-[#555] text-sm">No brands added yet</p>
          <p className="text-[#3a3a3a] text-xs mt-1">Add a brand then upload its logo to start scanning</p>
        </div>
      )}

      {/* Scan controls */}
      {brandsWithRef.length > 0 && (
        <div className="bg-surface-0 border border-[#1f1f1f] rounded-lg p-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-white text-sm font-medium">Scan for brands</p>
              <p className="text-[#555] text-xs mt-1">
                {unscannedFiles.length > 0
                  ? `${unscannedFiles.length} photo${unscannedFiles.length !== 1 ? 's' : ''} not yet scanned`
                  : 'All photos have been scanned'}
                {scanState.phase === 'done' && (
                  <span className="text-orange-400 ml-2">
                    · Found {scanState.tagsFound} match{scanState.tagsFound !== 1 ? 'es' : ''}
                  </span>
                )}
              </p>
            </div>
            {scanState.phase !== 'scanning' && unscannedFiles.length > 0 && (
              <button
                onClick={startScan}
                className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 border border-[#1f1f1f] text-[#555] hover:text-white hover:border-[#333] rounded-lg transition-all shrink-0"
              >
                <Scan size={13} />
                Scan now
              </button>
            )}
          </div>

          {scanState.phase === 'scanning' && (
            <div className="mt-3 space-y-2">
              <div className="flex items-center gap-2.5">
                <div className="flex-1 h-1.5 bg-surface-0 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-orange-500 rounded-full transition-all duration-300"
                    style={{ width: `${Math.round((scanState.done / scanState.total) * 100)}%` }}
                  />
                </div>
                <span className="text-[#555] text-xs tabular-nums shrink-0">
                  {scanState.done}/{scanState.total}
                </span>
              </div>
              <p className="text-[#444] text-xs">
                Scanning {scanState.done} of {scanState.total} photos
                {scanState.tagsFound > 0 && (
                  <span className="text-orange-400 ml-2">· {scanState.tagsFound} matches so far</span>
                )}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
