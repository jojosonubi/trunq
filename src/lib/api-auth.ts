import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

/**
 * Verifies the current request has a valid authenticated session.
 *
 * Usage in an API route handler:
 *   const auth = await requireApiUser()
 *   if (auth.response) return auth.response
 *   // auth.user is now typed as non-null
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
 * Verifies the current request is from an authenticated admin user.
 *
 * Usage in an API route handler:
 *   const auth = await requireAdminUser()
 *   if (auth.response) return auth.response
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
