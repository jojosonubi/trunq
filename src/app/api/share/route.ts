import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { createClient } from '@/lib/supabase/server'
import bcrypt from 'bcryptjs'

export async function GET(req: NextRequest) {
  const supabaseAuth = await createClient()
  const { data: { user } } = await supabaseAuth.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const projectId = req.nextUrl.searchParams.get('projectId')
  if (!projectId) return NextResponse.json({ error: 'projectId required' }, { status: 400 })

  const supabase = createServiceClient()
  const { data: links } = await supabase
    .from('share_links')
    .select(`
      id, label, folder_id, is_active, expires_at, show_watermark, created_at,
      share_link_sessions ( email, has_write_access, last_seen_at ),
      image_reviews ( media_id, reviewer_email, status, comment, updated_at )
    `)
    .eq('project_id', projectId)
    .eq('created_by', user.id)
    .order('created_at', { ascending: false })

  return NextResponse.json({ links: links ?? [] })
}

export async function POST(req: NextRequest) {
  const supabaseAuth = await createClient()
  const { data: { user } } = await supabaseAuth.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json() as {
    projectId:     string
    folderId?:     string | null
    password:      string
    expiresAt?:    string | null
    allowlist?:    string[]
    showWatermark?: boolean
    label?:        string
  }

  if (!body.projectId || !body.password) {
    return NextResponse.json({ error: 'projectId and password are required' }, { status: 400 })
  }

  const hash = await bcrypt.hash(body.password, 10)

  const supabase = createServiceClient()

  // Resolve organisation_id from the parent event (project)
  const { data: event, error: eventErr } = await supabase
    .from('events')
    .select('organisation_id')
    .eq('id', body.projectId)
    .single()

  if (eventErr || !event) {
    return NextResponse.json({ error: 'Event not found' }, { status: 404 })
  }

  const { data: link, error } = await supabase
    .from('share_links')
    .insert({
      project_id:      body.projectId,
      folder_id:       body.folderId ?? null,
      password_hash:   hash,
      expires_at:      body.expiresAt ?? null,
      created_by:      user.id,
      show_watermark:  body.showWatermark ?? false,
      label:           body.label ?? null,
      organisation_id: event.organisation_id,
    })
    .select('id')
    .single()

  if (error || !link) {
    return NextResponse.json({ error: 'Failed to create share link' }, { status: 500 })
  }

  // Insert allowlist emails
  if (body.allowlist && body.allowlist.length > 0) {
    const rows = body.allowlist
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean)
      .map((email) => ({ share_link_id: link.id, email }))
    await supabase.from('share_link_allowlist').insert(rows)
  }

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? `https://${req.headers.get('host')}`
  return NextResponse.json({ id: link.id, url: `${baseUrl}/share/${link.id}` })
}
