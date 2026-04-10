import { cookies } from 'next/headers'
import { createServiceClient } from './supabase/service'

const COOKIE_NAME = 'trunq_share_session'
const COOKIE_TTL  = 60 * 60 * 24 * 30  // 30 days

export interface ShareSession {
  sessionId:      string
  shareLinkId:    string
  email:          string | null
  hasWriteAccess: boolean
}

/**
 * Read the share session cookie and validate it against the DB.
 * Returns null if missing, expired, or invalid.
 */
export async function getShareSession(shareLinkId: string): Promise<ShareSession | null> {
  const cookieStore = await cookies()
  const token = cookieStore.get(COOKIE_NAME)?.value
  if (!token) return null

  const supabase = createServiceClient()
  const { data } = await supabase
    .from('share_link_sessions')
    .select('id, share_link_id, email, has_write_access')
    .eq('session_token', token)
    .eq('share_link_id', shareLinkId)
    .single()

  if (!data) return null

  // Touch last_seen_at (fire and forget)
  supabase
    .from('share_link_sessions')
    .update({ last_seen_at: new Date().toISOString() })
    .eq('id', data.id)
    .then(() => {})

  return {
    sessionId:      data.id,
    shareLinkId:    data.share_link_id,
    email:          data.email,
    hasWriteAccess: data.has_write_access,
  }
}

/**
 * Create a new share session row and set the httpOnly cookie.
 */
export async function createShareSession(opts: {
  shareLinkId:    string
  email:          string | null
  hasWriteAccess: boolean
  ipAddress:      string | null
}): Promise<string> {
  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('share_link_sessions')
    .insert({
      share_link_id:    opts.shareLinkId,
      email:            opts.email,
      has_write_access: opts.hasWriteAccess,
      ip_address:       opts.ipAddress,
    })
    .select('session_token')
    .single()

  if (error || !data) throw new Error('Failed to create share session')

  const cookieStore = await cookies()
  cookieStore.set(COOKIE_NAME, data.session_token, {
    httpOnly: true,
    secure:   process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge:   COOKIE_TTL,
    path:     '/',
  })

  return data.session_token
}

/**
 * Check rate limiting: max 5 attempts per IP per link in 15 minutes.
 */
export async function checkRateLimit(shareLinkId: string, ip: string): Promise<boolean> {
  const supabase  = createServiceClient()
  const windowMs  = new Date(Date.now() - 15 * 60 * 1000).toISOString()
  const { count } = await supabase
    .from('share_link_attempts')
    .select('*', { count: 'exact', head: true })
    .eq('share_link_id', shareLinkId)
    .eq('ip_address', ip)
    .gte('attempted_at', windowMs)

  return (count ?? 0) < 5
}

export async function recordAttempt(shareLinkId: string, ip: string): Promise<void> {
  const supabase = createServiceClient()
  await supabase.from('share_link_attempts').insert({ share_link_id: shareLinkId, ip_address: ip })
}
