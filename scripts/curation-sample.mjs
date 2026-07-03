/**
 * curation-sample.mjs — Rubric validation sample for the CURATION re-score.
 *
 * Draft of the "step 1" curatorial rubric (taste-based, 0–100) run over a
 * stratified sample (~20 photos per summer, 2016–2026, public summer events)
 * via the Message Batches API. WRITES NOTHING TO THE DB — outputs a ranked
 * HTML contact sheet (/tmp/curation-sample-v2.html) + JSON for eyeballing before
 * the full archive run.
 *
 *   node scripts/curation-sample.mjs        # billable but tiny (~$2)
 */

import dotenv from 'dotenv'
import { writeFileSync } from 'fs'
import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@supabase/supabase-js'

dotenv.config({ path: '.env.local' })

const ORG          = '2b557660-6bb3-4d41-9b49-71e860681b9c'   // recess
const MEDIA_BUCKET = 'media'
const PER_YEAR     = 20
const SIGN_TTL     = 24 * 60 * 60
const POLL_MS      = 15_000

const supabase  = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

// ─── The draft curatorial rubric ──────────────────────────────────────────────

const RUBRIC = `You are curating the RECESS photo archive for Instagram. Score this photo 0-100 for CURATORIAL quality — would we post this? Judge like a photo editor at a culture magazine, not a technical reviewer. RECESS is a nightlife/festival brand: its soul is people in MOTION as much as people in portraits. A magnetic moment in chaos outranks a competent but lifeless portrait.

WHAT MAKES A HIGH SCORE (each is a "nameable strength" — a photo needs at least one, clearly):
1. ANCHORED COMPOSITION — your eye lands immediately: a subject, a group, OR a structural anchor (a centred stage, leading lines, signage, architecture). Posed portraits AND structured wide shots both count.
2. MOTION — bodies mid-dance, joint movement between people, a whine caught mid-arc, the frame you can hear. Tilted horizons, rotated frames, mid-motion limbs and moderate motion blur are ENERGY here, not flaws — score the moment, not the tidiness.
3. INTENTIONAL MOMENT / STORY — subjects engaging the camera or each other with emotional charge, OR a frame that tells a story without faces (friends streaming toward the dancefloor, an embrace, a shared joke mid-laugh).
4. STYLING AS THE STORY — a great outfit, statement accessory, hair, cultural dress moment. INCLUDES styling that reads from BEHIND (braids cascading down a back, a gele, a printed jacket back) — no face needed.
5. EXPRESSION — genuine laughter, real connection between subjects, magnetic eye contact with the lens. The would-you-stop-scrolling test.
6. SCALE / PLACE — the venue as the subject: stage-to-crowd perspective (including shot from behind performers looking out), a festival sweep anchored by a centred stage, a frame that says "you had to be there."
7. COHERENT BACKDROP — background as staging (palms, disco ball, bunting, light), supporting craft.
8. SKIN RENDERING — flash/low-light exposure that renders Black skin rich and well-exposed; reward it. Blown-out or muddy skin drags a photo down.

DEMOTE FLAGS — a flag applies ONLY when the element is a FLAW, not the subject:
- crowd_soup: crowd with NO anchor and NO story. Does NOT apply when the crowd is structured around a clear anchor (centred stage, perspective lines) or carries narrative motion.
- backs_of_heads: backs as a DEAD subject. Does NOT apply when hair/styling reads from behind, when the backs carry story-motion, or in stage-perspective scale shots.
- phone_screens: only when screens dominate and cheapen the frame — incidental phones at a gig are normal life, ignore them.
- lineup_pose: stiff promoter-style row facing camera.
- unflattering_candid: mid-blink, mid-chew, caught-badly moments.
- blown_flash: flash-blasted, washed-out faces or skin.
- illegible: out of focus or motion-destroyed to the point nothing reads — this one is always a hard demote.

NEVER PENALISE: frame rotation or tilt (orientation is fixed in one click; tilt reads as energy), film grain, flash aesthetic, chaos around a magnetic moment.

SCORING BANDS (use the FULL range, avoid round multiples of 10, never cluster):
- 85-100: would post today, no hesitation — rare. Reachable by motion/chaos frames, not just clean portraits.
- 70-84: strong candidate, clearly has a nameable strength
- 50-69: decent archive photo, but no clear strength
- 25-49: weak — real flaws or nothing to look at
- 0-24: not curation material

FINAL CHECK: would a photo editor at a culture magazine run this image? Great spreads mix portraits WITH motion and place — judge each photo by its own strength, not by portrait standards.`

