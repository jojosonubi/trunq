import { NextRequest, NextResponse } from 'next/server'
import { requireApiUser } from '@/lib/api-auth'
import { scoreMediaFile } from '@/lib/scoring'

export async function POST(request: NextRequest) {
  const auth = await requireApiUser()
  if (auth.response) return auth.response

  try {
    const body = await request.json()
    const { media_file_id } = body as { media_file_id: string }

    if (!media_file_id) {
      return NextResponse.json({ error: 'Missing media_file_id' }, { status: 400 })
    }

    const result = await scoreMediaFile(media_file_id)

    return NextResponse.json({
      quality_score:    result.quality_score,
      description:      result.description,
      dominant_colours: result.dominant_colours,
      tags_written:     result.tags_written,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Tagging failed'
    console.error('[tag]', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
