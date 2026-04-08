'use client'

import { useState, useMemo, useCallback } from 'react'
import Image from 'next/image'
import { Check, Copy } from 'lucide-react'
import Sidebar from '@/components/layout/Sidebar'
import { ScorePill } from '@/components/ui/Pill'

// ─── Types ────────────────────────────────────────────────────────────────────

interface DeliveryLinkRow {
  id:          string
  event_id:    string
  token:       string
  created_at:  string
  expires_at?: string | null
  events:      { id: string; name: string; date: string } | null
}

interface ApprovedPhoto {
  id:               string
  event_id:         string
  filename:         string
  storage_path:     string
  public_url:       string
  file_type:        string
  quality_score:    number | null
  dominant_colours: string[]
  tags?:            { value: string; tag_type: string }[]
  signed_url?:      string
}

interface Props {
  links:  DeliveryLinkRow[]
  events: { id: string; name: string }[]
  photos: ApprovedPhoto[]
}

// ─── Constants ────────────────────────────────────────────────────────────────

const COLOUR_DOTS = [
  { hex: '#c0392b', name: 'red'    },
  { hex: '#e67e22', name: 'orange' },
  { hex: '#f1c40f', name: 'yellow' },
  { hex: '#27ae60', name: 'green'  },
  { hex: '#2980b9', name: 'blue'   },
  { hex: '#8e44ad', name: 'purple' },
  { hex: '#1a1a1a', name: 'black'  },
  { hex: '#f4ebdc', name: 'brown'  },
] as const

const EXPIRE_OPTIONS = ['7 days', '30 days', 'Never'] as const

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

function deliveryUrl(token: string) {
  if (typeof window === 'undefined') return `/delivery/${token}`
  return `${window.location.origin}/delivery/${token}`
}

function isExpired(expiresAt: string | null | undefined) {
  if (!expiresAt) return false
  return new Date(expiresAt) < new Date()
}

// ─── Shared styles ────────────────────────────────────────────────────────────

const SECTION_HEAD: React.CSSProperties = {
  fontSize:      9,
  textTransform: 'uppercase',
  letterSpacing: '0.1em',
  color:         'var(--text-dim)',
  marginBottom:  8,
  fontWeight:    500,
}

const CHIP_BASE: React.CSSProperties = {
  fontSize:     9,
  padding:      '3px 8px',
  borderRadius: 2,
  border:       '0.5px solid var(--surface-3)',
  color:        'var(--text-secondary)',
  background:   'transparent',
  cursor:       'pointer',
  fontFamily:   'inherit',
  transition:   'background 0.1s, color 0.1s, border-color 0.1s',
}

const CHIP_ACTIVE: React.CSSProperties = {
  background:   'var(--accent-bg)',
  color:        'var(--accent)',
  borderColor:  'var(--accent-border)',
}

function chip(active: boolean): React.CSSProperties {
  return active ? { ...CHIP_BASE, ...CHIP_ACTIVE } : CHIP_BASE
}

// ─── Inline components ────────────────────────────────────────────────────────

function CheckCircle() {
  return (
    <div style={{
      position:       'absolute',
      top:            4,
      left:           4,
      width:          14,
      height:         14,
      borderRadius:   '50%',
      background:     'var(--accent)',
      display:        'flex',
      alignItems:     'center',
      justifyContent: 'center',
      zIndex:         2,
    }}>
      <Check size={8} color="#fff" strokeWidth={3} />
    </div>
  )
}

// ─── Left panel (Build collection) ───────────────────────────────────────────

interface LeftPanelProps {
  events:           { id: string; name: string }[]
  selectedProjects: Set<string>
  onToggleProject:  (id: string) => void
  allProjects:      boolean
  onAllProjects:    () => void
  availableTags:    string[]
  selectedTags:     Set<string>
  onToggleTag:      (tag: string) => void
  selectedColour:   string | null
  onToggleColour:   (name: string) => void
  minScore:         number
  maxScore:         number
  onMinScore:       (v: number) => void
  onMaxScore:       (v: number) => void
  expires:          string
  onExpires:        (v: string) => void
  collectionName:   string
  onCollectionName: (v: string) => void
  generating:       boolean
  canGenerate:      boolean
  onGenerate:       () => void
  generatedLinks:   { eventName: string; token: string }[]
}

