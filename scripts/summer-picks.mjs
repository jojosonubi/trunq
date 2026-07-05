/**
 * summer-picks.mjs — FAST LANE: top 5 per summer (2017–2025) for tomorrow's post.
 *
 * Bypasses Anthropic URL-fetch (Supabase incident) entirely: downloads each
 * candidate derivative locally, resizes to ~1092px JPEG, sends BASE64 to the
 * API directly. Per summer: pool = top candidates by curation_score (where
 * scored) topped up by quality_score → two elimination rounds by IMAGE with
 * the v2 taste criteria → ranked top 5.
 *
 * Writes NOTHING to the DB. Outputs:
 *   /tmp/summer-picks.html                  — ranked contact sheet
 *   ~/Desktop/recess-summer-picks/<year>-<rank>-<photographer>.jpg  — winners, full display res
 *
 *   node scripts/summer-picks.mjs           # live (small: ~27 calls, ~$10)
 */

import dotenv from 'dotenv'
import { writeFileSync, mkdirSync } from 'fs'
import { homedir } from 'os'
import sharp from 'sharp'
import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@supabase/supabase-js'

dotenv.config({ path: '.env.local' })

const ORG    = '2b557660-6bb3-4d41-9b49-71e860681b9c'
const YEARS  = [2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025]
const POOL   = 40
const PICK   = 5
const DL_CONC = 4
const OUTDIR = `${homedir()}/Desktop/recess-summer-picks`

const supabase  = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

const CRITERIA = `You are the photo editor for RECESS (Black-led nightlife/festival brand) picking photos for an Instagram "summers through the years" post. Judge like a culture-magazine editor. What counts: anchored composition (subject OR structural anchor like a centred stage), MOTION (bodies mid-dance, joint movement, frames you can hear — chaos with a magnetic moment beats a lifeless portrait), intentional moments/story, styling (including styling that reads from behind, e.g. braids), expression, scale/place (venue as subject), rich well-exposed Black skin. Rotation/tilt is NOT a flaw. Out-of-focus illegibility IS. The 5 picks together should MIX portraits with motion and place — never all portraits, no near-duplicate compositions, max 2 per photographer.`

const PICK_TOOL = (n) => ({
  name: 'select_photos',
  description: `Select and rank the strongest ${n} photos.`,
  input_schema: {
    type: 'object',
    properties: {
      selections: {
        type: 'array',
        items: { type: 'object', properties: {
          index: { type: 'integer' }, note: { type: 'string' },
        }, required: ['index', 'note'] },
        description: `Exactly ${n} (fewer only if fewer candidates), strongest first.`,
      },
    },
    required: ['selections'],
  },
})

async function callWithRetry(params, tries = 3) {
  for (let i = 0; ; i++) {
    try { return await anthropic.messages.create(params) }
    catch (err) {
      if (i >= tries - 1) throw err
      console.log(`    retry ${i + 1}: ${err instanceof Error ? err.message.slice(0, 70) : err}`)
      await new Promise((r) => setTimeout(r, 8000 * (i + 1)))
    }
  }
}

async function judge(cands, keep, label) {
  const content = []
  cands.forEach((c, i) => {
    content.push({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: c.b64 } })
    content.push({ type: 'text', text: `IMAGE ${i} — photographer: ${c.photographer ?? 'unknown'} · event: ${c.event_name ?? ''}` })
  })
  content.push({ type: 'text', text: `${CRITERIA}\n\n${cands.length} candidates (${label}). Select and rank the strongest ${keep}.` })
  const res = await callWithRetry({
    model: 'claude-sonnet-4-6', max_tokens: 1500,
    tools: [PICK_TOOL(keep)], tool_choice: { type: 'tool', name: 'select_photos' },
    messages: [{ role: 'user', content }],
  })
  const block = res.content.find((b) => b.type === 'tool_use')
  const seen = new Set()
  return (block?.input?.selections ?? [])
    .map((s) => ({ ...cands[s.index], note: s.note }))
    .filter((p) => p && !seen.has(p.id) && seen.add(p.id))
    .slice(0, keep)
}

async function downloadResized(c) {
  const { data, error } = await supabase.storage.from('media').download(c.display_path)
  if (error || !data) throw new Error(`download ${c.id}: ${error?.message}`)
  const orig = Buffer.from(await data.arrayBuffer())
  const b64 = (await sharp(orig).rotate().resize({ width: 1092, height: 1092, fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 78 }).toBuffer()).toString('base64')
  return { b64, orig }
}

async function runConc(items, conc, fn) {
  let idx = 0; const out = []
  await Promise.all(Array.from({ length: Math.min(conc, items.length) }, async () => {
    while (idx < items.length) { const i = idx++; out[i] = await fn(items[i], i) }
  }))
  return out
}

