// Live pipeline status page → uploads to Supabase storage every 60s.
// Phone-viewable via one long-lived signed URL (printed once at start).
import dotenv from 'dotenv'
import { readFileSync } from 'fs'
import { createClient } from '@supabase/supabase-js'

dotenv.config({ path: '/Users/jojosonubi/trunq/.env.local' })

const ORG = '2b557660-6bb3-4d41-9b49-71e860681b9c'
const PATH = '_ops/curation-progress.json'
const LOG = '/tmp/curation-rescore-b64.log'
const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })

async function counts() {
  const base = () => s.from('media_files').select('id', { count: 'exact', head: true })
    .eq('organisation_id', ORG).eq('file_type', 'image').is('deleted_at', null)
  const [{ count: total }, { count: scored }, { count: ranked }] = await Promise.all([
    base(), base().not('curation_score', 'is', null), base().not('curation_rank', 'is', null),
  ])
  return { total: total ?? 0, scored: scored ?? 0, ranked: ranked ?? 0 }
}

function logInfo() {
  try {
    const lines = readFileSync(LOG, 'utf8').split('\n')
    const batches = lines.filter((l) => l.includes('ingested —') || l.includes('downloaded')).slice(-6).reverse()
      .map((l) => l.trim().replace(/^batch /, 'B'))
    const lastLine = lines.filter((l) => l.trim()).slice(-1)[0]?.trim().slice(0, 90) ?? ''
    const lastGood = batches[0]?.match(/scored=(\d+) failed=(\d+)/)
    const health = lastGood ? (Number(lastGood[1]) > Number(lastGood[2]) ? 'good' : 'throttled') : 'warming up'
    return { batches, lastLine, health }
  } catch { return { batches: [], lastLine: 'no log yet', health: 'unknown' } }
}

function data(c, li) {
  return JSON.stringify({
    ts: new Date().toISOString(),
    total: c.total, scored: c.scored, ranked: c.ranked,
    health: li.health, batches: li.batches, last: li.lastLine,
  })
}

async function tick() {
  const html = data(await counts(), logInfo())
  const blob = new Blob([html], { type: 'application/json' })
  const { error } = await s.storage.from('media').upload(PATH, blob, { contentType: 'application/json', upsert: true })
  if (error) console.error(new Date().toISOString(), 'upload failed:', error.message)
}

await tick()   // create the object first, then sign it
const { data: signed, error: signErr } = await s.storage.from('media').createSignedUrl(PATH, 7 * 24 * 60 * 60)
if (signErr) { console.error('sign failed:', signErr.message); process.exit(1) }
console.log('STATUS PAGE URL:\n' + signed.signedUrl)
setInterval(tick, 60_000)
