import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Look up the organisation_id for an authenticated user via organisation_members.
 * Returns null if the user has no membership (shouldn't happen in normal flow).
 */
export async function getUserOrgId(
  supabase: SupabaseClient,
  userId: string,
): Promise<string | null> {
  const { data, error } = await supabase
    .from('organisation_members')
    .select('organisation_id')
    .eq('user_id', userId)
    .limit(1)
    .maybeSingle()
  if (error || !data) return null
  return data.organisation_id
}

/**
 * Look up the organisation_id for an event.
 * Returns null if the event doesn't exist or has no organisation_id.
 */
export async function getEventOrgId(
  supabase: SupabaseClient,
  eventId: string,
): Promise<string | null> {
  const { data, error } = await supabase
    .from('events')
    .select('organisation_id')
    .eq('id', eventId)
    .maybeSingle()
  if (error || !data) return null
  return data.organisation_id
}

/**
 * Look up the organisation_id for a media file.
 * Returns null if the file doesn't exist or has no organisation_id.
 */
export async function getMediaFileOrgId(
  supabase: SupabaseClient,
  mediaFileId: string,
): Promise<string | null> {
  const { data, error } = await supabase
    .from('media_files')
    .select('organisation_id')
    .eq('id', mediaFileId)
    .maybeSingle()
  if (error || !data) return null
  return data.organisation_id
}