async function main() {
  mkdirSync(OUTDIR, { recursive: true })
  const { data: evs } = await supabase.from('events').select('id, name, date')
    .eq('organisation_id', ORG).eq('is_public', true).is('deleted_at', null).not('date', 'is', null)
  const byYear = new Map()
  for (const e of evs ?? []) {
    const m = /^(\d{4})-(\d{2})/.exec(e.date); if (!m) continue
    const y = +m[1]
    if (!YEARS.includes(y) || !['05','06','07','08','09'].includes(m[2])) continue
    if (!byYear.has(y)) byYear.set(y, [])
    byYear.get(y).push(e)
  }

  const allPicks = []
  for (const year of YEARS) {
    const events = byYear.get(year) ?? []
    if (!events.length) { console.log(`SUMMER ${year}: no public summer events`); continue }
    const ids = events.map((e) => e.id)
    const evName = new Map(events.map((e) => [e.id, e.name]))

    const fetchTop = async (col) => {
      const { data } = await supabase.from('media_files')
        .select('id, display_path, event_id, photographer, curation_score, quality_score')
        .in('event_id', ids).eq('file_type', 'image').eq('review_status', 'approved')
        .is('deleted_at', null).not('display_path', 'is', null)
        .not(col, 'is', null).order(col, { ascending: false }).order('id', { ascending: false })
        .limit(POOL / 2 + 5)
      return data ?? []
    }
    const merged = new Map()
    for (const r of [...await fetchTop('curation_score'), ...await fetchTop('quality_score')]) {
      if (!merged.has(r.id)) merged.set(r.id, { ...r, event_name: evName.get(r.event_id) })
      if (merged.size >= POOL) break
    }
    const pool = [...merged.values()]
    console.log(`SUMMER ${year}: pool=${pool.length} — downloading…`)

    const loaded = []
    await runConc(pool, DL_CONC, async (c) => {
      try { const { b64, orig } = await downloadResized(c); loaded.push({ ...c, b64, orig }) }
      catch (e) { console.log(`  skip ${c.id.slice(0, 8)}: ${e.message.slice(0, 60)}`) }
    })
    console.log(`  loaded ${loaded.length}/${pool.length}`)
    if (!loaded.length) continue

    let finalists
    if (loaded.length <= 12) {
      finalists = await judge(loaded, Math.min(PICK, loaded.length), `SUMMER ${year} final`)
    } else {
      const mid = Math.ceil(loaded.length / 2)
      const g1 = await judge(loaded.slice(0, mid), 6, `SUMMER ${year} cull A`)
      const g2 = await judge(loaded.slice(mid), 6, `SUMMER ${year} cull B`)
      finalists = await judge([...g1, ...g2], PICK, `SUMMER ${year} FINAL — ranked picks for the post`)
    }

    finalists.forEach((f, i) => {
      const safe = (f.photographer ?? 'unknown').toLowerCase().replace(/[^a-z0-9]+/g, '-')
      writeFileSync(`${OUTDIR}/${year}-${i + 1}-${safe}.jpg`, f.orig)
    })
    allPicks.push({ year, picks: finalists })
    console.log(`  SUMMER ${year} → ${finalists.length} picks saved`)
  }

  // contact sheet
  const section = (s) => `
    <h2>SUMMER ${s.year}</h2><div class="grid">${s.picks.map((p, i) => `
      <div class="card"><img src="data:image/jpeg;base64,${p.b64}">
        <div class="meta"><b>#${i + 1}</b> · ${p.photographer ?? 'unknown'} · ${p.event_name ?? ''}<br><span class="note">${(p.note ?? '').replace(/</g, '&lt;')}</span></div>
      </div>`).join('')}</div>`
  writeFileSync('/tmp/summer-picks.html', `<!doctype html><meta charset="utf-8"><title>RECESS summer picks</title>
  <style>body{background:#111;color:#eee;font-family:ui-monospace,monospace;margin:20px}h2{color:#d33b3b;border-bottom:2px solid #333;padding-bottom:4px}
  .grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:12px;margin-bottom:28px}
  .card{background:#1c1c1c;border:1px solid #333;border-radius:6px;overflow:hidden}.card img{width:100%;display:block}
  .meta{padding:8px;font-size:11px;line-height:1.5}.note{color:#8fc97f}</style>
  <h1 style="font-size:16px">RECESS · 5 picks per summer 2017–2025 (rubric v2 comparative)</h1>
  ${allPicks.map(section).join('')}`)

  console.log(`\nDONE. ${allPicks.reduce((n, s) => n + s.picks.length, 0)} picks · sheet: /tmp/summer-picks.html · files: ${OUTDIR}`)
}

main().catch((err) => { console.error('FATAL:', err); process.exit(1) })
