/**
 * POST /api/webhooks/user-created
 *
 * Called by a Supabase Database Webhook on INSERT to public.profiles.
 * Sends a welcome email to the new user.
 *
 * Setup in Supabase dashboard:
 *   Database → Webhooks → Create webhook
 *     Table:   public.profiles
 *     Events:  INSERT
 *     URL:     https://your-domain.com/api/webhooks/user-created
 *     Headers: Authorization: Bearer <SUPABASE_WEBHOOK_SECRET>
 *
 * Password reset is handled natively by Supabase Auth.
 * Customise that template at: Authentication → Email Templates → Reset Password.
 */

import { NextRequest, NextResponse } from 'next/server'
import * as React from 'react'
import { sendEmail } from '@/lib/email'
import WelcomeEmail from '../../../../../emails/WelcomeEmail'

interface ProfileRecord {
  id:         string
  email:      string
  full_name?: string | null
  role:       string
  created_at: string
}

interface WebhookPayload {
  type:   'INSERT' | 'UPDATE' | 'DELETE'
  table:  string
  record: ProfileRecord
  schema: string
}

export async function POST(request: NextRequest) {
  // Verify the shared secret set in the Supabase webhook config
  const secret  = process.env.SUPABASE_WEBHOOK_SECRET
  const authHeader = request.headers.get('authorization')

  if (secret) {
    if (!authHeader || authHeader !== `Bearer ${secret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
  }

  let payload: WebhookPayload
  try {
    payload = await request.json() as WebhookPayload
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  // Only handle INSERT on profiles
  if (payload.type !== 'INSERT' || payload.table !== 'profiles') {
    return NextResponse.json({ ok: true })
  }

  const { email, full_name } = payload.record
  if (!email) {
    return NextResponse.json({ error: 'No email on record' }, { status: 400 })
  }

  const result = await sendEmail({
    to:      email,
    subject: 'Welcome to Trunq',
    react:   React.createElement(WelcomeEmail, { name: full_name ?? undefined }),
  })

  if (result.error) {
    // Don't fail the webhook — log and return 200 so Supabase doesn't retry endlessly
    console.error('[webhook/user-created] email send failed:', result.error)
  }

  return NextResponse.json({ ok: true, emailId: result.id ?? null })
}
