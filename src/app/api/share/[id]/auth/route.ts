import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { checkRateLimit, recordAttempt, createShareSession } from '@/lib/share-session'
import bcrypt from 'bcryptjs'

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown'

  // Rate limiting
  const allowed = await checkRateLimit(id, ip)
  if (!allowed) {
    return NextResponse.json(
      { error: 'Too many attempts. Please wait 15 minutes.' },
      { status: 429 }
    )
  }

  const { password, email } = await req.json() as { password: string; email?: string }

  const supabase = createServiceClient()

  // Fetch the share link
  const { data: link } = await supabase
    .from('share_links')
    .select('id, password_hash, expires_at, is_active, project_id')
    .eq('id', id)
    .single()

  if (!link || !link.is_active) {
    await recordAttempt(id, ip)
    return NextResponse.json({ error: 'Invalid or expired link.' }, { status: 404 })
  }

  if (link.expires_at && new Date(link.expires_at) < new Date()) {
    await recordAttempt(id, ip)
    return NextResponse.json({ error: 'This link has expired.' }, { status: 410 })
  }

  const valid = await bcrypt.compare(password, link.password_hash)
  if (!valid) {
    await recordAttempt(id, ip)
    return NextResponse.json({ error: 'Incorrect password.' }, { status: 401 })
  }

  // Determine write access: email must be on the allowlist (if one exists)
  let hasWriteAccess = false
  const normalEmail  = email?.trim().toLowerCase() ?? null

  if (normalEmail) {
    const { count } = await supabase
      .from('share_link_allowlist')
      .select('*', { count: 'exact', head: true })
      .eq('share_link_id', id)
      .eq('email', normalEmail)

    if (count && count > 0) {
      hasWriteAccess = true
    } else {
      // If no allowlist exists at all, anyone with the password gets write access
      const { count: total } = await supabase
        .from('share_link_allowlist')
        .select('*', { count: 'exact', head: true })
        .eq('share_link_id', id)
      if (!total || total === 0) hasWriteAccess = true
    }
  } else {
    // No email provided — read-only access
    hasWriteAccess = false
  }

  await createShareSession({ shareLinkId: id, email: normalEmail, hasWriteAccess, ipAddress: ip })

  return NextResponse.json({ ok: true, hasWriteAccess, email: normalEmail })
}
