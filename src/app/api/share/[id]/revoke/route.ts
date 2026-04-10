import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { createClient } from '@/lib/supabase/server'

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabaseAuth = await createClient()
  const { data: { user } } = await supabaseAuth.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = createServiceClient()

  // Verify ownership
  const { data: link } = await supabase
    .from('share_links')
    .select('created_by')
    .eq('id', id)
    .single()

  if (!link || link.created_by !== user.id) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  await supabase.from('share_links').update({ is_active: false }).eq('id', id)

  return NextResponse.json({ ok: true })
}
