'use client'

import { useState } from 'react'
import Image from 'next/image'
import { Check, Copy } from 'lucide-react'
import Sidebar from '@/components/layout/Sidebar'
import { transformUrl } from '@/lib/supabase/storage'

// ─── Types ────────────────────────────────────────────────────────────────────

interface DeliveryLinkRow {
  id:         string
  event_id:   string
  token:      string
  created_at: string
  events:     { id: string; name: string; date: string } | null
}

interface ApprovedPhoto {
  id:          string
  event_id:    string
  filename:    string
  storage_path: string
  public_url:  string
  file_type:   string
  signed_url?: string
}

interface Props {
  links:  DeliveryLinkRow[]
  events: { id: string; name: string }[]
  photos: ApprovedPhoto[]
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

function deliveryUrl(token: string) {
  if (typeof window === 'undefined') return `/delivery/${token}`
  return `${window.location.origin}/delivery/${token}`
}

// ─── Shared styles ────────────────────────────────────────────────────────────

const selectStyle = {
  background:   'var(--surface-1)',
  border:       'var(--border-rule)',
  borderRadius: 2,
  padding:      '5px 8px',
  fontSize:     11,
  color:        'var(--text-secondary)',
  fontFamily:   'inherit',
  outline:      'none',
  cursor:       'pointer',
}

const ghostBtn = {
  background:   'transparent',
  border:       'var(--border-rule)',
  borderRadius: 2,
  fontSize:     9,
  color:        'var(--text-secondary)',
  padding:      '3px 8px',
  cursor:       'pointer',
  fontFamily:   'inherit',
  display:      'inline-flex',
  alignItems:   'center',
  gap:          4,
}

const sectionLabel = {
  fontSize:      9,
  textTransform: 'uppercase' as const,
  letterSpacing: '0.14em',
  color:         'var(--text-muted)',
  borderBottom:  'var(--border-rule)',
  paddingBottom: 8,
  marginBottom:  12,
}

// ─── Active Links Tab ─────────────────────────────────────────────────────────

function ActiveLinksTab({ links }: { links: DeliveryLinkRow[] }) {
  const [copied, setCopied] = useState<string | null>(null)

  function copy(token: string) {
    navigator.clipboard.writeText(deliveryUrl(token))
    setCopied(token)
    setTimeout(() => setCopied(null), 2000)
  }

  if (links.length === 0) {
    return (
      <div style={{ paddingTop: 48, textAlign: 'center' }}>
        <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>No delivery links yet.</p>
        <p style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 6 }}>
          Switch to "New collection" to generate one.
        </p>
      </div>
    )
  }

  return (
    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
      <thead>
        <tr>
          {['Collection', 'Created', 'Link'].map((h) => (
            <th
              key={h}
              style={{
                textAlign:     'left',
                fontSize:      9,
                letterSpacing: '0.14em',
                textTransform: 'uppercase',
                color:         'var(--text-muted)',
                padding:       '0 0 10px 0',
                borderBottom:  'var(--border-rule)',
                fontWeight:    400,
              }}
            >
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {links.map((link) => (
          <tr key={link.id} style={{ borderBottom: 'var(--border-rule)' }}>
            <td style={{ padding: '10px 0', fontSize: 12, color: 'var(--text-primary)', paddingRight: 24 }}>
              {link.events?.name ?? '—'}
            </td>
            <td style={{ padding: '10px 0', fontSize: 11, color: 'var(--text-secondary)', paddingRight: 24, whiteSpace: 'nowrap' }}>
              {formatDate(link.created_at)}
            </td>
            <td style={{ padding: '10px 0' }}>
              <button onClick={() => copy(link.token)} style={ghostBtn}>
                {copied === link.token
                  ? <><Check size={9} /> Copied</>
                  : <><Copy size={9} /> Copy</>
                }
              </button>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
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
  const [selectedEventId,  setSelectedEventId]  = useState('')
  const [filterEventId,    setFilterEventId]    = useState('')
  const [selectedPhotos,   setSelectedPhotos]   = useState<Set<string>>(new Set())
  const [generating,       setGenerating]       = useState(false)
  const [generatedToken,   setGeneratedToken]   = useState<string | null>(null)
  const [copied,           setCopied]           = useState(false)

  const filteredPhotos = filterEventId
    ? photos.filter((p) => p.event_id === filterEventId)
    : photos

  function togglePhoto(id: string) {
    setSelectedPhotos((prev) => {
      const n = new Set(prev)
      n.has(id) ? n.delete(id) : n.add(id)
      return n
    })
  }

  async function generate() {
    if (!selectedEventId) return
    setGenerating(true)
    try {
      const res  = await fetch('/api/delivery', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ event_id: selectedEventId }),
      })
      const json = await res.json() as { token?: string }
      if (json.token) {
        setGeneratedToken(json.token)
        const event = events.find((e) => e.id === selectedEventId)
        onCreated({
          id:         crypto.randomUUID(),
          event_id:   selectedEventId,
          token:      json.token,
          created_at: new Date().toISOString(),
          events:     event ? { id: event.id, name: event.name, date: '' } : null,
        })
      }
    } finally {
      setGenerating(false)
    }
  }

  function copyLink() {
    if (!generatedToken) return
    navigator.clipboard.writeText(deliveryUrl(generatedToken))
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>

      {/* Step 1: Select project */}
      <div>
        <p style={sectionLabel}>Select project</p>
        <select
          value={selectedEventId}
          onChange={(e) => setSelectedEventId(e.target.value)}
          style={{ ...selectStyle, minWidth: 220 }}
        >
          <option value="">— Choose a project —</option>
          {events.map((ev) => (
            <option key={ev.id} value={ev.id}>{ev.name}</option>
          ))}
        </select>
      </div>

      {/* Step 2: Photo preview grid */}
      <div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, paddingBottom: 8, borderBottom: 'var(--border-rule)' }}>
          <p style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.14em', color: 'var(--text-muted)' }}>
            Approved photos
          </p>
          <select
            value={filterEventId}
            onChange={(e) => setFilterEventId(e.target.value)}
            style={selectStyle}
          >
            <option value="">All projects</option>
            {events.map((ev) => (
              <option key={ev.id} value={ev.id}>{ev.name}</option>
            ))}
          </select>
        </div>

        {filteredPhotos.length === 0 ? (
          <p style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 8 }}>No approved photos.</p>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 5, maxHeight: 320, overflowY: 'auto' }}>
            {filteredPhotos.map((photo) => {
              const sel = selectedPhotos.has(photo.id)
              const src = transformUrl(photo.signed_url ?? photo.public_url, 200)
              return (
                <div
                  key={photo.id}
                  onClick={() => togglePhoto(photo.id)}
                  style={{
                    aspectRatio:  '1',
                    position:     'relative',
                    overflow:     'hidden',
                    borderRadius: 2,
                    cursor:       'pointer',
                    border:       sel ? '1.5px solid var(--accent)' : '1.5px solid transparent',
                    background:   'var(--surface-2)',
                  }}
                >
                  {src && (
                    <Image src={src} alt={photo.filename} fill className="object-cover" sizes="80px" unoptimized />
                  )}
                  {sel && (
                    <div style={{
                      position:       'absolute',
                      inset:          0,
                      background:     'rgba(0,0,0,0.35)',
                      display:        'flex',
                      alignItems:     'center',
                      justifyContent: 'center',
                    }}>
                      <Check size={16} color="var(--accent)" />
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
        {selectedPhotos.size > 0 && (
          <p style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 8 }}>
            {selectedPhotos.size} photo{selectedPhotos.size !== 1 ? 's' : ''} selected
          </p>
        )}
      </div>

      {/* Generate button */}
      {!generatedToken ? (
        <button
          onClick={generate}
          disabled={!selectedEventId || generating}
          style={{
            width:          '100%',
            padding:        12,
            background:     'var(--accent)',
            color:          '#ffffff',
            fontSize:       12,
            fontWeight:     500,
            border:         'none',
            borderRadius:   2,
            cursor:         !selectedEventId || generating ? 'not-allowed' : 'pointer',
            opacity:        !selectedEventId || generating ? 0.5 : 1,
            fontFamily:     'inherit',
            transition:     'opacity 0.15s',
          }}
        >
          {generating ? 'Generating…' : 'Generate delivery link'}
        </button>
      ) : (
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            readOnly
            value={deliveryUrl(generatedToken)}
            style={{
              flex:         1,
              background:   'var(--surface-1)',
              border:       'var(--border-rule)',
              borderRadius: 2,
              padding:      '8px 10px',
              fontSize:     11,
              color:        'var(--text-primary)',
              fontFamily:   'monospace',
              outline:      'none',
            }}
          />
          <button
            onClick={copyLink}
            style={{
              ...ghostBtn,
              padding: '8px 12px',
              fontSize: 11,
              flexShrink: 0,
            }}
          >
            {copied ? <><Check size={11} /> Copied</> : <><Copy size={11} /> Copy</>}
          </button>
        </div>
      )}
    </div>
  )
}

// ─── DeliveryManageClient ─────────────────────────────────────────────────────

export default function DeliveryManageClient({ links: initialLinks, events, photos }: Props) {
  const [tab,   setTab]   = useState<'active' | 'new'>('active')
  const [links, setLinks] = useState<DeliveryLinkRow[]>(initialLinks)

  const tabStyle = (active: boolean) => ({
    fontSize:      11,
    fontWeight:    active ? 500 : 400,
    color:         active ? 'var(--accent)' : 'var(--text-muted)',
    background:    'none',
    border:        'none',
    borderBottom:  active ? '1.5px solid var(--accent)' : '1.5px solid transparent',
    padding:       '8px 0',
    marginRight:   24,
    cursor:        'pointer',
    fontFamily:    'inherit',
    transition:    'color 0.15s',
  })

  return (
    <div style={{ display: 'flex', alignItems: 'flex-start' }}>
      <Sidebar />

      <main className="main-content" style={{ flex: 1, minWidth: 0, padding: '20px 24px', minHeight: 'calc(100vh - 44px)' }}>

        {/* Header */}
        <div style={{
          display:        'flex',
          alignItems:     'center',
          justifyContent: 'space-between',
          marginBottom:   16,
          paddingBottom:  8,
          borderBottom:   'var(--border-rule)',
        }}>
          <p style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.14em', color: 'var(--text-muted)' }}>
            Delivery
          </p>
        </div>

        {/* Tab bar */}
        <div style={{ display: 'flex', borderBottom: 'var(--border-rule)', marginBottom: 24 }}>
          <button style={tabStyle(tab === 'active')} onClick={() => setTab('active')}>
            Active links
          </button>
          <button style={tabStyle(tab === 'new')} onClick={() => setTab('new')}>
            New collection
          </button>
        </div>

        {/* Tab content */}
        <div style={{ maxWidth: 680 }}>
          {tab === 'active'
            ? <ActiveLinksTab links={links} />
            : <NewCollectionTab
                events={events}
                photos={photos}
                onCreated={(link) => setLinks((prev) => [link, ...prev])}
              />
          }
        </div>
      </main>
    </div>
  )
}
