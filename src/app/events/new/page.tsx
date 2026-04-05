'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { ArrowLeft, Loader2, CalendarDays } from 'lucide-react'
import PhotographerInput from '@/components/PhotographerInput'

export default function NewEventPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError]   = useState<string | null>(null)

  const [form, setForm] = useState({
    name: '',
    date: '',
    location: '',
    venue: '',
    description: '',
  })

  const [photographers, setPhotographers] = useState<string[]>([])
  const [multiDay, setMultiDay]           = useState(false)
  const [dayCount, setDayCount]           = useState(2)

  function handleChange(e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    if (!form.name.trim() || !form.date) {
      setError('Event name and date are required.')
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

    // Upsert each photographer record in DB
    if (photographers.length > 0) {
      await Promise.all(
        photographers.map((name) =>
          fetch('/api/photographers', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name }),
          })
        )
      )
    }

    // Create folder structure
    if (multiDay && dayCount >= 2) {
      // Multi-day: Day 1 · Photographer A, Day 1 · Photographer B, Day 2 · …
      const days = Array.from({ length: dayCount }, (_, i) => i + 1)
      const folderNames: string[] = []
      for (const day of days) {
        if (photographers.length > 0) {
          for (const name of photographers) {
            folderNames.push(`Day ${day} · ${name}`)
          }
        } else {
          folderNames.push(`Day ${day}`)
        }
      }
      for (const name of folderNames) {
        await fetch('/api/folders', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ event_id: eventId, name }),
        })
      }
    } else {
      // Single-day: one folder per photographer
      for (const name of photographers) {
        await fetch('/api/folders', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ event_id: eventId, name }),
        })
      }
    }

    router.push(`/events/${eventId}`)
  }

  return (
    <div className="min-h-screen bg-[#0a0a0a]">
      <header className="border-b border-[#1f1f1f] px-6 py-4">
        <div className="max-w-7xl mx-auto">
          <span className="font-mono tracking-widest text-sm text-white uppercase">Archive</span>
        </div>
      </header>

      <main className="max-w-lg mx-auto px-6 py-12">
        <Link
          href="/events"
          className="inline-flex items-center gap-2 text-[#888888] text-sm hover:text-white transition-colors mb-8"
        >
          <ArrowLeft size={14} />
          Back to events
        </Link>

        <h1 className="text-white text-xl font-semibold mb-8">New Event</h1>

        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Name */}
          <div>
            <label className="block text-sm text-[#888888] mb-1.5" htmlFor="name">
              Event Name <span className="text-white">*</span>
            </label>
            <input
              id="name" name="name" type="text"
              value={form.name} onChange={handleChange}
              placeholder="e.g. Summer Festival 2024"
              className="w-full bg-[#111111] border border-[#1f1f1f] rounded px-3 py-2.5 text-white text-sm placeholder-[#555] focus:outline-none focus:border-[#444] transition-colors"
              required
            />
          </div>

          {/* Date */}
          <div>
            <label className="block text-sm text-[#888888] mb-1.5" htmlFor="date">
              Date <span className="text-white">*</span>
            </label>
            <input
              id="date" name="date" type="date"
              value={form.date} onChange={handleChange}
              className="w-full bg-[#111111] border border-[#1f1f1f] rounded px-3 py-2.5 text-white text-sm focus:outline-none focus:border-[#444] transition-colors [color-scheme:dark]"
              required
            />
          </div>

          {/* Location */}
          <div>
            <label className="block text-sm text-[#888888] mb-1.5" htmlFor="location">
              Location
            </label>
            <input
              id="location" name="location" type="text"
              value={form.location} onChange={handleChange}
              placeholder="e.g. Hackney, London"
              className="w-full bg-[#111111] border border-[#1f1f1f] rounded px-3 py-2.5 text-white text-sm placeholder-[#555] focus:outline-none focus:border-[#444] transition-colors"
            />
          </div>

          {/* Venue */}
          <div>
            <label className="block text-sm text-[#888888] mb-1.5" htmlFor="venue">
              Venue
            </label>
            <input
              id="venue" name="venue" type="text"
              value={form.venue} onChange={handleChange}
              placeholder="e.g. Fabric, Egg London, Fold"
              className="w-full bg-[#111111] border border-[#1f1f1f] rounded px-3 py-2.5 text-white text-sm placeholder-[#555] focus:outline-none focus:border-[#444] transition-colors"
            />
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm text-[#888888] mb-1.5" htmlFor="description">
              Description
            </label>
            <textarea
              id="description" name="description"
              value={form.description} onChange={handleChange}
              placeholder="Brief description of the event…"
              rows={3}
              className="w-full bg-[#111111] border border-[#1f1f1f] rounded px-3 py-2.5 text-white text-sm placeholder-[#555] focus:outline-none focus:border-[#444] transition-colors resize-none"
            />
          </div>

          {/* Photographers */}
          <div>
            <label className="block text-sm text-[#888888] mb-1.5">
              Photographers
            </label>
            <PhotographerInput
              value={photographers}
              onChange={setPhotographers}
            />
          </div>

          {/* Multi-day */}
          <div className="space-y-3">
            <label className="flex items-center gap-3 cursor-pointer group">
              <div className="relative">
                <input
                  type="checkbox"
                  checked={multiDay}
                  onChange={(e) => setMultiDay(e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-9 h-5 bg-[#1a1a1a] border border-[#2a2a2a] rounded-full peer-checked:bg-white transition-colors" />
                <div className="absolute top-0.5 left-0.5 w-4 h-4 bg-[#555] rounded-full transition-all peer-checked:translate-x-4 peer-checked:bg-black" />
              </div>
              <span className="text-sm text-[#888888] group-hover:text-white transition-colors select-none flex items-center gap-1.5">
                <CalendarDays size={13} />
                Multi-day event?
              </span>
            </label>

            {multiDay && (
              <div className="flex items-center gap-3 pl-12">
                <label className="text-sm text-[#888888] shrink-0">
                  How many days?
                </label>
                <input
                  type="number"
                  min={2}
                  max={14}
                  value={dayCount}
                  onChange={(e) => setDayCount(Math.max(2, Math.min(14, parseInt(e.target.value) || 2)))}
                  className="w-20 bg-[#111111] border border-[#1f1f1f] rounded px-3 py-2 text-white text-sm text-center focus:outline-none focus:border-[#444] transition-colors [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
                />
                {photographers.length > 0 && (
                  <p className="text-[#444] text-xs">
                    Creates {dayCount * photographers.length} folders
                    {' '}(Day 1–{dayCount} × {photographers.length} photographer{photographers.length !== 1 ? 's' : ''})
                  </p>
                )}
              </div>
            )}
          </div>

          {error && <p className="text-red-400 text-sm">{error}</p>}

          <button
            type="submit"
            disabled={loading}
            className="w-full inline-flex items-center justify-center gap-2 bg-white text-black text-sm font-medium py-2.5 rounded hover:bg-gray-100 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? (
              <><Loader2 size={14} className="animate-spin" /> Creating…</>
            ) : (
              'Create Event'
            )}
          </button>
        </form>
      </main>
    </div>
  )
}
