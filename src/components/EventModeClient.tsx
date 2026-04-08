'use client'

import { useState, useRef, useCallback, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Camera, ChevronLeft, Wifi, WifiOff, Radio } from 'lucide-react'
import Link from 'next/link'
import clsx from 'clsx'
import type { Event, MediaFile } from '@/types'
import { neutralizeOrientation } from '@/lib/exif'

interface Profile { id: string; name?: string; email?: string; role: string }
interface Props { event: Event; profile: Profile }
interface UploadItem { id: string; file: File; progress: number; status: 'uploading' | 'done' | 'error'; previewUrl: string }

// Channel name shared with LiveFeedClient
export const liveFeedChannel = (eventId: string) => `live-feed-broadcast-${eventId}`

export default function EventModeClient({ event, profile }: Props) {
  const [uploads, setUploads] = useState<UploadItem[]>([])
  const [recentPhotos, setRecentPhotos] = useState<MediaFile[]>([])
  const [isConnected, setIsConnected] = useState(false)
  const [totalCount, setTotalCount] = useState(event.media_count ?? 0)
  const [sendToFeed, setSendToFeed] = useState(false)

  const fileInputRef  = useRef<HTMLInputElement>(null)
  // Stable client — createClient() must not be called on every render
  const supabaseRef   = useRef(createClient())
  const supabase      = supabaseRef.current
  // Broadcast channel ref — populated inside the effect, not during render
  const channelRef    = useRef<ReturnType<typeof supabase.channel> | null>(null)

  const isAdmin = profile.role === 'admin'
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const p = profile as any
  const photographerName: string = p.full_name || p.name || profile.email?.split('@')[0] || profile.id

  function attachPublicUrls(files: MediaFile[]): MediaFile[] {
    return files.map((f) => ({
      ...f,
      signed_url: supabase.storage.from('media').getPublicUrl(f.storage_path).data.publicUrl,
    }))
  }

  // Subscribe to realtime so the "recent photos" strip stays live
  useEffect(() => {
    const channel = supabase
      .channel(`event-mode-${event.id}`)
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'media_files',
        filter: `event_id=eq.${event.id}`,
      }, (payload) => {
        const newFile = payload.new as MediaFile
        const [withUrl] = attachPublicUrls([newFile])
        setRecentPhotos((prev) => [withUrl, ...prev].slice(0, 30))
        setTotalCount((prev) => prev + 1)
      })
      .subscribe((status) => setIsConnected(status === 'SUBSCRIBED'))

    supabase
      .from('media_files')
      .select('*')
      .eq('event_id', event.id)
      .eq('file_type', 'image')
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(30)
      .then(({ data }) => {
        if (data) setRecentPhotos(attachPublicUrls(data as MediaFile[]))
      })

    return () => { supabase.removeChannel(channel) }
  }, [event.id])

  // Create and subscribe the broadcast channel inside an effect, not during render
  useEffect(() => {
    const ch = supabase.channel(liveFeedChannel(event.id))
    ch.subscribe()
    channelRef.current = ch
    return () => {
      supabase.removeChannel(ch)
      channelRef.current = null
    }
  }, [event.id])

  const handleFiles = useCallback(async (files: FileList) => {
    const newUploads: UploadItem[] = Array.from(files).map((file) => ({
      id: crypto.randomUUID(), file, progress: 0, status: 'uploading',
      previewUrl: URL.createObjectURL(file),
    }))
    setUploads((prev) => [...newUploads, ...prev])

    for (const item of newUploads) {
      const uploadFile = await neutralizeOrientation(item.file)
      const formData = new FormData()
      formData.append('file', uploadFile)
      formData.append('event_id', event.id)
      formData.append('photographer', photographerName)

      try {
        const responseText = await new Promise<string>((resolve, reject) => {
          const xhr = new XMLHttpRequest()
          xhr.upload.onprogress = (e) => {
            if (e.lengthComputable) {
              setUploads((prev) => prev.map((u) =>
                u.id === item.id ? { ...u, progress: Math.round((e.loaded / e.total) * 100) } : u
              ))
            }
          }
          xhr.onload = () => {
            if (xhr.status >= 200 && xhr.status < 300) {
              setUploads((prev) => prev.map((u) =>
                u.id === item.id ? { ...u, status: 'done', progress: 100 } : u
              ))
              resolve(xhr.responseText)
            } else {
              reject(new Error(xhr.statusText))
            }
          }
          xhr.onerror = () => reject(new Error('Network error'))
          xhr.open('POST', '/api/upload')
          xhr.send(formData)
        })

        // Broadcast to the live feed channel if the toggle is on
        if (sendToFeed) {
          try {
            const json = JSON.parse(responseText) as { mediaFile?: MediaFile }
            if (json.mediaFile) {
              const [mediaFile] = attachPublicUrls([json.mediaFile])
              channelRef.current?.send({
                type: 'broadcast',
                event: 'new-photo',
                payload: { mediaFile },
              })
            }
          } catch {
            // Non-critical — broadcast failure doesn't break the upload
          }
        }
      } catch {
        setUploads((prev) => prev.map((u) =>
          u.id === item.id ? { ...u, status: 'error' } : u
        ))
      }
    }
  }, [event.id, photographerName, sendToFeed])

  const activeUploads = uploads.filter((u) => u.status === 'uploading')
  const sessionDone   = uploads.filter((u) => u.status === 'done').length

  return (
    <div className="min-h-screen bg-surface-0 flex flex-col">
      <header className="px-4 h-14 flex items-center justify-between border-b border-[#1a1a1a] sticky top-0 z-20 bg-surface-0">
        <Link
          href={`/projects/${event.id}`}
          className="flex items-center gap-1 text-[#888] hover:text-white transition-colors"
        >
          <ChevronLeft size={18} />
          <span className="text-sm">Archive</span>
        </Link>

        <div className="text-center">
          <p className="text-white text-sm font-semibold truncate max-w-[180px]">{event.name}</p>
          <p className="text-[#555] text-xs">{totalCount} photos total</p>
        </div>

        <div className="flex items-center gap-1.5">
          {isConnected
            ? <Wifi size={15} className="text-green-500" />
            : <WifiOff size={15} className="text-[#555]" />}
          <div className={`w-1.5 h-1.5 rounded-full ${isConnected ? 'bg-green-500 animate-pulse' : 'bg-surface-3'}`} />
        </div>
      </header>

      <div className="flex-1 flex flex-col items-center px-4 pt-10 pb-8">
        {/* Camera button */}
        <button
          onClick={() => fileInputRef.current?.click()}
          className="w-36 h-36 rounded-full bg-white flex items-center justify-center mb-5 active:scale-95 transition-transform duration-150"
        >
          <Camera size={52} className="text-[#0a0a0a]" />
        </button>
        <p className="text-[#555] text-sm mb-1">Tap to upload photos</p>
        {sessionDone > 0 && (
          <p className="text-green-500 text-xs font-medium">✓ {sessionDone} uploaded this session</p>
        )}

        {/* Send to Live Feed toggle — admin only */}
        {isAdmin && (
          <label className="flex items-center gap-2.5 mt-5 cursor-pointer select-none">
            <div className="relative">
              <input
                type="checkbox"
                checked={sendToFeed}
                onChange={(e) => setSendToFeed(e.target.checked)}
                className="sr-only peer"
              />
              <div className="w-9 h-5 bg-surface-0 border border-[#2a2a2a] rounded-full peer-checked:bg-red-500/80 transition-colors" />
              <div className="absolute top-0.5 left-0.5 w-4 h-4 bg-[#555] rounded-full transition-all peer-checked:translate-x-4 peer-checked:bg-white" />
            </div>
            <span className={clsx(
              'text-xs flex items-center gap-1.5 transition-colors',
              sendToFeed ? 'text-red-400' : 'text-[#555]'
            )}>
              <Radio size={12} className={sendToFeed ? 'animate-pulse' : ''} />
              {sendToFeed ? 'Broadcasting to Live Feed' : 'Send to Live Feed'}
            </span>
          </label>
        )}

        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept="image/*"
          className="hidden"
          onChange={(e) => e.target.files && handleFiles(e.target.files)}
        />

        {/* Active uploads */}
        {activeUploads.length > 0 && (
          <div className="w-full max-w-sm mt-6 space-y-2">
            {activeUploads.map((upload) => (
              <div
                key={upload.id}
                className="bg-surface-0 border border-[#1f1f1f] rounded-xl p-3 flex items-center gap-3"
              >
                <img src={upload.previewUrl} alt="" className="w-10 h-10 rounded-lg object-cover shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-white text-xs truncate mb-1.5">{upload.file.name}</p>
                  <div className="h-1 bg-surface-2 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-white rounded-full transition-all duration-200"
                      style={{ width: `${upload.progress}%` }}
                    />
                  </div>
                </div>
                <span className="text-[#555] text-xs tabular-nums shrink-0">{upload.progress}%</span>
              </div>
            ))}
          </div>
        )}

        {/* Recent photos strip */}
        {recentPhotos.length > 0 && (
          <div className="w-full mt-8">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
              <p className="text-[#555] text-xs uppercase tracking-widest">Recent uploads</p>
            </div>
            <div className="grid grid-cols-3 gap-0.5">
              {recentPhotos.map((photo) => (
                <div key={photo.id} className="aspect-square relative overflow-hidden bg-surface-0">
                  <img
                    src={photo.signed_url ?? photo.public_url}
                    alt=""
                    className="w-full h-full object-cover"
                    loading="lazy"
                  />
                  {photo.photographer && (
                    <div className="absolute bottom-0 left-0 right-0 px-1.5 py-1 bg-gradient-to-t from-black/80 to-transparent">
                      <p className="text-white text-[9px] truncate">{photo.photographer}</p>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
