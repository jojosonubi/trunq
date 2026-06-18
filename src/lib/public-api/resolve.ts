import { createServiceClient } from '@/lib/supabase/service'

// DB-backed slug resolution for the public archive-browse surface.
//
// Distinct from the hardcoded maps in ./slugs.ts (which the stable kiosk routes
// — public/photos, public/galleries, foto-lab/match — depend on). Those stay
// untouched. New public endpoints use these live lookups so adding a public
// event needs no code change — just events.slug + is_public in the DB.

const ORG_SLUG_RE   = /^[a-z0-9-]{1,64}$/
const EVENT_SLUG_RE = /^[a-z0-9-]{1,128}$/

/** Resolve an organisation slug → id via organisations.slug. null if unknown/invalid. */
export async function resolvePublicOrgId(slug: string | null): Promise<string | null> {
  if (!slug || !ORG_SLUG_RE.test(slug)) return null
  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('organisations')
    .select('id')
    .eq('slug', slug)
    .maybeSingle()
  if (error || !data) return null
  return data.id
}

/**
 * Resolve an event slug → id within an org via events.slug. Only matches live
 * (non-deleted) events. Does NOT enforce is_public — callers that expose photos
 * publicly must check is_public themselves.
 */
export async function resolvePublicEventId(orgId: string, slug: string | null): Promise<string | null> {
  if (!slug || !EVENT_SLUG_RE.test(slug)) return null
  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('events')
    .select('id')
    .eq('organisation_id', orgId)
    .eq('slug', slug)
    .is('deleted_at', null)
    .maybeSingle()
  if (error || !data) return null
  return data.id
}
