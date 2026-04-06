'use client'

import { useState, useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Radio } from 'lucide-react'
import Link from 'next/link'
import type { Event, MediaFile } from '@/types'
import { liveFeedChannel } from '@/components/EventModeClient'
import { transformUrl } from '@/lib/supabase/storage'
import Pill from '@/components/ui/Pill'

interface Props { event: Event; initialPhotos: MediaFile[] }

export default function LiveFeedClient({ event, initialPhotos }: Props) {
  const [photos, setPhotos] = useState<MediaFile[]>(initialPhotos)
  const [pendingCount, setPendingCount] = useState(0)
  const [isConnected, setIsConnected] = useState(false)
  const [newIds, setNewIds] = useState<Set<string>>(new Set())
  const supabase = createClient()
  const isAtTop = useRef(true)

  useEffect(() => {
    const onScroll = () => { isAtTop.current = window.scrollY < 120 }
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  useEffect(() => {
    // Listen to the broadcast channel published by EventModeClient when
    // "Send to Live Feed" toggle is on. Photos only appear here if explicitly
    // broadcast — uploads with the toggle off are silent.
    const channel = supabase
      .channel(liveFeedChannel(event.id))
      .on('broadcast', { event: 'new-photo' }, (msg: { payload?: { mediaFile?: MediaFile } }) => {
        const newFile = msg.payload?.mediaFile
        if (!newFile || newFile.file_type !== 'image') return

        if (isAtTop.current) {
          setPhotos((prev) => [newFile, ...prev])
          setNewIds((prev) => new Set([...prev, newFile.id]))
          setTimeout(() => setNewIds((prev) => { const n = new Set(prev); n.delete(newFile.id); return n }), 2000)
        } else {
          setPendingCount((c) => c + 1)
        }
      })
      .subscribe((status) => setIsConnected(status === 'SUBSCRIBED'))

    return () => { supabase.removeChannel(channel) }
  }, [event.id])

  return (
    <div className="min-h-screen bg-surface-0">
      <header className="sticky top-0 z-20 bg-surface-0/95 backdrop-blur border-b border-[#1a1a1a]">
        <div className="max-w-7xl mx-auto px-6 h-14 flex items-center justify-between">
          <Link href={`/projects/${event.id}`} className="text-[#888] text-sm hover:text-white transition-colors">
            ← {event.name}
          </Link>
          <div className="flex items-center gap-4">
            <span className="text-[#555] text-xs tabular-nums">{photos.length} photos</span>
            <div className="flex items-center gap-1.5">
              <div className={`w-2 h-2 rounded-full transition-colors ${isConnected ? 'bg-red-500 animate-pulse' : 'bg-surface-3'}`} />
              <span className="text-xs text-[#555]">{isConnected ? 'Live' : 'Connecting...'}</span>
            </div>
          </div>
        </div>
      </header>
      {pendingCount > 0 && (
        <button onClick={() => window.location.reload()} className="w-full bg-white text-black text-sm font-semibold py-3 text-center hover:bg-[#eee] transition-colors sticky top-14 z-10">
          ↑ {pendingCount} new photo{pendingCount !== 1 ? 's' : ''} — tap to load
        </button>
      )}
      <div className="max-w-7xl mx-auto px-3 py-4">
        {photos.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-48 text-center">
            <Radio size={40} className="text-[#2a2a2a] mb-5" />
            <p className="text-[#666] text-sm">Waiting for the first upload...</p>
            <p className="text-[#444] text-xs mt-1.5">Photos appear here in real time as photographers shoot</p>
          </div>
        ) : (
          <div className="columns-2 sm:columns-3 lg:columns-4 xl:columns-5 gap-1.5 space-y-1.5">
            {photos.map((photo) => (
              <div key={photo.id} className="break-inside-avoid overflow-hidden rounded-sm bg-surface-0 relative group">
                <img src={transformUrl(photo.signed_url ?? photo.public_url, 400)} alt="" className="w-full h-auto block" loading="lazy" />
                <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-200 bg-gradient-to-t from-black/70 via-transparent to-transparent flex items-end p-2">
                  <div>
                    {photo.photographer && <p className="text-white text-xs font-medium">{photo.photographer}</p>}
                    {photo.quality_score != null && (
                      <Pill variant="score">{photo.quality_score}</Pill>
                    )}
                  </div>
                </div>
                {newIds.has(photo.id) && <div className="absolute inset-0 ring-2 ring-white/40 rounded-sm pointer-events-none" />}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}