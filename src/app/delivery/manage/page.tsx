import { requireAuth } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { signStoragePaths } from '@/lib/supabase/storage'
import Navbar from '@/components/layout/Navbar'
import DeliveryManageClient from '@/components/delivery/DeliveryManageClient'
import type { MediaFile, Tag } from '@/types'

export const revalidate = 0

export default async function DeliveryManagePage() {
  const profile  = await requireAuth()
  const supabase = createClient()

  const [linksResult, eventsResult, photosResult] = await Promise.all([
    supabase
      .from('delivery_links')
      .select('id, event_id, token, created_at, events(id, name, date)')
      .order('created_at', { ascending: false }),
    supabase
      .from('events')
      .select('id, name')
      .is('deleted_at', null)
      .order('date', { ascending: false }),
    supabase
      .from('media_files')
      .select('id, event_id, filename, storage_path, public_url, file_type, quality_score, dominant_colours, tags(value, tag_type)')
      .eq('review_status', 'approved')
      .eq('file_type', 'image')
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(400),
  ])

  type RawPhoto = Pick<MediaFile, 'id' | 'event_id' | 'filename' | 'storage_path' | 'public_url' | 'file_type' | 'quality_score' | 'dominant_colours'> & {
    tags?: Pick<Tag, 'value' | 'tag_type'>[]
  }

  // Sign approved photo thumbnails
  const rawPhotos  = (photosResult.data ?? []) as RawPhoto[]
  const paths      = rawPhotos.map((p) => p.storage_path)
  const signedMap  = paths.length > 0 ? await signStoragePaths(paths) : new Map<string, string>()
  const photos     = rawPhotos.map((p) => ({
    ...p,
    dominant_colours: p.dominant_colours ?? [],
    signed_url: signedMap.get(p.storage_path) ?? undefined,
  }))

  return (
    <div className="min-h-screen bg-surface-0">
      <Navbar profile={profile} />
      <DeliveryManageClient
        links={(linksResult.data ?? []) as any[]}
        events={(eventsResult.data ?? []) as { id: string; name: string }[]}
        photos={photos}
      />
    </div>
  )
}
