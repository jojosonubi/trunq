/**
 * POST /api/email/send
 *
 * Generic authenticated email send endpoint.
 * Admin-only — for internal tooling and manual triggers.
 *
 * Body: { type: 'welcome' | 'portal_access' | 'upload_complete', payload: {...} }
 */

import { NextRequest, NextResponse } from 'next/server'
import * as React from 'react'
import { requireAdminUser } from '@/lib/api-auth'
import { sendEmail } from '@/lib/email'
import WelcomeEmail        from '../../../../../emails/WelcomeEmail'
import PortalAccessEmail   from '../../../../../emails/PortalAccessEmail'
import UploadCompleteEmail from '../../../../../emails/UploadCompleteEmail'

type Body =
  | { type: 'welcome';        to: string; payload: { name?: string } }
  | { type: 'portal_access';  to: string; payload: { recipientName?: string; eventName: string; portalUrl: string; senderName?: string; expiresAt?: string | null } }
  | { type: 'upload_complete'; to: string; payload: { recipientName?: string; eventName: string; photoCount: number; projectUrl: string } }

export async function POST(request: NextRequest) {
  const auth = await requireAdminUser()
  if (auth.response) return auth.response

  let body: Body
  try {
    body = await request.json() as Body
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  if (!body.to || !body.type) {
    return NextResponse.json({ error: 'Missing required fields: to, type' }, { status: 400 })
  }

  let subject: string
  let element: React.ReactElement

  switch (body.type) {
    case 'welcome':
      subject = 'Welcome to Trunq'
      element = React.createElement(WelcomeEmail, body.payload)
      break

    case 'portal_access':
      subject = `Your photos from ${body.payload.eventName} are ready`
      element = React.createElement(PortalAccessEmail, body.payload)
      break

    case 'upload_complete':
      subject = `Upload complete — ${body.payload.eventName}`
      element = React.createElement(UploadCompleteEmail, body.payload)
      break

    default:
      return NextResponse.json({ error: 'Unknown email type' }, { status: 400 })
  }

  const result = await sendEmail({ to: body.to, subject, react: element })

  if (result.error) {
    return NextResponse.json({ error: result.error }, { status: 500 })
  }

  return NextResponse.json({ id: result.id })
}
