import { NextResponse } from 'next/server'
import { requireApiUserWithOrg } from '@/lib/api-auth'

function getBaseUrl(): string | null {
  const v = process.env.NEXT_PUBLIC_VERCEL_URL ?? process.env.VERCEL_URL
  if (v) return `https://${v}`
  if (process.env.NODE_ENV === 'development') return 'http://localhost:3000'
  return null
}

export async function POST() {
  const auth = await requireApiUserWithOrg()
  if (auth.response) return auth.response
  if (auth.organisationRole !== 'owner') {
    return NextResponse.json({ error: 'Owner role required' }, { status: 403 })
  }

  const taskSecret = process.env.TASK_SECRET
  if (!taskSecret) return NextResponse.json({ error: 'TASK_SECRET env var not set' }, { status: 500 })

  const baseUrl = getBaseUrl()
  if (!baseUrl) return NextResponse.json({ error: 'Cannot determine app URL — set NEXT_PUBLIC_VERCEL_URL or VERCEL_URL' }, { status: 500 })

  try {
    const upstream = await fetch(`${baseUrl}/api/foto-lab/index`, {
      method:  'POST',
      headers: { 'x-task-secret': taskSecret },
    })
    const body = await upstream.json()
    return NextResponse.json(body, { status: upstream.status })
  } catch (err) {
    console.error('[admin/index-faces] upstream fetch failed:', err instanceof Error ? err.message : err)
    return NextResponse.json({ error: 'Internal fetch to /api/foto-lab/index failed' }, { status: 500 })
  }
}
