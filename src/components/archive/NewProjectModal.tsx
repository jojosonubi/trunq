'use client'

import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { useRouter } from 'next/navigation'
import { Loader2, CalendarDays } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import PhotographerInput from '@/components/PhotographerInput'

interface Props {
  isOpen:  boolean
  onClose: () => void
}

export default function NewProjectModal({ isOpen, onClose }: Props) {
  const router = useRouter()

  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState<string | null>(null)

  const [form, setForm] = useState({
    name: '', date: '', location: '', venue: '', description: '',
  })
  const [photographers, setPhotographers] = useState<string[]>([])
  const [multiDay, setMultiDay]           = useState(false)
  const [dayCount, setDayCount]           = useState(2)

  // Reset form each time the modal opens
  useEffect(() => {
    if (isOpen) {
      setForm({ name: '', date: '', location: '', venue: '', description: '' })
      setPhotographers([])
      setMultiDay(false)
      setDayCount(2)
      setError(null)
    }
  }, [isOpen])

  // Close on Escape
  useEffect(() => {
    if (!isOpen) return
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [isOpen, onClose])

  function handleChange(e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    if (!form.name.trim() || !form.date) {
      setError('Project name and date are required.')
      return
    }

    setLoading(true)

    const supabase = createClient()
    const { data, error: dbError } = await supabase
      .from('events')
      .insert({
        name:          form.name.trim(),
        date:          form.date,
        location:      form.location.trim() || null,
        venue:         form.venue.trim() || null,
        description:   form.description.trim() || null,
        photographers: photographers,
      })
      .select()
      .single()

    setLoading(false)

    if (dbError) {
      setError(dbError.message)
      return
    }

    const eventId = data.id

    // Audit log — fire and forget
    fetch('/api/audit', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({
        action:     'project_created',
        entityType: 'project',
        entityId:   eventId,
        metadata:   { name: form.name.trim(), date: form.date },
      }),
    }).catch(() => {})

    // Upsert photographer records
    if (photographers.length > 0) {
      await Promise.all(
        photographers.map((name) =>
          fetch('/api/photographers', {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify({ name }),
          })
        )
      )
    }

    // Create folder structure
    if (multiDay && dayCount >= 2) {
      const folderNames: string[] = []
      for (let day = 1; day <= dayCount; day++) {
        if (photographers.length > 0) {
          for (const pname of photographers) folderNames.push(`Day ${day} · ${pname}`)
        } else {
          folderNames.push(`Day ${day}`)
        }
      }
      for (const name of folderNames) {
        await fetch('/api/folders', {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({ event_id: eventId, name }),
        })
      }
    } else {
      for (const name of photographers) {
        await fetch('/api/folders', {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({ event_id: eventId, name }),
        })
      }
    }

    router.push(`/projects/${eventId}`)
  }

  if (!isOpen) return null

  return createPortal(
    <div
      style={{
        position:       'fixed',
        inset:          0,
        background:     'var(--overlay-bg)',
        zIndex:         50,
        display:        'flex',
        alignItems:     'center',
        justifyContent: 'center',
      }}
      onClick={onClose}
    >
      <div
        style={{
          background:   'var(--surface-0)',
          border:       'var(--border-rule)',
          borderRadius: 4,
          padding:      '28px 32px',
          width:        480,
          maxWidth:     '90vw',
          position:     'relative',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* ── Header ──────────────────────────────────────────────────────── */}
        <div style={{
          display:        'flex',
          alignItems:     'center',
          justifyContent: 'space-between',
          marginBottom:   24,
        }}>
          <h2 style={{
            margin:        0,
            fontSize:      16,
            fontWeight:    500,
            color:         'var(--text-primary)',
            letterSpacing: '-0.02em',
          }}>
            New project
          </h2>
          <button
            onClick={onClose}
            aria-label="Close"
            style={{
              background: 'none',
              border:     'none',
              fontSize:   18,
              color:      'var(--text-muted)',
              cursor:     'pointer',
              lineHeight: 1,
              padding:    '0 2px',
            }}
          >
            ×
          </button>
        </div>

        {/* ── Form ────────────────────────────────────────────────────────── */}
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* Name */}
          <div>
            <label style={{ display: 'block', fontSize: 11, color: 'var(--text-secondary)', marginBottom: 6 }}>
              Project name <span style={{ color: 'var(--accent)' }}>*</span>
            </label>
            <input
              name="name" type="text"
              value={form.name} onChange={handleChange}
              placeholder="e.g. Summer Festival 2024"
              className="form-input"
              required
            />
          </div>

          {/* Date */}
          <div>
            <label style={{ display: 'block', fontSize: 11, color: 'var(--text-secondary)', marginBottom: 6 }}>
              Date <span style={{ color: 'var(--accent)' }}>*</span>
            </label>
            <input
              name="date" type="date"
              value={form.date} onChange={handleChange}
              className="form-input"
              required
            />
          </div>

          {/* Location */}
          <div>
            <label style={{ display: 'block', fontSize: 11, color: 'var(--text-secondary)', marginBottom: 6 }}>
              Location
            </label>
            <input
              name="location" type="text"
              value={form.location} onChange={handleChange}
              placeholder="e.g. Hackney, London"
              className="form-input"
            />
          </div>

          {/* Venue */}
          <div>
            <label style={{ display: 'block', fontSize: 11, color: 'var(--text-secondary)', marginBottom: 6 }}>
              Venue
            </label>
            <input
              name="venue" type="text"
              value={form.venue} onChange={handleChange}
              placeholder="e.g. Fabric, Egg London, Fold"
              className="form-input"
            />
          </div>

          {/* Description */}
          <div>
            <label style={{ display: 'block', fontSize: 11, color: 'var(--text-secondary)', marginBottom: 6 }}>
              Description
            </label>
            <textarea
              name="description"
              value={form.description} onChange={handleChange}
              placeholder="Brief description of the project…"
              rows={3}
              className="form-input"
              style={{ resize: 'none' }}
            />
          </div>

          {/* Photographers */}
          <div>
            <label style={{ display: 'block', fontSize: 11, color: 'var(--text-secondary)', marginBottom: 6 }}>
              Photographers
            </label>
            <PhotographerInput value={photographers} onChange={setPhotographers} />
          </div>

          {/* Multi-day toggle */}
          <div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
              <div style={{ position: 'relative', flexShrink: 0 }}>
                <input
                  type="checkbox"
                  checked={multiDay}
                  onChange={(e) => setMultiDay(e.target.checked)}
                  style={{ position: 'absolute', opacity: 0, width: 0, height: 0 }}
                />
                <div style={{
                  width:        32,
                  height:       18,
                  background:   multiDay ? 'var(--accent)' : 'var(--surface-3)',
                  borderRadius: 9,
                  transition:   'background 0.15s',
                  position:     'relative',
                }}>
                  <div style={{
                    position:     'absolute',
                    top:          2,
                    left:         multiDay ? 16 : 2,
                    width:        14,
                    height:       14,
                    background:   '#ffffff',
                    borderRadius: '50%',
                    transition:   'left 0.15s',
                  }} />
                </div>
              </div>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--text-secondary)' }}>
                <CalendarDays size={12} />
                Multi-day project?
              </span>
            </label>

            {multiDay && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 10, paddingLeft: 42 }}>
                <span style={{ fontSize: 11, color: 'var(--text-secondary)', flexShrink: 0 }}>How many days?</span>
                <input
                  type="number"
                  min={2} max={14}
                  value={dayCount}
                  onChange={(e) => setDayCount(Math.max(2, Math.min(14, parseInt(e.target.value) || 2)))}
                  className="form-input"
                  style={{ width: 64, textAlign: 'center' }}
                />
                {photographers.length > 0 && (
                  <span style={{ fontSize: 10, color: 'var(--text-dim)' }}>
                    Creates {dayCount * photographers.length} folder{dayCount * photographers.length !== 1 ? 's' : ''}
                  </span>
                )}
              </div>
            )}
          </div>

          {error && (
            <p style={{ margin: 0, fontSize: 11, color: 'var(--flagged-fg)' }}>{error}</p>
          )}

          {/* Submit */}
          <button
            type="submit"
            disabled={loading}
            style={{
              width:          '100%',
              display:        'inline-flex',
              alignItems:     'center',
              justifyContent: 'center',
              gap:            6,
              background:     'var(--accent)',
              color:          '#ffffff',
              fontSize:       12,
              fontWeight:     500,
              padding:        10,
              borderRadius:   2,
              border:         'none',
              cursor:         loading ? 'not-allowed' : 'pointer',
              marginTop:      8,
              opacity:        loading ? 0.6 : 1,
              fontFamily:     'inherit',
              transition:     'opacity 0.15s',
            }}
          >
            {loading
              ? <><Loader2 size={13} className="animate-spin" /> Creating…</>
              : 'Create project'
            }
          </button>
        </form>
      </div>
    </div>,
    document.body
  )
}
