'use client'

import { useState, useEffect } from 'react'
import { useRouter, useParams } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { ArrowLeft, Loader2 } from 'lucide-react'
import type { Event } from '@/types'
import PhotographerInput from '@/components/PhotographerInput'

export default function EditEventPage() {
  const router = useRouter()
  const { id } = useParams<{ id: string }>()

  const [loading, setLoading]   = useState(true)
  const [saving, setSaving]     = useState(false)
  const [error, setError]       = useState<string | null>(null)

  const [form, setForm] = useState({
    name: '', date: '', location: '', venue: '', description: '',
  })
  const [photographers, setPhotographers] = useState<string[]>([])

  useEffect(() => {
    const supabase = createClient()
    supabase
      .from('events')
      .select('*')
      .eq('id', id)
      .single()
      .then(({ data, error: err }) => {
        if (err || !data) { setError('Event not found'); setLoading(false); return }
        const ev = data as Event
        setForm({
          name:        ev.name,
          date:        ev.date.slice(0, 10),
          location:    ev.location ?? '',
          venue:       ev.venue ?? '',
          description: ev.description ?? '',
        })
        setPhotographers(ev.photographers ?? [])
        setLoading(false)
      })
  }, [id])

  function handleChange(e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }))
  }

  // When a new photographer is added, upsert in DB + create folder immediately
  async function handlePhotographerAdd(name: string) {
    await fetch('/api/photographers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    })
    await fetch('/api/folders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ event_id: id, name }),
    })
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (!form.name.trim() || !form.date) {
      setError('Event name and date are required.')
      return
    }
    setSaving(true)
    const res = await fetch(`/api/events/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name:          form.name.trim(),
        date:          form.date,
        location:      form.location.trim() || null,
        venue:         form.venue.trim() || null,
        description:   form.description.trim() || null,
        photographers,
      }),
    })
    const json = await res.json()
    setSaving(false)
    if (!res.ok) { setError(json.error ?? 'Failed to save'); return }
    router.push(`/events/${id}`)
    router.refresh()
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-surface-0 flex items-center justify-center">
        <Loader2 size={18} className="text-[#444] animate-spin" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-surface-0">
      <header className="border-b border-[#1f1f1f] px-6 py-4">
        <div className="max-w-7xl mx-auto">
          <span className="font-mono tracking-widest text-sm text-white uppercase">Archive</span>
        </div>
      </header>

      <main className="max-w-lg mx-auto px-6 py-12">
        <Link
          href={`/events/${id}`}
          className="inline-flex items-center gap-2 text-[#888888] text-sm hover:text-white transition-colors mb-8"
        >
          <ArrowLeft size={14} />
          Back to event
        </Link>

        <h1 className="text-white text-xl font-semibold mb-8">Edit Event</h1>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label className="block text-sm text-[#888888] mb-1.5" htmlFor="name">
              Event Name <span className="text-white">*</span>
            </label>
            <input
              id="name" name="name" type="text"
              value={form.name} onChange={handleChange}
              className="w-full bg-surface-0 border border-[#1f1f1f] rounded px-3 py-2.5 text-white text-sm placeholder-[#555] focus:outline-none focus:border-[#444] transition-colors"
              required
            />
          </div>

          <div>
            <label className="block text-sm text-[#888888] mb-1.5" htmlFor="date">
              Date <span className="text-white">*</span>
            </label>
            <input
              id="date" name="date" type="date"
              value={form.date} onChange={handleChange}
              className="w-full bg-surface-0 border border-[#1f1f1f] rounded px-3 py-2.5 text-white text-sm focus:outline-none focus:border-[#444] transition-colors [color-scheme:dark]"
              required
            />
          </div>

          <div>
            <label className="block text-sm text-[#888888] mb-1.5" htmlFor="location">
              Location
            </label>
            <input
              id="location" name="location" type="text"
              value={form.location} onChange={handleChange}
              placeholder="e.g. Hackney, London"
              className="w-full bg-surface-0 border border-[#1f1f1f] rounded px-3 py-2.5 text-white text-sm placeholder-[#555] focus:outline-none focus:border-[#444] transition-colors"
            />
          </div>

          <div>
            <label className="block text-sm text-[#888888] mb-1.5" htmlFor="venue">
              Venue
            </label>
            <input
              id="venue" name="venue" type="text"
              value={form.venue} onChange={handleChange}
              placeholder="e.g. Fabric, Egg London, Fold"
              className="w-full bg-surface-0 border border-[#1f1f1f] rounded px-3 py-2.5 text-white text-sm placeholder-[#555] focus:outline-none focus:border-[#444] transition-colors"
            />
          </div>

          <div>
            <label className="block text-sm text-[#888888] mb-1.5" htmlFor="description">
              Description
            </label>
            <textarea
              id="description" name="description"
              value={form.description} onChange={handleChange}
              rows={3}
              className="w-full bg-surface-0 border border-[#1f1f1f] rounded px-3 py-2.5 text-white text-sm placeholder-[#555] focus:outline-none focus:border-[#444] transition-colors resize-none"
            />
          </div>

          <div>
            <label className="block text-sm text-[#888888] mb-1.5">
              Photographers
            </label>
            <PhotographerInput
              value={photographers}
              onChange={setPhotographers}
              onAdd={handlePhotographerAdd}
            />
          </div>

          {error && <p className="text-red-400 text-sm">{error}</p>}

          <div className="flex gap-3 pt-1">
            <Link
              href={`/events/${id}`}
              className="flex-1 inline-flex items-center justify-center text-sm text-[#888] hover:text-white border border-[#2a2a2a] hover:border-[#444] py-2.5 rounded transition-colors"
            >
              Cancel
            </Link>
            <button
              type="submit"
              disabled={saving}
              className="flex-1 inline-flex items-center justify-center gap-2 bg-white text-black text-sm font-medium py-2.5 rounded hover:bg-gray-100 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {saving ? (
                <><Loader2 size={14} className="animate-spin" /> Saving…</>
              ) : (
                'Save changes'
              )}
            </button>
          </div>
        </form>
      </main>
    </div>
  )
}
