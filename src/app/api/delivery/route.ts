import { NextRequest, NextResponse } from 'next/server'
import * as React from 'react'
import { createClient } from '@supabase/supabase-js'
import { requireApiUser } from '@/lib/api-auth'
import { createServiceClient } from '@/lib/supabase/service'
import { writeAudit } from '@/lib/audit'
import { sendEmail } from '@/lib/email'
import PortalAccessEmail from '../../../../emails/PortalAccessEmail'

function getServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  )
}

function portalUrl(token: string): string {
  const base = process.env.NEXT_PUBLIC_APP_URL ?? 'https://trunq.so'
  return `${base}/delivery/${token}`
}

export async function POST(request: NextRequest) {
  const auth = await requireApiUser()
  if (auth.response) return auth.response

  try {
    const body = await request.json() as {
      event_id?:       string
      // Optional: include to trigger a portal-access email to the client
      recipient_email?: string
      recipient_name?:  string
      sender_name?:     string
    }

    const { event_id, recipient_email, recipient_name, sender_name } = body

    if (!event_id) {
      return NextResponse.json({ error: 'Missing event_id' }, { status: 400 })
    }

    const supabase = getServiceClient()

    const { data: existing } = await supabase
      .from('delivery_links')
      .select('token, events(name, expires_at)')
      .eq('event_id', event_id)
      .maybeSingle()

    if (existing) {
      // Link already exists — optionally send the email for the existing link
      if (recipient_email) {
        const eventName = (existing.events as { name?: string } | null)?.name ?? 'your event'
        sendEmail({
          to:      recipient_email,
          subject: `Your photos from ${eventName} are ready`,
          react:   React.createElement(PortalAccessEmail, {
            recipientName: recipient_name,
            eventName,
            portalUrl:     portalUrl(existing.token),
            senderName:    sender_name,
          }),
        }).catch(() => {})
      }
      return NextResponse.json({ token: existing.token })
    }

    // Fetch event name for the email
    const { data: event } = await supabase
      .from('events')
      .select('name')
      .eq('id', event_id)
      .single()

    const { data, error } = await supabase
      .from('delivery_links')
      .insert({ event_id })
      .select('token')
      .single()

    if (error || !data) {
      return NextResponse.json(
        { error: error?.message ?? 'Failed to create delivery link' },
        { status: 500 }
      )
    }

    const service = createServiceClient()
    const eventName = event?.name ?? 'your event'

    // Audit log
    await writeAudit(service, {
      userId:     auth.user.id,
      action:     'delivery_portal_created',
      entityType: 'event',
      entityId:   event_id,
      metadata:   { token: data.token },
    })

    // Send portal access email if recipient provided (fire-and-forget)
    if (recipient_email) {
      sendEmail({
        to:      recipient_email,
        subject: `Your photos from ${eventName} are ready`,
        react:   React.createElement(PortalAccessEmail, {
          recipientName: recipient_name,
          eventName,
          portalUrl:     portalUrl(data.token),
          senderName:    sender_name,
        }),
      }).then((result) => {
        if (result.error) {
          console.error('[delivery] portal email failed:', result.error)
          return
        }
        // Audit the email send
        writeAudit(service, {
          userId:     auth.user.id,
          action:     'delivery_portal_email_sent',
          entityType: 'event',
          entityId:   event_id,
          metadata:   { to: recipient_email, emailId: result.id },
        }).catch(() => {})
      }).catch(() => {})
    }

    return NextResponse.json({ token: data.token }, { status: 201 })
  } catch (err) {
    console.error('[delivery] error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