function LeftPanel({
  events, selectedProjects, onToggleProject, allProjects, onAllProjects,
  availableTags, selectedTags, onToggleTag,
  selectedColour, onToggleColour,
  minScore, maxScore, onMinScore, onMaxScore,
  expires, onExpires,
  collectionName, onCollectionName,
  generating, canGenerate, onGenerate,
  generatedLinks,
}: LeftPanelProps) {
  const [copiedToken, setCopiedToken] = useState<string | null>(null)

  function copyLink(token: string) {
    navigator.clipboard.writeText(deliveryUrl(token))
    setCopiedToken(token)
    setTimeout(() => setCopiedToken(null), 2000)
  }

  const inputStyle: React.CSSProperties = {
    width:        '100%',
    background:   'var(--surface-0)',
    border:       'var(--border-rule)',
    borderRadius: 2,
    padding:      '6px 8px',
    fontSize:     11,
    color:        'var(--text-primary)',
    fontFamily:   'inherit',
    outline:      'none',
    boxSizing:    'border-box',
  }

  const scoreInputStyle: React.CSSProperties = {
    width:       52,
    padding:     '4px 6px',
    background:  'var(--surface-0)',
    border:      '0.5px solid var(--surface-3)',
    borderRadius: 2,
    fontSize:    10,
    textAlign:   'center',
    color:       'var(--text-primary)',
    fontFamily:  'inherit',
    outline:     'none',
  }

  return (
    <div style={{
      width:       280,
      flexShrink:  0,
      background:  'var(--surface-1)',
      borderRight: '0.5px solid var(--surface-3)',
      padding:     16,
      overflowY:   'auto',
    }}>
      {/* Panel header */}
      <div style={{
        fontSize:      8,
        textTransform: 'uppercase',
        letterSpacing: '0.14em',
        color:         'var(--text-muted)',
        borderBottom:  'var(--border-rule)',
        paddingBottom: 6,
        marginBottom:  14,
      }}>
        Build collection
      </div>

      {/* ── NAME ── */}
      <div style={{ marginBottom: 16 }}>
        <div style={SECTION_HEAD}>Name</div>
        <input
          type="text"
          value={collectionName}
          onChange={(e) => onCollectionName(e.target.value)}
          placeholder="e.g. Recessland — press highlights"
          style={inputStyle}
          onFocus={(e) => { e.currentTarget.style.borderColor = 'var(--accent)' }}
          onBlur={(e)  => { e.currentTarget.style.borderColor = '' }}
        />
      </div>

      {/* ── PROJECT ── */}
      <div style={{ marginBottom: 16 }}>
        <div style={SECTION_HEAD}>Project</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
          <button
            onClick={onAllProjects}
            style={chip(allProjects)}
          >
            All projects
          </button>
          {events.map((ev) => (
            <button
              key={ev.id}
              onClick={() => onToggleProject(ev.id)}
              style={chip(selectedProjects.has(ev.id))}
            >
              {ev.name}
            </button>
          ))}
        </div>
      </div>

      {/* ── THEME / TAG ── */}
      {availableTags.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <div style={SECTION_HEAD}>Theme / Tag</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
            {availableTags.map((tag) => (
              <button
                key={tag}
                onClick={() => onToggleTag(tag)}
                style={chip(selectedTags.has(tag))}
              >
                {tag}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── DOMINANT COLOUR ── */}
      <div style={{ marginBottom: 16 }}>
        <div style={SECTION_HEAD}>Dominant colour</div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {COLOUR_DOTS.map((c) => (
            <button
              key={c.name}
              title={c.name}
              onClick={() => onToggleColour(c.name)}
              style={{
                width:        20,
                height:       20,
                borderRadius: '50%',
                background:   c.hex,
                border:       selectedColour === c.name
                  ? '2px solid var(--accent)'
                  : '2px solid transparent',
                cursor:       'pointer',
                padding:      0,
                outline:      'none',
                flexShrink:   0,
              }}
            />
          ))}
        </div>
      </div>

      {/* ── AI SCORE RANGE ── */}
      <div style={{ marginBottom: 16 }}>
        <div style={SECTION_HEAD}>AI score range</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <input
            type="number"
            min={0} max={100}
            value={minScore}
            onChange={(e) => onMinScore(Number(e.target.value))}
            style={scoreInputStyle}
          />
          <span style={{ fontSize: 10, color: 'var(--text-dim)' }}>—</span>
          <input
            type="number"
            min={0} max={100}
            value={maxScore}
            onChange={(e) => onMaxScore(Number(e.target.value))}
            style={scoreInputStyle}
          />
        </div>
      </div>

      {/* ── EXPIRES ── */}
      <div style={{ marginBottom: 16 }}>
        <div style={SECTION_HEAD}>Expires</div>
        <div style={{ display: 'flex' }}>
          {EXPIRE_OPTIONS.map((opt, i) => (
            <button
              key={opt}
              onClick={() => onExpires(opt)}
              style={{
                flex:         1,
                padding:      '4px 0',
                fontSize:     9,
                fontFamily:   'inherit',
                cursor:       'pointer',
                background:   expires === opt ? 'var(--surface-2)' : 'transparent',
                color:        expires === opt ? 'var(--text-primary)' : 'var(--text-secondary)',
                border:       '0.5px solid var(--surface-3)',
                borderLeft:   i > 0 ? 'none' : '0.5px solid var(--surface-3)',
                borderRadius: i === 0 ? '2px 0 0 2px' : i === EXPIRE_OPTIONS.length - 1 ? '0 2px 2px 0' : 0,
                transition:   'background 0.1s, color 0.1s',
              }}
            >
              {opt}
            </button>
          ))}
        </div>
      </div>

      {/* ── GENERATE ── */}
      {generatedLinks.length === 0 ? (
        <button
          onClick={onGenerate}
          disabled={!canGenerate || generating}
          style={{
            width:        '100%',
            padding:      10,
            background:   'var(--accent)',
            color:        '#fff',
            border:       'none',
            borderRadius: 2,
            fontSize:     11,
            fontWeight:   500,
            cursor:       !canGenerate || generating ? 'not-allowed' : 'pointer',
            opacity:      !canGenerate || generating ? 0.5 : 1,
            fontFamily:   'inherit',
            marginTop:    12,
            transition:   'opacity 0.15s',
          }}
        >
          {generating
            ? 'Generating…'
            : selectedProjects.size > 1
            ? `Generate ${selectedProjects.size} links`
            : 'Generate delivery link'
          }
        </button>
      ) : (
        <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
          {generatedLinks.map(({ eventName, token }) => (
            <div key={token}>
              {generatedLinks.length > 1 && (
                <div style={{ fontSize: 9, color: 'var(--text-muted)', marginBottom: 3 }}>{eventName}</div>
              )}
              <div style={{ display: 'flex', gap: 6 }}>
                <input
                  readOnly
                  value={deliveryUrl(token)}
                  style={{
                    flex:         1,
                    minWidth:     0,
                    background:   'var(--surface-1)',
                    border:       'var(--border-rule)',
                    borderRadius: 2,
                    padding:      '6px 8px',
                    fontSize:     10,
                    color:        'var(--text-primary)',
                    fontFamily:   'monospace',
                    outline:      'none',
                  }}
                />
                <button
                  onClick={() => copyLink(token)}
                  style={{
                    display:      'inline-flex',
                    alignItems:   'center',
                    gap:          4,
                    padding:      '6px 9px',
                    background:   'transparent',
                    border:       '0.5px solid var(--surface-3)',
                    borderRadius: 2,
                    fontSize:     9,
                    color:        copiedToken === token ? 'var(--accent)' : 'var(--text-secondary)',
                    cursor:       'pointer',
                    fontFamily:   'inherit',
                    flexShrink:   0,
                  }}
                >
                  {copiedToken === token ? <><Check size={9} /> Copied</> : <><Copy size={9} /> Copy</>}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Right panel (Photo grid) ─────────────────────────────────────────────────

interface RightPanelProps {
  photos:          ApprovedPhoto[]
  selected:        Set<string>
  hasActiveFilter: boolean
  onToggle:        (id: string) => void
  onSelectAll:     () => void
  onClearAll:      () => void
}

function RightPanel({ photos, selected, hasActiveFilter, onToggle, onSelectAll, onClearAll }: RightPanelProps) {
  return (
    <div style={{ flex: 1, minWidth: 0, padding: 16, background: 'var(--surface-0)', overflowY: 'auto' }}>

      {/* Selected bar */}
      {selected.size > 0 && (
        <div style={{
          display:        'flex',
          alignItems:     'center',
          justifyContent: 'space-between',
          background:     'var(--accent-bg)',
          border:         '0.5px solid var(--accent-border)',
          borderRadius:   2,
          padding:        '8px 12px',
          marginBottom:   10,
        }}>
          <span style={{ fontSize: 11, color: 'var(--accent)' }}>
            {selected.size} photo{selected.size !== 1 ? 's' : ''} selected
          </span>
          <button
            onClick={onClearAll}
            style={{
              fontSize:   10,
              color:      'var(--text-muted)',
              background: 'none',
              border:     'none',
              cursor:     'pointer',
              fontFamily: 'inherit',
              padding:    0,
            }}
          >
            Clear selection
          </button>
        </div>
      )}

      {/* Header row */}
      <div style={{
        display:        'flex',
        alignItems:     'center',
        justifyContent: 'space-between',
        marginBottom:   10,
      }}>
        <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
          <strong style={{ color: 'var(--text-primary)' }}>{photos.length}</strong> matching photo{photos.length !== 1 ? 's' : ''}
        </span>
        {photos.length > 0 && (
          <button
            onClick={onSelectAll}
            style={{
              fontSize:   10,
              color:      'var(--accent)',
              background: 'none',
              border:     'none',
              cursor:     'pointer',
              fontFamily: 'inherit',
              padding:    0,
            }}
          >
            Select all
          </button>
        )}
      </div>

      {/* Grid */}
      {!hasActiveFilter ? (
        <div style={{ paddingTop: 64, paddingBottom: 64, textAlign: 'center' }}>
          <div style={{ borderTop: 'var(--border-rule)', width: 40, marginInline: 'auto', marginBottom: 20 }} />
          <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>
            Select a project or filter to browse photos
          </p>
          <div style={{ borderBottom: 'var(--border-rule)', width: 40, marginInline: 'auto', marginTop: 20 }} />
        </div>
      ) : photos.length === 0 ? (
        <div style={{ paddingTop: 48, textAlign: 'center' }}>
          <div style={{ borderTop: 'var(--border-rule)', width: 40, marginInline: 'auto', marginBottom: 20 }} />
          <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>No photos match these filters.</p>
          <div style={{ borderBottom: 'var(--border-rule)', width: 40, marginInline: 'auto', marginTop: 20 }} />
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 4 }}>
          {photos.map((photo) => {
            const sel = selected.has(photo.id)
            const src = photo.signed_url ?? null
            return (
              <div
                key={photo.id}
                onClick={() => onToggle(photo.id)}
                style={{
                  aspectRatio:  '1/1',
                  position:     'relative',
                  overflow:     'hidden',
                  borderRadius: 2,
                  cursor:       'pointer',
                  background:   'var(--surface-1)',
                  border:       sel
                    ? '1.5px solid var(--accent)'
                    : '0.5px solid var(--surface-3)',
                }}
              >
                {src && (
                  <Image
                    src={src}
                    alt={photo.filename}
                    fill
                    className="object-cover"
                    sizes="(max-width: 768px) 25vw, 12vw"
                    unoptimized
                  />
                )}
                {sel && <CheckCircle />}
                {photo.quality_score != null && (
                  <div style={{ position: 'absolute', top: 4, right: 4, pointerEvents: 'none' }}>
                    <ScorePill score={photo.quality_score} />
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ─── New Collection Tab ───────────────────────────────────────────────────────

function NewCollectionTab({
  events,
  photos,
  onCreated,
}: {
  events:    { id: string; name: string }[]
  photos:    ApprovedPhoto[]
  onCreated: (link: DeliveryLinkRow) => void
}) {
  const [collectionName,    setCollectionName]    = useState('')
  const [allProjects,       setAllProjects]       = useState(true)
  const [selectedProjects,  setSelectedProjects]  = useState<Set<string>>(new Set())
  const [selectedTags,      setSelectedTags]      = useState<Set<string>>(new Set())
  const [selectedColour,    setSelectedColour]    = useState<string | null>(null)
  const [minScore,          setMinScore]          = useState(0)
  const [maxScore,          setMaxScore]          = useState(100)
  const [expires,           setExpires]           = useState<string>('Never')
  const [selectedPhotos,    setSelectedPhotos]    = useState<Set<string>>(new Set())
  const [generating,        setGenerating]        = useState(false)
  const [generatedLinks,    setGeneratedLinks]    = useState<{ eventName: string; token: string }[]>([])

  // ── Derived: unique tags from photos in selected projects ──────────────────
  const availableTags = useMemo(() => {
    const base = allProjects
      ? photos
      : photos.filter((p) => selectedProjects.has(p.event_id))
    const tagSet = new Set<string>()
    base.forEach((p) => {
      p.tags?.forEach((t) => {
        if (t.tag_type !== 'colour') tagSet.add(t.value)
      })
    })
    return [...tagSet].sort()
  }, [photos, allProjects, selectedProjects])

  // ── Filtered photos ────────────────────────────────────────────────────────
  const filteredPhotos = useMemo(() => {
    return photos.filter((p) => {
      if (!allProjects && !selectedProjects.has(p.event_id)) return false
      if (selectedColour && !(p.dominant_colours ?? []).includes(selectedColour)) return false
      if (selectedTags.size > 0) {
        const photoTagValues = new Set((p.tags ?? []).map((t) => t.value))
        const hasAll = [...selectedTags].every((t) => photoTagValues.has(t))
        if (!hasAll) return false
      }
      const score = p.quality_score
      if (score != null && (score < minScore || score > maxScore)) return false
      return true
    })
  }, [photos, allProjects, selectedProjects, selectedColour, selectedTags, minScore, maxScore])

  // ── Project toggle ─────────────────────────────────────────────────────────
  function toggleProject(id: string) {
    setAllProjects(false)
    setSelectedProjects((prev) => {
      const n = new Set(prev)
      n.has(id) ? n.delete(id) : n.add(id)
      if (n.size === 0) setAllProjects(true)
      return n
    })
  }

  function handleAllProjects() {
    setAllProjects(true)
    setSelectedProjects(new Set())
  }

  // ── Tag toggle ─────────────────────────────────────────────────────────────
  function toggleTag(tag: string) {
    setSelectedTags((prev) => {
      const n = new Set(prev)
      n.has(tag) ? n.delete(tag) : n.add(tag)
      return n
    })
  }

  // ── Colour toggle ──────────────────────────────────────────────────────────
  function toggleColour(name: string) {
    setSelectedColour((prev) => prev === name ? null : name)
  }

  // ── Photo selection ────────────────────────────────────────────────────────
  function togglePhoto(id: string) {
    setSelectedPhotos((prev) => {
      const n = new Set(prev)
      n.has(id) ? n.delete(id) : n.add(id)
      return n
    })
  }

  function selectAll() {
    setSelectedPhotos(new Set(filteredPhotos.map((p) => p.id)))
  }

  function clearAll() {
    setSelectedPhotos(new Set())
  }

  // ── Generate ───────────────────────────────────────────────────────────────
  const canGenerate      = !allProjects && selectedProjects.size > 0
  const hasActiveFilter  = !allProjects || selectedTags.size > 0 || selectedColour !== null || minScore !== 0 || maxScore !== 100

  async function generate() {
    if (!canGenerate || generating) return
    setGenerating(true)
    const results: { eventName: string; token: string }[] = []
    try {
      for (const eventId of selectedProjects) {
        const res  = await fetch('/api/delivery', {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({ event_id: eventId }),
        })
        const json = await res.json() as { token?: string }
        if (json.token) {
          const ev = events.find((e) => e.id === eventId)
          results.push({ eventName: ev?.name ?? eventId, token: json.token })
          onCreated({
            id:         crypto.randomUUID(),
            event_id:   eventId,
            token:      json.token,
            created_at: new Date().toISOString(),
            events:     ev ? { id: ev.id, name: ev.name, date: '' } : null,
          })
        }
      }
      setGeneratedLinks(results)
    } finally {
      setGenerating(false)
    }
  }

  return (
    <div style={{
      display:   'flex',
      minHeight: 520,
      // mobile: stacked (handled via @media in globals.css or inline below)
    }}>
      <LeftPanel
        events={events}
        selectedProjects={selectedProjects}
        onToggleProject={toggleProject}
        allProjects={allProjects}
        onAllProjects={handleAllProjects}
        availableTags={availableTags}
        selectedTags={selectedTags}
        onToggleTag={toggleTag}
        selectedColour={selectedColour}
        onToggleColour={toggleColour}
        minScore={minScore}
        maxScore={maxScore}
        onMinScore={setMinScore}
        onMaxScore={setMaxScore}
        expires={expires}
        onExpires={setExpires}
        collectionName={collectionName}
        onCollectionName={setCollectionName}
        generating={generating}
        canGenerate={canGenerate}
        onGenerate={generate}
        generatedLinks={generatedLinks}
      />
      <RightPanel
        photos={filteredPhotos}
        selected={selectedPhotos}
        hasActiveFilter={hasActiveFilter}
        onToggle={togglePhoto}
        onSelectAll={selectAll}
        onClearAll={clearAll}
      />
    </div>
  )
}

// ─── Active Links Tab ─────────────────────────────────────────────────────────

function ActiveLinksTab({ links }: { links: DeliveryLinkRow[] }) {
  const [copied, setCopied] = useState<string | null>(null)

  function copy(token: string) {
    navigator.clipboard.writeText(deliveryUrl(token))
    setCopied(token)
    setTimeout(() => setCopied(null), 2000)
  }

  const TH_STYLE: React.CSSProperties = {
    textAlign:     'left',
    fontSize:      8,
    letterSpacing: '0.12em',
    textTransform: 'uppercase',
    color:         'var(--text-muted)',
    padding:       '8px 12px',
    borderBottom:  'var(--border-rule)',
    fontWeight:    400,
  }

  const TD_STYLE: React.CSSProperties = {
    padding:      '10px 12px',
    fontSize:     11,
    borderBottom: 'var(--border-rule)',
  }

  if (links.length === 0) {
    return (
      <div style={{ padding: '48px 16px', textAlign: 'center' }}>
        <div style={{ borderTop: 'var(--border-rule)', width: 40, marginInline: 'auto', marginBottom: 20 }} />
        <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>No active links yet.</p>
        <div style={{ borderBottom: 'var(--border-rule)', width: 40, marginInline: 'auto', marginTop: 20 }} />
      </div>
    )
  }

  return (
    <div style={{ padding: 16 }}>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            {['Collection', 'Project', 'Created', 'Expires', 'Views', ''].map((h) => (
              <th key={h} style={TH_STYLE}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {links.map((link) => {
            const expired = isExpired(link.expires_at)
            const dimStyle: React.CSSProperties = expired
              ? { color: 'var(--text-dim)' }
              : {}
            return (
              <tr
                key={link.id}
                style={{ transition: 'background 0.1s' }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLTableRowElement).style.background = 'var(--surface-1)' }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLTableRowElement).style.background = '' }}
              >
                {/* Collection */}
                <td style={{ ...TD_STYLE, fontWeight: 500, color: 'var(--text-primary)', ...dimStyle }}>
                  {link.events?.name ?? '—'}
                </td>
                {/* Project */}
                <td style={{ ...TD_STYLE, color: 'var(--text-secondary)', ...dimStyle }}>
                  {link.events?.name ?? '—'}
                </td>
                {/* Created */}
                <td style={{ ...TD_STYLE, color: 'var(--text-secondary)', whiteSpace: 'nowrap', ...dimStyle }}>
                  {formatDate(link.created_at)}
                </td>
                {/* Expires */}
                <td style={{ ...TD_STYLE, ...dimStyle }}>
                  {expired ? (
                    <span style={{
                      fontSize:     8,
                      padding:      '2px 6px',
                      borderRadius: 2,
                      border:       '0.5px solid var(--surface-3)',
                      color:        'var(--text-dim)',
                      background:   'transparent',
                    }}>
                      Expired
                    </span>
                  ) : link.expires_at ? (
                    <span style={{ color: 'var(--text-secondary)', fontSize: 11 }}>{formatDate(link.expires_at)}</span>
                  ) : (
                    <span style={{ color: 'var(--text-dim)', fontSize: 11 }}>—</span>
                  )}
                </td>
                {/* Views */}
                <td style={{ ...TD_STYLE, color: 'var(--text-secondary)', ...dimStyle }}>—</td>
                {/* Action */}
                <td style={{ ...TD_STYLE }}>
                  <button
                    onClick={() => copy(link.token)}
                    style={{
                      display:      'inline-flex',
                      alignItems:   'center',
                      gap:          4,
                      fontSize:     9,
                      padding:      '3px 8px',
                      border:       '0.5px solid var(--surface-3)',
                      borderRadius: 2,
                      background:   'transparent',
                      color:        copied === link.token ? 'var(--accent)' : 'var(--text-secondary)',
                      cursor:       'pointer',
                      fontFamily:   'inherit',
                      whiteSpace:   'nowrap',
                    }}
                  >
                    {copied === link.token
                      ? <><Check size={9} /> Copied ✓</>
                      : <><Copy size={9} /> Copy link</>
                    }
                  </button>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

// ─── DeliveryManageClient ─────────────────────────────────────────────────────

export default function DeliveryManageClient({ links: initialLinks, events, photos }: Props) {
  const [tab,   setTab]   = useState<'active' | 'new'>('active')
  const [links, setLinks] = useState<DeliveryLinkRow[]>(initialLinks)

  const tabStyle = (active: boolean): React.CSSProperties => ({
    fontSize:     11,
    fontWeight:   active ? 500 : 400,
    color:        active ? 'var(--accent)' : 'var(--text-muted)',
    background:   'none',
    border:       'none',
    borderBottom: active ? '1.5px solid var(--accent)' : '1.5px solid transparent',
    padding:      '10px 0',
    marginRight:  24,
    cursor:       'pointer',
    fontFamily:   'inherit',
    transition:   'color 0.15s',
  })

  return (
    <div style={{ display: 'flex', alignItems: 'flex-start' }}>
      <Sidebar />

      <main className="main-content" style={{ flex: 1, minWidth: 0, minHeight: 'calc(100vh - 44px)' }}>

        {/* Tab bar */}
        <div style={{
          display:      'flex',
          borderBottom: 'var(--border-rule)',
          padding:      '0 24px',
          background:   'var(--surface-0)',
        }}>
          <button style={tabStyle(tab === 'active')} onClick={() => setTab('active')}>
            Active links
          </button>
          <button style={tabStyle(tab === 'new')} onClick={() => setTab('new')}>
            New collection
          </button>
        </div>

        {/* Tab content */}
        {tab === 'active' ? (
          <ActiveLinksTab links={links} />
        ) : (
          <NewCollectionTab
            events={events}
            photos={photos}
            onCreated={(link) => {
              setLinks((prev) => {
                const exists = prev.some((l) => l.event_id === link.event_id)
                return exists ? prev : [link, ...prev]
              })
            }}
          />
        )}
      </main>
    </div>
  )
}
