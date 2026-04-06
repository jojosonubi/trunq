import { NextResponse } from 'next/server'
import { requireApiUser } from '@/lib/api-auth'
import { createClient } from '@/lib/supabase/server'

export async function GET() {
  const auth = await requireApiUser()
  if (auth.response) return auth.response

  const supabase = createClient()
  const { count } = await supabase
    .from('media_files')
    .select('id', { count: 'exact', head: true })
    .or('review_status.eq.pending,review_status.eq.held')
    .is('deleted_at', null)

  return NextResponse.json({ count: count ?? 0 })
}
