/**
 * empty-backup-bucket.mjs — actually empty the media-backup bucket to reclaim storage.
 *
 * The earlier clear-backup run nulled the DB column but did NOT free storage
 * (it trusted "no error" instead of checking objects were actually removed, and
 * missed orphan objects with no DB row). This lists the REAL objects in the
 * bucket (recursively) and deletes them, counting ACTUAL removals returned by
 * the API.
 *
 * ⚠️ SAFETY:
 *   • BUCKET is hardcoded to 'media-backup' and asserted. It can NEVER touch
 *     'media' (your originals). It does not read or write the database at all.
 *   • Dry run by default: lists + counts, deletes nothing. Deletes only with --go.
 *   • Re-runnable/idempotent: re-run until it reports 0 remaining.
 *
 *   node scripts/empty-backup-bucket.mjs        # dry run — true object count
 *   node scripts/empty-backup-bucket.mjs --go   # actually delete everything in media-backup
 */

import dotenv from 'dotenv'
import { createClient } from '@supabase/supabase-js'
dotenv.config({ path: '.env.local' })

const GO     = process.argv.includes('--go')
const BUCKET = 'media-backup'
if (BUCKET !== 'media-backup') { console.error('REFUSING: BUCKET must be media-backup.'); process.exit(1) }

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
const PAGE = 1000
const DEL_CHUNK = 100

// List one prefix fully (paginated). Returns { files:[fullpaths], folders:[prefixes] }
async function listPrefix(prefix) {
  const files = [], folders = []
  for (let offset = 0; ; offset += PAGE) {
    const { data, error } = await sb.storage.from(BUCKET).list(prefix, { limit: PAGE, offset })
    if (error) throw new Error(`list "${prefix}" failed: ${error.message}`)
    if (!data || data.length === 0) break
    for (const o of data) {
      const full = prefix ? `${prefix}/${o.name}` : o.name
      if (o.id === null) folders.push(full)   // id null = a folder/prefix
      else files.push(full)
    }
    if (data.length < PAGE) break
  }
  return { files, folders }
}

// Walk the whole bucket (one level of event folders, but recurse defensively).
async function collectAll() {
  const all = []
  const queue = ['']
  while (queue.length) {
    const prefix = queue.shift()
    const { files, folders } = await listPrefix(prefix)
    all.push(...files)
    queue.push(...folders)
    if (all.length && all.length % 5000 < files.length) console.log(`  …discovered ${all.length} objects so far`)
  }
  return all
}

async function main() {
  console.log(GO ? `*** LIVE RUN (--go): deleting ALL objects in "${BUCKET}" ***`
                 : '--- DRY RUN: listing only, nothing deleted. Re-run with --go to execute. ---')
  console.log('Bucket "media" (originals) is never touched. No DB reads/writes.\n')

  console.log('Scanning media-backup for real objects…')
  const paths = await collectAll()
  console.log(`\nActual objects in media-backup: ${paths.length}`)
  if (paths.length === 0) { console.log('Bucket already empty. Nothing to do.'); return }
  console.log('Samples:')
  for (const p of paths.slice(0, 3)) console.log(`  - ${p}`)

  if (!GO) {
    console.log(`\nDRY RUN: would delete ${paths.length} objects from ${BUCKET}. Nothing deleted.`)
    return
  }

  let removed = 0, failed = 0
  for (let i = 0; i < paths.length; i += DEL_CHUNK) {
    const chunk = paths.slice(i, i + DEL_CHUNK)
    const { data, error } = await sb.storage.from(BUCKET).remove(chunk)
    if (error) { failed += chunk.length; console.error(`  chunk @${i}: error ${error.message}`); continue }
    removed += (data?.length ?? 0)           // count ACTUAL removals, not chunk size
    if ((data?.length ?? 0) !== chunk.length) console.warn(`  chunk @${i}: asked ${chunk.length}, removed ${data?.length ?? 0}`)
    if ((i / DEL_CHUNK) % 20 === 0) console.log(`  …${removed} actually removed so far`)
  }
  console.log(`\nDONE. actually removed=${removed}, chunk errors=${failed}.`)
  console.log('Re-run the dry run to confirm 0 objects remain.')
}

main().catch(err => { console.error('FATAL:', err); process.exit(1) })
