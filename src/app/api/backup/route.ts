import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireAdminUser } from '@/lib/api-auth'

function getServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  )
}

export interface BackupStats {
  total: number
  backed_up: number
  missing: number
  missing_files: Array<{
    id: string
    filename: string
    storage_path: string
    event_id: string
    created_at: string
  }>
}

// GET /api/backup — returns backup coverage stats (admin only)
export async function GET() {
  const auth = await requireAdminUser()
  if (auth.response) return auth.response

  const supabase = getServiceClient()

  const [totalRes, backedUpRes, missingRes] = await Promise.all([
    supabase
      .from('media_files')
      .select('id', { count: 'exact', head: true })
      .is('deleted_at', null),

    supabase
      .from('media_files')
      .select('id', { count: 'exact', head: true })
      .is('deleted_at', null)
      .not('backup_storage_path', 'is', null),

    supabase
      .from('media_files')
      .select('id, filename, storage_path, event_id, created_at')
      .is('deleted_at', null)
      .is('backup_storage_path', null)
      .order('created_at', { ascending: false })
      .limit(100),
  ])

  const stats: BackupStats = {
    total:         totalRes.count    ?? 0,
    backed_up:     backedUpRes.count ?? 0,
    missing:       (totalRes.count ?? 0) - (backedUpRes.count ?? 0),
    missing_files: (missingRes.data ?? []) as BackupStats['missing_files'],
  }

  return NextResponse.json(stats)
}

// POST /api/backup — retry backup for a single file by id (admin only)
export async function POST(req: Request) {
  const auth = await requireAdminUser()
  if (auth.response) return auth.response

  const body = await req.json() as { id: string }
  if (!body.id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })

  const supabase = getServiceClient()

  // Fetch the file record
  const { data: file, error: fetchError } = await supabase
    .from('media_files')
    .select('storage_path')
    .eq('id', body.id)
    .single()

  if (fetchError || !file) {
    return NextResponse.json({ error: 'File not found' }, { status: 404 })
  }

  // Download from primary bucket
  const { data: blob, error: downloadError } = await supabase.storage
    .from('media')
    .download(file.storage_path)

  if (downloadError || !blob) {
    return NextResponse.json({ error: `Download failed: ${downloadError?.message}` }, { status: 500 })
  }

  // Upload to backup bucket
  const { error: uploadError } = await supabase.storage
    .from('media-backup')
    .upload(file.storage_path, blob, { upsert: true })

  if (uploadError) {
    return NextResponse.json({ error: `Backup upload failed: ${uploadError.message}` }, { status: 500 })
  }

  // Mark as backed up
  const { error: updateError } = await supabase
    .from('media_files')
    .update({ backup_storage_path: file.storage_path })
    .eq('id', body.id)

  if (updateError) {
    return NextResponse.json({ error: `DB update failed: ${updateError.message}` }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
