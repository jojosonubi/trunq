import { Resend } from 'resend'
import * as React from 'react'

// Lazily instantiated so the missing key doesn't throw at build time
let _resend: Resend | null = null
function getResend(): Resend {
  if (!_resend) _resend = new Resend(process.env.RESEND_API_KEY)
  return _resend
}

export const FROM_ADDRESS = 'Trunq <noreply@trunq.so>'

export interface SendResult {
  id?:    string
  error?: string
}

/**
 * Send a transactional email via Resend.
 * Never throws — returns { error } on failure so callers can log/audit.
 */
export async function sendEmail({
  to,
  subject,
  react,
}: {
  to:      string | string[]
  subject: string
  react:   React.ReactElement
}): Promise<SendResult> {
  if (!process.env.RESEND_API_KEY) {
    console.warn('[email] RESEND_API_KEY not set — skipping send')
    return { error: 'RESEND_API_KEY not configured' }
  }

  try {
    const { data, error } = await getResend().emails.send({
      from: FROM_ADDRESS,
      to,
      subject,
      react,
    })
    if (error) {
      console.error('[email] send failed:', error.message)
      return { error: error.message }
    }
    return { id: data?.id }
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    console.error('[email] unexpected error:', msg)
    return { error: msg }
  }
}
