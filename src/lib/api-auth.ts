import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'

/**
 * Verifies the current request has a valid authenticated session.
 * Returns auth.user (non-null) and an error response on failure.
 */
export async function requireApiUser() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return {
      user: null,
      response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
    } as const
  }
  return { user, response: null } as const
}

/**
 * Verifies the current request has a valid authenticated session AND
 * resolves the user's primary organisation_id.
 *
 * Returns auth.user (non-null), auth.organisationId (non-null), and an
 * error response on failure (401 if not authenticated, 403 if no org
 * membership).
 *
 * Currently the user is assumed to belong to exactly one organisation
 * (Recess). When we onboard customers with multiple orgs, this helper
 * will need an org-context header to disambiguate.
 */
export async function requireApiUserWithOrg() {
  const baseAuth = await requireApiUser()
  if (baseAuth.response) {
    return { user: null, organisationId: null, response: baseAuth.response } as const
  }

  // Use service-role here to read organisation_members regardless of caller's
  // RLS scope — the membership check is the security boundary, not RLS.
  const service = createServiceClient()
  const { data: membership, error } = await service
    .from('organisation_members')
    .select('organisation_id, role')
    .eq('user_id', baseAuth.user.id)
    .limit(1)
    .maybeSingle()

  if (error || !membership) {
    return {
      user: null,
      organisationId: null,
      response: NextResponse.json({ error: 'No organisation membership found' }, { status: 403 }),
    } as const
  }

  return {
    user: baseAuth.user,
    organisationId: membership.organisation_id as string,
    organisationRole: membership.role as 'owner' | 'editor' | 'viewer',
    response: null,
  } as const
}

/**
 * Verifies the current request is from an authenticated admin user
 * (platform-level admin, not org-level).
 */
export async function requireAdminUser() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return {
      user: null,
      response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
    } as const
  }
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()
  if (profile?.role !== 'admin') {
    return {
      user: null,
      response: NextResponse.json({ error: 'Forbidden' }, { status: 403 }),
    } as const
  }
  return { user, response: null } as const
}
