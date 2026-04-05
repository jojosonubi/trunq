import { NextRequest, NextResponse } from 'next/server'
import { requireApiUser } from '@/lib/api-auth'
import { createServiceClient } from '@/lib/supabase/service'
import { writeAudit } from '@/lib/audit'

// POST /api/audit — log a client-side action (e.g. photo viewed in lightbox)
export async function POST(req: NextRequest) {
  const auth = await requireApiUser()
  if (auth.response) return auth.response

  const body = await req.json() as {
    action:       string
    entityType?:  string
    entityId?:    string
    metadata?:    Record<string, unknown>
  }

  if (!body.action) {
    return NextResponse.json({ error: 'Missing action' }, { status: 400 })
  }

  const service = createServiceClient()
  await writeAudit(service, {
    userId:     auth.user.id,
    action:     body.action,
    entityType: body.entityType,
    entityId:   body.entityId,
    metadata:   body.metadata,
  })

  return NextResponse.json({ ok: true })
}
