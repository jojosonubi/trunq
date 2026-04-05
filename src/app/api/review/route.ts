import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireApiUser } from '@/lib/api-auth'
import { createServiceClient } from '@/lib/supabase/service'
import { writeAudit } from '@/lib/audit'

function getServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  )
}

const VALID_STATUSES = ['pending', 'approved', 'rejected', 'held'] as const

const STATUS_ACTION: Record<string, string> = {
  approved: 'photo_approved',
  rejected: 'photo_rejected',
  held:     'photo_held',
  pending:  'photo_pending',
}

export async function PATCH(request: NextRequest) {
  const auth = await requireApiUser()
  if (auth.response) return auth.response

  try {
    const body = await request.json() as { ids?: string[]; status?: string }
    const { ids, status } = body

    if (!ids?.length || !status) {
      return NextResponse.json({ error: 'Missing ids or status' }, { status: 400 })
    }

    if (!VALID_STATUSES.includes(status as typeof VALID_STATUSES[number])) {
      return NextResponse.json({ error: `Invalid status: ${status}` }, { status: 400 })
    }

    const supabase = getServiceClient()
    const { error } = await supabase
      .from('media_files')
      .update({ review_status: status })
      .in('id', ids)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    const action  = STATUS_ACTION[status] ?? `photo_${status}`
    const service = createServiceClient()
    await writeAudit(service, {
      userId:     auth.user.id,
      action,
      entityType: 'photo',
      entityId:   ids[0],
      metadata:   { ids, count: ids.length, status },
    })

    return NextResponse.json({ updated: ids.length })
  } catch (err) {
    console.error('[review] error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
