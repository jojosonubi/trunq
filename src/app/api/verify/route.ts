import { NextRequest, NextResponse } from 'next/server'
import { createHash } from 'crypto'
import { requireAdminUser } from '@/lib/api-auth'
import { createServiceClient } from '@/lib/supabase/service'

interface FileRow {
  id: string
  filename: string
  storage_path: string
  file_hash: string
}

interface VerifyResult {
  id:        string
  filename:  string
  valid:     boolean
  expected?: string
  actual?:   string
  error?:    string
}

async function verifyOne(service: ReturnType<typeof createServiceClient>, file: FileRow): Promise<VerifyResult> {
  try {
    const { data: signed } = await service.storage
      .from('media')
      .createSignedUrl(file.storage_path, 60)

    if (!signed?.signedUrl) {
      return { id: file.id, filename: file.filename, valid: false, error: 'Could not sign URL' }
    }

    const res = await fetch(signed.signedUrl)
    if (!res.ok) {
      return { id: file.id, filename: file.filename, valid: false, error: `HTTP ${res.status}` }
    }

    const actual = createHash('sha256').update(Buffer.from(await res.arrayBuffer())).digest('hex')
    const valid  = actual === file.file_hash

    return {
      id: file.id, filename: file.filename, valid,
      ...(valid ? {} : { expected: file.file_hash, actual }),
    }
  } catch (err) {
    return { id: file.id, filename: file.filename, valid: false, error: String(err) }
  }
}

// GET /api/verify — list all files that have a stored hash (for progressive UI)
export async function GET(_req: NextRequest) {
  const auth = await requireAdminUser()
  if (auth.response) return auth.response

  const service = createServiceClient()
  const { data, error } = await service
    .from('media_files')
    .select('id, filename')
    .not('file_hash', 'is', null)
    .is('deleted_at', null)
    .order('created_at', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ files: data ?? [] })
}

// POST /api/verify — batch-verify up to `limit` files (default 50, max 100)
export async function POST(req: NextRequest) {
  const auth = await requireAdminUser()
  if (auth.response) return auth.response

  const body  = await req.json().catch(() => ({})) as { limit?: number }
  const limit = Math.min(body.limit ?? 50, 100)

  const service = createServiceClient()
  const { data: files, error } = await service
    .from('media_files')
    .select('id, filename, storage_path, file_hash')
    .not('file_hash', 'is', null)
    .is('deleted_at', null)
    .order('created_at', { ascending: true })
    .limit(limit)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Verify in batches of 5 to avoid overwhelming storage concurrency limits
  const BATCH = 5
  const rows  = (files ?? []) as FileRow[]
  const results: VerifyResult[] = []

  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH)
    const batchResults = await Promise.all(batch.map((f) => verifyOne(service, f)))
    results.push(...batchResults)
  }

  const mismatches = results.filter((r) => !r.valid)
  return NextResponse.json({
    checked:    results.length,
    valid:      results.length - mismatches.length,
    invalid:    mismatches.length,
    mismatches,
  })
}