const SCORE_TOOL = {
  name: 'curate_image',
  description: 'Curatorial assessment of a RECESS archive photo for Instagram.',
  input_schema: {
    type: 'object',
    properties: {
      curation_score: { type: 'integer', description: 'Curatorial score 0-100 per the rubric bands. Use the full range; avoid round multiples of 10.' },
      primary_strength: {
        type: 'string',
        enum: ['anchored_composition', 'motion', 'intentional_moment', 'styling', 'expression', 'scale_place', 'coherent_backdrop', 'skin_rendering', 'none'],
        description: 'The single clearest nameable strength, or "none" if nothing stands out.',
      },
      flags: {
        type: 'array',
        items: { type: 'string', enum: ['crowd_soup', 'phone_screens', 'backs_of_heads', 'lineup_pose', 'unflattering_candid', 'blown_flash', 'illegible'] },
        description: 'Demote flags that apply — ONLY where the element is a flaw, not the subject. Empty array if none.',
      },
      reason: { type: 'string', description: 'One short sentence: why this score. Concrete, no vibe-prose.' },
    },
    required: ['curation_score', 'primary_strength', 'flags', 'reason'],
  },
}

// ─── Sample selection: stratified per summer ──────────────────────────────────

async function pickSample() {
  const { data: evs } = await supabase
    .from('events')
    .select('id, name, date')
    .eq('organisation_id', ORG).eq('is_public', true).is('deleted_at', null).not('date', 'is', null)
  const byYear = new Map()
  for (const e of evs ?? []) {
    const m = /^(\d{4})-(\d{2})/.exec(e.date)
    if (!m) continue
    const y = +m[1]
    if (y < 2016 || y > 2026 || !['05','06','07','08','09'].includes(m[2])) continue
    if (!byYear.has(y)) byYear.set(y, [])
    byYear.get(y).push(e)
  }

  const sample = []
  for (const y of [...byYear.keys()].sort()) {
    const ids = byYear.get(y).map((e) => e.id)
    const evName = new Map(byYear.get(y).map((e) => [e.id, e.name]))
    const rows = []
    for (let f = 0; ; f += 1000) {
      const { data } = await supabase
        .from('media_files')
        .select('id, display_path, thumbnail_url, event_id, photographer, quality_score')
        .in('event_id', ids)
        .eq('file_type', 'image').eq('review_status', 'approved').is('deleted_at', null)
        .not('display_path', 'is', null)
        .range(f, f + 999)
      rows.push(...(data ?? []))
      if (!data || data.length < 1000) break
    }
    // shuffle + take PER_YEAR
    for (let i = rows.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [rows[i], rows[j]] = [rows[j], rows[i]] }
    for (const r of rows.slice(0, PER_YEAR)) sample.push({ ...r, year: y, event_name: evName.get(r.event_id) })
  }
  return sample
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  // Reuse the previous run's photo set when available (direct v1→v2 diff);
  // pass --resample to draw a fresh sample instead.
  let sample
  let v1ById = new Map()
  if (!process.argv.includes('--resample')) {
    try {
      const prev = JSON.parse((await import('fs')).readFileSync('/tmp/curation-sample.json', 'utf8'))
      sample = prev.map((r) => ({ id: r.id, display_path: r.display_path, thumbnail_url: r.thumbnail_url, event_id: r.event_id, photographer: r.photographer, quality_score: r.quality_score, year: r.year, event_name: r.event_name }))
      v1ById = new Map(prev.map((r) => [r.id, r.curation_score]))
      console.log(`Reusing previous sample: ${sample.length} photos (pass --resample for a fresh draw)`)
    } catch { /* fall through to fresh sample */ }
  }
  if (!sample) {
    sample = await pickSample()
    console.log(`Sample: ${sample.length} photos across ${new Set(sample.map((s) => s.year)).size} summers`)
  }

  // Sign display + thumb URLs
  const paths = [...new Set(sample.flatMap((s) => [s.display_path, s.thumbnail_url].filter(Boolean)))]
  const urlMap = new Map()
  for (let i = 0; i < paths.length; i += 500) {
    const { data } = await supabase.storage.from(MEDIA_BUCKET).createSignedUrls(paths.slice(i, i + 500), SIGN_TTL)
    for (const item of (data ?? [])) if (item.signedUrl && item.path) urlMap.set(item.path, item.signedUrl)
  }

  const requests = sample.map((s) => ({
    custom_id: s.id,
    params: {
      model: 'claude-sonnet-4-6',
      max_tokens: 512,
      tools: [SCORE_TOOL],
      tool_choice: { type: 'tool', name: 'curate_image' },
      messages: [{ role: 'user', content: [
        { type: 'image', source: { type: 'url', url: urlMap.get(s.display_path) ?? '' } },
        { type: 'text', text: RUBRIC },
      ] }],
    },
  }))

  const batch = await anthropic.messages.batches.create({ requests })
  console.log(`Submitted ${batch.id} (${requests.length} reqs) — polling…`)
  for (;;) {
    const b = await anthropic.messages.batches.retrieve(batch.id)
    if (b.processing_status === 'ended') break
    console.log(`  ${b.request_counts.processing} processing / ${b.request_counts.succeeded} done / ${b.request_counts.errored} errored`)
    await new Promise((r) => setTimeout(r, POLL_MS))
  }

  const byId = new Map(sample.map((s) => [s.id, s]))
  const results = []
  let errored = 0
  for await (const item of await anthropic.messages.batches.results(batch.id)) {
    if (item.result.type !== 'succeeded') { errored++; continue }
    const block = item.result.message.content.find((b) => b.type === 'tool_use')
    if (!block) { errored++; continue }
    results.push({ ...byId.get(item.custom_id), ...block.input, v1_score: v1ById.get(item.custom_id) ?? null })
  }
  results.sort((a, b) => b.curation_score - a.curation_score)
  console.log(`Scored ${results.length}, errored ${errored}`)

  writeFileSync('/tmp/curation-sample-OUT.json', JSON.stringify(results, null, 2))

  // HTML contact sheet, ranked
  const card = (r, i) => `
    <div class="card">
      <img src="${urlMap.get(r.thumbnail_url) ?? urlMap.get(r.display_path) ?? ''}" loading="lazy">
      <div class="meta">
        <div class="score">#${i + 1} · <b>${r.curation_score}</b> <span class="old">${r.v1_score != null ? `(v1: ${r.v1_score}) ` : ''}(old: ${r.quality_score ?? '—'})</span></div>
        <div class="line">${r.year} · ${r.event_name ?? ''} · ${r.photographer ?? ''}</div>
        <div class="line strength">${r.primary_strength}${r.flags?.length ? ' · ⚑ ' + r.flags.join(', ') : ''}</div>
        <div class="line reason">${(r.reason ?? '').replace(/</g, '&lt;')}</div>
      </div>
    </div>`
  const html = `<!doctype html><meta charset="utf-8"><title>Curation rubric sample</title>
  <style>
    body{background:#111;color:#eee;font-family:ui-monospace,monospace;margin:20px}
    h1{font-size:16px} .grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:14px}
    .card{background:#1c1c1c;border:1px solid #333;border-radius:6px;overflow:hidden}
    .card img{width:100%;aspect-ratio:1;object-fit:cover;display:block}
    .meta{padding:8px 10px;font-size:11px;line-height:1.5}
    .score{font-size:13px} .old{color:#888} .strength{color:#8fc97f} .reason{color:#aaa}
  </style>
  <h1>Curation rubric sample — ${results.length} photos, ranked by new curation_score (draft rubric, no DB writes)</h1>
  <div class="grid">${results.map(card).join('')}</div>`
  writeFileSync('/tmp/curation-sample-v2.html', html)

  console.log('\nTop 12 by new curation_score:')
  for (const r of results.slice(0, 12)) {
    console.log(`  ${String(r.curation_score).padStart(3)} (old ${String(r.quality_score ?? '—').padStart(3)}) ${r.year} ${r.primary_strength.padEnd(20)} ${(r.reason ?? '').slice(0, 80)}`)
  }
  console.log('\nBottom 5:')
  for (const r of results.slice(-5)) {
    console.log(`  ${String(r.curation_score).padStart(3)} (old ${String(r.quality_score ?? '—').padStart(3)}) ${r.year} flags=[${(r.flags ?? []).join(',')}] ${(r.reason ?? '').slice(0, 70)}`)
  }
  console.log('\nContact sheet: /tmp/curation-sample-v2.html  ·  data: /tmp/curation-sample-OUT.json')
}

main().catch((err) => { console.error('FATAL:', err); process.exit(1) })
