import { NextRequest, NextResponse } from 'next/server'
import { randomBytes } from 'crypto'
import { createServiceClient } from '@/lib/supabase/service'
import { requireApiUserWithOrg } from '@/lib/api-auth'

type Kind = 'collection' | 'event'

function shareUrl(req: NextRequest, token: string): string {
  const base = process.env.NEXT_PUBLIC_APP_URL ?? `https://${req.headers.get('host')}`
  return `${base}/s/${token}`
}

async function verifyTarget(supabase: ReturnType<typeof createServiceClient>, kind: Kind, id: string, orgId: string) {
  const table = kind === 'collection' ? 'collections' : 'events'
  const { data } = await supabase.from(table).select('id').eq('id', id).eq('organisation_id', orgId).maybeSingle()
  return !!data
}

// GET /api/shares?kind=&target_id=  — current active share for a target (if any)
export async function GET(req: NextRequest) {
  const auth = await requireApiUserWithOrg()
  if (auth.response) return auth.response

  const kind = req.nextUrl.searchParams.get('kind') as Kind | null
  const targetId = req.nextUrl.searchParams.get('target_id')
  if ((kind !== 'collection' && kind !== 'event') || !targetId) {
    return NextResponse.json({ error: 'kind and target_id required' }, { status: 400 })
  }

  const supabase = createServiceClient()
  const { data } = await supabase
    .from('public_shares')
    .select('token')
    .eq('kind', kind)
    .eq('target_id', targetId)
    .eq('organisation_id', auth.organisationId)
    .is('revoked_at', null)
    .maybeSingle()

  return NextResponse.json({ share: data ? { token: data.token, url: shareUrl(req, data.token) } : null })
}

// POST { kind, target_id }  — create (idempotent) an active public share
export async function POST(req: NextRequest) {
  const auth = await requireApiUserWithOrg()
  if (auth.response) return auth.response

  const body = await req.json() as { kind?: Kind; target_id?: string }
  const kind = body.kind
  const targetId = body.target_id
  if ((kind !== 'collection' && kind !== 'event') || !targetId) {
    return NextResponse.json({ error: 'kind and target_id required' }, { status: 400 })
  }

  const supabase = createServiceClient()
  if (!(await verifyTarget(supabase, kind, targetId, auth.organisationId))) {
    return NextResponse.json({ error: 'Target not found' }, { status: 404 })
  }

  // Idempotent: return the existing active share if one exists.
  const { data: existing } = await supabase
    .from('public_shares')
    .select('token')
    .eq('kind', kind).eq('target_id', targetId).eq('organisation_id', auth.organisationId)
    .is('revoked_at', null)
    .maybeSingle()
  if (existing) return NextResponse.json({ token: existing.token, url: shareUrl(req, existing.token) })

  const token = randomBytes(9).toString('base64url') // 12 url-safe chars
  const { error } = await supabase.from('public_shares').insert({
    token, kind, target_id: targetId,
    organisation_id: auth.organisationId,
    created_by: auth.user.id,
  })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ token, url: shareUrl(req, token) })
}

// DELETE ?token=  — revoke an active share
export async function DELETE(req: NextRequest) {
  const auth = await requireApiUserWithOrg()
  if (auth.response) return auth.response

  const token = req.nextUrl.searchParams.get('token')
  if (!token) return NextResponse.json({ error: 'token required' }, { status: 400 })

  const supabase = createServiceClient()
  const { error } = await supabase
    .from('public_shares')
    .update({ revoked_at: new Date().toISOString() })
    .eq('token', token)
    .eq('organisation_id', auth.organisationId)
    .is('revoked_at', null)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
