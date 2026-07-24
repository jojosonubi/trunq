import { createClient } from '@supabase/supabase-js'

/** Service-role client — bypasses RLS. Use only in trusted server-side API routes. */
export function createServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    // Server-side only: never persist auth state between invocations.
    { auth: { persistSession: false } }
  )
}
