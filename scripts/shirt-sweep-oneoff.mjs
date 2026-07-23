/**
 * sweep.mjs — one-off: find the RECESS 10 x Nike tee across Recessland 2026.
 * Base64 thumbnails → Sonnet batch (50% off), forced tool call, no DB writes.
 * Matches land in /tmp/shirt-hunt/matches.json.
 *
 *   node /tmp/shirt-hunt/sweep.mjs --go     (dry run without --go)
 */
import dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })
import { createClient } from '@supabase/supabase-js'
import Anthropic from '@anthropic-ai/sdk'
import sharp from 'sharp'
import { writeFileSync } from 'fs'

const GO = process.argv.includes('--go')
const RESUME_BATCH = (process.argv.find(a => a.startsWith('--resume=')) ?? '').slice(9) || null
const START_CHUNK  = Number((process.argv.find(a => a.startsWith('--start-chunk=')) ?? '').slice(14) || 0)
const EVENT_ID = '6c5527a5-a7b3-41ef-b872-061fca9e52cf' // Recessland 2026
const BATCH_SIZE = 800
const DL_CONCURRENCY = 24
const POLL_MS = 30_000
const POLL_MAX = 240 // ~2h
const ts = () => new Date().toISOString().slice(11, 19)
const sleep = (ms) => new Promise(r => setTimeout(r, ms))

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

const SHIRT_DESC = `A white t-shirt with a large multi-element front print (RECESS 10 x Nike anniversary tee):
- "RECESS" in cream/white 3D block letters on a dark outline, angled upward, top-left
- Large red PIXELATED numbers "2016" and "2026" behind/right of the logo
- "Enjoy Your Life!" in blue-and-white chrome graffiti script, centre-right
- A yellow starburst/sun character with a winking face whose mouth is a black Nike swoosh, centre-left
- "THE PARTY OF THE PEOPLE" in green serif capitals with black shadow, lower half
- Small yellow pixel text "LDN TO DA WORLD !" at the bottom
The shirt may be worn with sleeves cut off (as a sleeveless/muscle tee). Match ONLY this design —
NOT: black Recessland tees, "I'd Rather Be At Recessland" tees, Corteiz x Recess tees (busy cartoon
collage print), airbrush "Enjoy Your Life" tees (script only, no RECESS block logo), or lineup-print tees.`

const SPOT_TOOL = {
  name: 'spot_shirt',
  description: 'Report whether the specific t-shirt appears in the photo.',
  input_schema: {
    type: 'object',
    properties: {
      match: { type: 'boolean', description: 'True if at least one person in the photo is wearing the described shirt (partial visibility or cut sleeves count).' },
      confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
      wearer_count: { type: 'integer', description: 'How many people are wearing it. 0 if no match.' },
      note: { type: 'string', description: 'One short line: where in frame / what confirmed or ruled it out.' },
    },
    required: ['match', 'confidence', 'wearer_count', 'note'],
  },
}

async function fetchRows() {
  const rows = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase.from('media_files')
      .select('id, thumbnail_url, display_path, storage_path')
      .eq('event_id', EVENT_ID).eq('file_type', 'image').is('deleted_at', null)
      .order('created_at', { ascending: true })
      .range(from, from + 999)
    if (error) throw new Error(`fetch: ${error.message}`)
    rows.push(...(data ?? []))
    if (!data || data.length < 1000) break
  }
  return rows
}

async function downloadB64(row) {
  const path = row.thumbnail_url ?? row.display_path ?? row.storage_path
  const { data, error } = await supabase.storage.from('media').download(path)
  if (error) throw new Error(`${path}: ${error.message}`)
  const buf = Buffer.from(await data.arrayBuffer())
  return (await sharp(buf).rotate().resize({ width: 800, height: 800, fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 75 }).toBuffer()).toString('base64')
}

