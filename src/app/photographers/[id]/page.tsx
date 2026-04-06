import Link from 'next/link'
import Image from 'next/image'
import { notFound } from 'next/navigation'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { requireAuth } from '@/lib/auth'
import { signMediaFiles, transformUrl } from '@/lib/supabase/storage'
import { Camera, ArrowLeft, Images, CalendarDays } from 'lucide-react'
import type { MediaFile } from '@/types'

export const revalidate = 0

function getServiceClient() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  )
}

interface Props {
  params: { id: string }
}

export default async function PhotographerProfilePage({ params }: Props) {
  await requireAuth()
  const supabase = getServiceClient()

  const { data: photographer } = await supabase
    .from('photographers')
    .select('id, name, created_at')
    .eq('id', params.id)
    .single()

  if (!photographer) notFound()

  // All photos taken by this photographer (by name match)
  const { data: rawFiles } = await supabase
    .from('media_files')
    .select('*, events(id, name, date)')
    .ilike('photographer', photographer.name)
    .is('deleted_at', null)
    .eq('file_type', 'image')
    .order('created_at', { ascending: false })

  const files = (rawFiles ?? []) as (MediaFile & { events: { id: string; name: string; date: string } | null })[]

  const signedFiles = await signMediaFiles(files)

  // Compute stats
  const uniqueEvents = new Map<string, { id: string; name: string; date: string; count: number }>()
  for (const f of files) {
    if (f.events) {
      const ev = uniqueEvents.get(f.events.id)
      if (ev) {
        ev.count++
      } else {
        uniqueEvents.set(f.events.id, { ...f.events, count: 1 })
      }
    }
  }

  const dates = files
    .map((f) => f.exif_date_taken ?? f.created_at)
    .filter(Boolean)
    .map((d) => new Date(d).getTime())
    .filter((t) => !isNaN(t))

  const earliest = dates.length ? new Date(Math.min(...dates)) : null
  const latest   = dates.length ? new Date(Math.max(...dates)) : null

  function fmtDate(d: Date) {
    return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
  }

  const eventsSorted = [...uniqueEvents.values()].sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
  )

  return (
    <div className="min-h-screen bg-surface-0">
      <header className="border-b border-[#1f1f1f] px-6 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <span className="font-mono tracking-widest text-sm text-white uppercase">Archive</span>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-12">
        <Link
          href="/photographers"
          className="inline-flex items-center gap-2 text-[#888888] text-sm hover:text-white transition-colors mb-8"
        >
          <ArrowLeft size={14} />
          All photographers
        </Link>

        {/* Profile header */}
        <div className="flex items-start gap-5 mb-10">
          <div className="w-16 h-16 rounded-full bg-surface-0 border border-[#2a2a2a] flex items-center justify-center shrink-0">
            <Camera size={22} className="text-[#555]" />
          </div>
          <div>
            <h1 className="text-white text-2xl font-semibold">{photographer.name}</h1>
            <div className="flex items-center gap-6 mt-2 text-sm text-[#555]">
              <span className="flex items-center gap-1.5">
                <Images size={13} />
                {signedFiles.length} photo{signedFiles.length !== 1 ? 's' : ''}
              </span>
              <span className="flex items-center gap-1.5">
                <CalendarDays size={13} />
                {uniqueEvents.size} project{uniqueEvents.size !== 1 ? 's' : ''}
              </span>
              {earliest && latest && (
                <span className="text-[#444]">
                  {fmtDate(earliest)}
                  {earliest.getTime() !== latest.getTime() && ` — ${fmtDate(latest)}`}
                </span>
              )}
            </div>
          </div>
        </div>

        {signedFiles.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 border border-dashed border-[#1f1f1f] rounded-lg text-center">
            <Images size={28} className="text-[#333] mb-3" />
            <p className="text-[#555] text-sm">No photos yet</p>
          </div>
        ) : (
          <div className="space-y-10">
            {/* Events breakdown */}
            {eventsSorted.length > 0 && (
              <div>
                <h2 className="text-[#555] text-xs uppercase tracking-wider mb-3">Projects</h2>
                <div className="flex flex-wrap gap-2">
                  {eventsSorted.map((ev) => (
                    <Link
                      key={ev.id}
                      href={`/projects/${ev.id}`}
                      className="inline-flex items-center gap-2 px-3 py-1.5 bg-surface-0 border border-[#1f1f1f] rounded-lg text-xs text-[#888] hover:text-white hover:border-[#333] transition-all"
                    >
                      {ev.name}
                      <span className="text-[#444] tabular-nums">{ev.count}</span>
                    </Link>
                  ))}
                </div>
              </div>
            )}

            {/* Photo grid */}
            <div>
              <h2 className="text-[#555] text-xs uppercase tracking-wider mb-3">Photos</h2>
              <div className="columns-2 sm:columns-3 lg:columns-4 gap-2 space-y-2">
                {signedFiles.map((f) => (
                  <div key={f.id} className="break-inside-avoid overflow-hidden rounded-lg bg-surface-0">
                    {f.signed_url ? (
                      <Image
                        src={transformUrl(f.signed_url, 400)}
                        alt={f.filename}
                        width={400}
                        height={300}
                        className="w-full h-auto object-cover"
                        unoptimized
                      />
                    ) : (
                      <div className="aspect-square flex items-center justify-center">
                        <Images size={18} className="text-[#333]" />
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  )
}
