import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

export type UserRole = 'admin' | 'producer' | 'photographer'

export interface UserProfile {
  id: string
  email: string
  full_name: string | null
  role: UserRole
  created_at: string
}

/** Returns the current user's profile, or null if not authenticated. */
export async function getProfile(): Promise<UserProfile | null> {
  const supabase = createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single()

  return (data as UserProfile | null) ?? null
}

/** Returns the profile or redirects to /login. */
export async function requireAuth(): Promise<UserProfile> {
  const profile = await getProfile()
  if (!profile) redirect('/login')
  return profile
}

