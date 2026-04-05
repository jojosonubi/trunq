import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { requireAuth } from '@/lib/auth'
import EventModeClient from '@/components/EventModeClient'
import type { Event } from '@/types'

export const revalidate = 0

interface Props { params: { id: string } }

export default async function EventModePage({ params }: Props) {
  const profile = await requireAuth()
  const supabase = createClient()
  const { data: event, error } = await supabase.from('events').select('*').eq('id', params.id).is('deleted_at', null).single()
  if (error || !event) notFound()
  return <EventModeClient event={event as Event} profile={profile} />
}
