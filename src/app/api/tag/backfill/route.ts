import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireApiUser } from '@/lib/api-auth'
import { scoreMediaFile } from '@/lib/scoring'

function getServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  )
}

export async function POST(request: NextRequest) {
  const auth = await requireApiUser()
  if (auth.response) return auth.response

  // Optional: limit to a specific event_id
  const body = await request.json().catch(() => ({})) as { event_id?: string }

  const supabase = getServiceClient()

  let query = supabase
    .from('media_files')
    .select('id')
    .is('quality_score', null)
    .eq('file_type', 'image')
    .is('deleted_at', null)
    .order('created_at', { ascending: true })

  if (body.event_id) {
    query = query.eq('event_id', body.event_id)
  }

  const { data: unscored, error: fetchErr } = await query

  if (fetchErr) {
    return NextResponse.json({ error: fetchErr.message }, { status: 500 })
  }

  const ids = (unscored ?? []).map((r: { id: string }) => r.id)

  if (ids.length === 0) {
    return NextResponse.json({ processed: 0, failed: 0, scores: [] })
  }

  const scores: { id: string; score: number }[] = []
  let failed = 0

  // Sequential — avoid Claude API rate limits
  for (const id of ids) {
    const BACKOFF = [1000, 2000, 4000]
    let success = false

    for (let attempt = 0; attempt <= 3; attempt++) {
      if (attempt > 0) {
        await new Promise((res) => setTimeout(res, BACKOFF[attempt - 1]))
      }
      try {
        const result = await scoreMediaFile(id)
        scores.push({ id, score: result.quality_score })
        success = true
        break
      } catch (err) {
        console.error(`[backfill] attempt ${attempt + 1} failed for ${id}:`, err)
      }
    }

    if (!success) {
      failed++
    }

    // Small delay between files to be kind to rate limits
    await new Promise((res) => setTimeout(res, 200))
  }

  return NextResponse.json({
    processed: scores.length,
    failed,
    scores,
  })
}