async function main() {
  const rows = await fetchRows()
  console.log(`[${ts()}] ${rows.length} images in Recessland 2026`)
  if (!GO) { console.log('--- DRY RUN: re-run with --go to submit (billable) ---'); return }

  // resume: carry forward matches already ingested
  const matches = []
  const failures = []
  try {
    const prev = JSON.parse((await import('fs')).readFileSync('/tmp/shirt-hunt/matches.json', 'utf8'))
    matches.push(...(prev.matches ?? []))
    failures.push(...(prev.failures ?? []))
    if (matches.length || failures.length) console.log(`[${ts()}] resumed with ${matches.length} prior matches, ${failures.length} prior failures`)
  } catch { /* fresh run */ }

  for (let b = START_CHUNK; b * BATCH_SIZE < rows.length; b++) {
    const chunk = rows.slice(b * BATCH_SIZE, (b + 1) * BATCH_SIZE)
    const reattach = RESUME_BATCH && b === START_CHUNK
    let batchId
    let pathById

    if (reattach) {
      batchId = RESUME_BATCH
      pathById = new Map(chunk.map(r => [r.id, r.display_path ?? r.storage_path]))
      console.log(`[${ts()}] batch ${b + 1}: re-attaching to ${batchId}`)
    } else {
      // download thumbnails with bounded concurrency
      const loaded = []
      for (let i = 0; i < chunk.length; i += DL_CONCURRENCY) {
        const part = await Promise.all(chunk.slice(i, i + DL_CONCURRENCY).map(async (row) => {
          try { return { id: row.id, b64: await downloadB64(row), path: row.display_path ?? row.storage_path } }
          catch (e) { failures.push({ id: row.id, err: String(e.message) }); return null }
        }))
        loaded.push(...part.filter(Boolean))
        if (i % 240 === 0) console.log(`[${ts()}] batch ${b + 1}: downloaded ${Math.min(i + DL_CONCURRENCY, chunk.length)}/${chunk.length}`)
      }

      const requests = loaded.map((r) => ({
        custom_id: r.id,
        params: {
          model: 'claude-sonnet-4-6',
          max_tokens: 300,
          tools: [SPOT_TOOL],
          tool_choice: { type: 'tool', name: 'spot_shirt' },
          messages: [{ role: 'user', content: [
            { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: r.b64 } },
            { type: 'text', text: `Look for this exact t-shirt in the photo:\n\n${SHIRT_DESC}\n\nIs anyone in this photo wearing it?` },
          ] }],
        },
      }))
      const batch = await anthropic.messages.batches.create({ requests })
      batchId = batch.id
      pathById = new Map(loaded.map(r => [r.id, r.path]))
      console.log(`[${ts()}] batch ${b + 1}: submitted ${batchId} (${requests.length} requests)`)
    }

    let done = null
    for (let i = 0; i < POLL_MAX; i++) {
      try {
        done = await anthropic.messages.batches.retrieve(batchId)
      } catch (e) {
        console.log(`[${ts()}]   poll error (will retry): ${e.message}`)
        await sleep(POLL_MS)
        continue
      }
      if (done.processing_status === 'ended') break
      if (i % 4 === 0) { const c = done.request_counts; console.log(`[${ts()}]   ${done.processing_status} — processing:${c.processing} ok:${c.succeeded} err:${c.errored}`) }
      await sleep(POLL_MS)
    }
    if (done?.processing_status !== 'ended') throw new Error(`batch ${batchId} did not end`)

    for await (const item of await anthropic.messages.batches.results(batchId)) {
      if (item.result.type !== 'succeeded') { failures.push({ id: item.custom_id, err: item.result.type }); continue }
      const tool = item.result.message.content.find(x => x.type === 'tool_use')
      const r = tool?.input
      if (r?.match) matches.push({ id: item.custom_id, path: pathById.get(item.custom_id), ...r })
    }
    console.log(`[${ts()}] batch ${b + 1}: done — running match total: ${matches.length}`)
    writeFileSync('/tmp/shirt-hunt/matches.json', JSON.stringify({ matches, failures }, null, 2))
  }
  console.log(`[${ts()}] SWEEP COMPLETE — ${matches.length} matches, ${failures.length} failures → /tmp/shirt-hunt/matches.json`)
}

main().catch((e) => { console.error('FATAL:', e); process.exit(1) })
