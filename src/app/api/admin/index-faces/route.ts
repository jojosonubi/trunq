import { NextResponse } from 'next/server'
import { requireApiUserWithOrg } from '@/lib/api-auth'

const BASE_URL = process.env.NODE_ENV === 'development'
  ? 'http://localhost:3000'
  : 'https://www.trunq.so'

export async function POST() {
  const auth = await requireApiUserWithOrg()
  if (auth.response) return auth.response
  if (auth.organisationRole !== 'owner') {
    return NextResponse.json({ error: 'Owner role required' }, { status: 403 })
  }

  const taskSecret = process.env.TASK_SECRET
  if (!taskSecret) return NextResponse.json({ error: 'TASK_SECRET env var not set' }, { status: 500 })

  try {
    const upstream = await fetch(`${BASE_URL}/api/foto-lab/index`, {
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
