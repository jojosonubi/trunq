import { requireAuth } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { signStoragePaths } from '@/lib/supabase/storage'
import Navbar from '@/components/layout/Navbar'
import QueueClient from '@/components/queue/QueueClient'
import type { MediaFile } from '@/types'

export const revalidate = 0

export default async function QueuePage() {
  const profile  = await requireAuth()
  const supabase = createClient()

  const [photosResult, eventsResult] = await Promise.all([
    supabase
      .from('media_files')
      .select('*, events!inner(id, name, date, photographers)')
      .or('review_status.eq.pending,review_status.eq.held')
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(500),
    supabase
      .from('events')
      .select('id, name')
      .is('deleted_at', null)
      .order('date', { ascending: false }),
  ])

  const rawPhotos = (photosResult.data ?? []) as (MediaFile & {
    events: { id: string; name: string; date: string; photographers: string[] } | null
  })[]

  // Sign storage paths for thumbnails
  const paths     = rawPhotos.map((p) => p.storage_path).filter(Boolean)
  const signedMap = paths.length > 0 ? await signStoragePaths(paths) : new Map<string, string>()
  const photos    = rawPhotos.map((p) => ({
    ...p,
    signed_url: signedMap.get(p.storage_path) ?? undefined,
  }))

  return (
    <div className="min-h-screen bg-surface-0">
      <Navbar profile={profile} />
      <QueueClient
        initialPhotos={photos}
        events={(eventsResult.data ?? []) as { id: string; name: string }[]}
        role={profile.role}
      />
    </div>
  )
}
