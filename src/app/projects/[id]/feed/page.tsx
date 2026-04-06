import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { signMediaFiles } from '@/lib/supabase/storage'
import LiveFeedClient from '@/components/LiveFeedClient'
import type { Event, MediaFile } from '@/types'

export const revalidate = 0

interface Props { params: { id: string } }

export default async function ProjectFeedPage({ params }: Props) {
  const supabase = createClient()
  const [eventResult, photosResult] = await Promise.all([
    supabase.from('events').select('*').eq('id', params.id).is('deleted_at', null).single(),
    supabase.from('media_files').select('*').eq('event_id', params.id).eq('file_type', 'image').is('deleted_at', null).order('created_at', { ascending: false }).limit(100),
  ])
  if (eventResult.error || !eventResult.data) notFound()
  const initialPhotos = await signMediaFiles((photosResult.data ?? []) as MediaFile[])
  return <LiveFeedClient event={eventResult.data as Event} initialPhotos={initialPhotos} />
}
