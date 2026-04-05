import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireApiUser } from '@/lib/api-auth'

function getServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  )
}

export async function PATCH(request: NextRequest) {
  const auth = await requireApiUser()
  if (auth.response) return auth.response

  try {
    const body = await request.json() as { id?: string; starred?: boolean }
    const { id, starred } = body

    if (!id || typeof starred !== 'boolean') {
      return NextResponse.json({ error: 'Missing id or starred' }, { status: 400 })
    }

    const supabase = getServiceClient()
    const { error } = await supabase
      .from('media_files')
      .update({ starred })
      .eq('id', id)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[star] error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
