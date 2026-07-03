/**
 * clear-backup.mjs — delete the media-backup duplicate copies to reclaim storage.
 *
 * Deletes the objects in the **media-backup** bucket that the DB records as backups
 * (backup_storage_path IS NOT NULL), then nulls backup_storage_path on those rows.
 *
 * ⚠️ SAFETY — read this:
 *   • backup_storage_path == storage_path (same path, different bucket). The ONLY
 *     thing protecting your originals is the bucket name. This script hardcodes
 *     BUCKET='media-backup' and asserts it — it can NEVER touch the 'media' bucket
 *     (your originals) and never changes storage_path.
 *   • Dry run by default: prints what WOULD be deleted, deletes/changes NOTHING.
 *     Deletes ONLY when run with `--go`.
 *   • Idempotent + re-runnable: re-running picks up any remaining non-null rows.
 *
 *   node scripts/clear-backup.mjs        # dry run — counts + samples, no changes
 *   node scripts/clear-backup.mjs --go   # actually delete media-backup copies
 */

import dotenv from 'dotenv'
import { createClient } from '@supabase/supabase-js'

dotenv.config({ path: '.env.local' })

const GO     = process.argv.includes('--go')
const BUCKET = 'media-backup'              // <-- the disposable backup bucket. NEVER 'media'.
const DEL_CHUNK = 200                       // storage.remove() paths per call
const DB_CHUNK  = 500                       // DB rows per update

// Hard guard: refuse to run if anyone ever points this at the originals bucket.
if (BUCKET !== 'media-backup') {
  console.error('REFUSING: BUCKET must be "media-backup". Aborting to protect originals.')
  process.exit(1)
}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!SUPABASE_URL || !SERVICE_KEY) { console.error('Missing Supabase env'); process.exit(1) }
const supabase = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } })

// Fetch every row that has a backup copy recorded (paginate past the 1000 cap).
async function fetchBackedUp() {
  const rows = []
  const PAGE = 1000
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from('media_files')
      .select('id, backup_storage_path')
      .not('backup_storage_path', 'is', null)
      .order('id', { ascending: true })
      .range(from, from + PAGE - 1)
    if (error) throw new Error(`fetch failed: ${error.message}`)
    rows.push(...(data ?? []))
    if (!data || data.length < PAGE) break
  }
  return rows
}

async function main() {
  console.log(GO
    ? `*** LIVE RUN (--go): will DELETE objects from the "${BUCKET}" bucket and null backup_storage_path ***`
    : '--- DRY RUN: no deletions, no DB writes. Re-run with --go to execute. ---')
  console.log(`Target bucket: ${BUCKET}   (originals bucket "media" is NEVER touched; storage_path is never changed)\n`)

  const rows = await fetchBackedUp()
  console.log(`Rows with a backup copy (backup_storage_path set): ${rows.length}`)
  if (rows.length === 0) { console.log('Nothing to delete.'); return }

  // Sanity: confirm none of the paths is empty (which could be misinterpreted).
  const bad = rows.filter(r => !r.backup_storage_path || typeof r.backup_storage_path !== 'string')
  if (bad.length) { console.error(`ABORT: ${bad.length} rows have an invalid backup_storage_path.`); process.exit(1) }

  console.log('Sample paths that would be deleted from media-backup:')
  for (const r of rows.slice(0, 3)) console.log(`  - ${r.backup_storage_path}`)
  console.log(`  …and ${rows.length - 3} more`)

  if (!GO) {
    console.log(`\nDRY RUN: would delete ${rows.length} objects from "${BUCKET}" and null backup_storage_path on ${rows.length} rows.`)
    console.log('Nothing deleted, nothing changed. Re-run with --go to execute.')
    return
  }

  let deleted = 0, nulled = 0, errors = 0
  for (let i = 0; i < rows.length; i += DEL_CHUNK) {
    const chunk = rows.slice(i, i + DEL_CHUNK)
    const paths = chunk.map(r => r.backup_storage_path)

    const { error: delErr } = await supabase.storage.from(BUCKET).remove(paths)
    if (delErr) {
      errors++
      console.error(`  chunk @${i}: remove error (will NOT null these rows so a re-run retries): ${delErr.message}`)
      continue
    }
    deleted += paths.length

    // Only null rows whose storage objects were removed without error.
    const ids = chunk.map(r => r.id)
    for (let j = 0; j < ids.length; j += DB_CHUNK) {
      const { error: updErr } = await supabase
        .from('media_files')
        .update({ backup_storage_path: null })
        .in('id', ids.slice(j, j + DB_CHUNK))
      if (updErr) console.error(`  chunk @${i}: DB null error: ${updErr.message}`)
      else nulled += ids.slice(j, j + DB_CHUNK).length
    }

    if ((i / DEL_CHUNK) % 10 === 0) console.log(`  …${deleted} deleted / ${nulled} un-marked so far`)
  }

  console.log(`\nDONE. deleted=${deleted} objects from ${BUCKET}, backup_storage_path nulled on ${nulled} rows, chunk errors=${errors}.`)
  if (errors) console.log('Some chunks errored — re-run `node scripts/clear-backup.mjs --go` to retry the remainder.')
}

main().catch(err => { console.error('FATAL:', err); process.exit(1) })
