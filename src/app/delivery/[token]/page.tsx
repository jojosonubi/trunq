import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { signMediaFiles } from '@/lib/supabase/storage'
import { writeAudit } from '@/lib/audit'
import DeliveryPortal from '@/components/DeliveryPortal'
import type { Event, MediaFile } from '@/types'

export const revalidate = 0

interface Props {
  params: { token: string }
}

export default async function DeliveryPage({ params }: Props) {
  const supabase = createClient()

  // Resolve token → event_id
  const { data: link } = await supabase
    .from('delivery_links')
    .select('event_id')
    .eq('token', params.token)
    .single()

  if (!link) notFound()

  // Fetch event + approved files in parallel
  const [eventResult, filesResult] = await Promise.all([
    supabase.from('events').select('*').eq('id', link.event_id).is('deleted_at', null).single(),
    supabase
      .from('media_files')
      .select('*')
      .eq('event_id', link.event_id)
      .eq('review_status', 'approved')
      .is('deleted_at', null)
      .order('created_at', { ascending: true }),
  ])

  if (eventResult.error || !eventResult.data) notFound()

  const files = await signMediaFiles(
    (filesResult.data ?? []) as MediaFile[],
    24 * 60 * 60, // 24-hour expiry for delivery links
  )

  // Audit: log portal access (no user_id — public access via token)
  const service = createServiceClient()
  writeAudit(service, {
    userId:     null,
    action:     'delivery_portal_accessed',
    entityType: 'event',
    entityId:   link.event_id,
    metadata:   { token: params.token, file_count: files.length },
  }).catch(() => {})

  return (
    <DeliveryPortal
      event={eventResult.data as Event}
      files={files}
    />
  )
}
