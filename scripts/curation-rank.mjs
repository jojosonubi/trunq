/**
 * curation-rank.mjs — STEP 2: per-summer comparative top-20 (curation_rank).
 *
 * For each summer (public summer events, 2016–2026): take the top candidates
 * by curation_score (step 1, rubric v2), then run a two-round comparative
 * judgement over the IMAGES — cull groups of 10 → final ranked 20 with
 * diversity rules (max 3 per photographer, no near-duplicate compositions).
 * Writes curation_rank (1..20 within the summer); everything else NULL.
 * Idempotent: clears + rewrites ranks per summer on each run.
 *
 * Uses direct API calls (not batches): ~80 small multi-image calls, ~$5-10.
 *
 * SAFETY: dry run by default. Calls API + writes ranks ONLY with --go.
 *   node scripts/curation-rank.mjs           # dry run — candidate pools only
 *   node scripts/curation-rank.mjs --go      # live
 *   node scripts/curation-rank.mjs --go --year 2022   # single summer
 */

import dotenv from 'dotenv'
import sharp from 'sharp'
import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@supabase/supabase-js'

dotenv.config({ path: '.env.local' })

const GO       = process.argv.includes('--go')
const yearArg  = process.argv.includes('--year') ? Number(process.argv[process.argv.indexOf('--year') + 1]) : null
const ORG      = '2b557660-6bb3-4d41-9b49-71e860681b9c'   // recess
const POOL     = 70      // candidates per summer (by curation_score desc)
const GROUP    = 10      // round-1 group size
const KEEP     = 5       // survivors per round-1 group
const FINAL_N  = 20
const SIGN_TTL = 6 * 60 * 60

const supabase  = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

const CRITERIA = `You are the photo editor for RECESS (Black-led nightlife/festival brand) picking the definitive summer selection for Instagram. Judge like a culture-magazine editor. What counts: anchored composition (subject OR structural anchor like a centred stage), MOTION (bodies mid-dance, joint movement, frames you can hear — chaos with a magnetic moment beats a lifeless portrait), intentional moments/story, styling (including styling that reads from behind, e.g. braids), expression, scale/place (venue as subject), rich skin rendering. Rotation/tilt is NOT a flaw. Out-of-focus illegibility IS.
DIVERSITY RULES for the selection: a great spread MIXES portraits with motion and place — never all portraits. No near-duplicate compositions (two similar frames → keep only the stronger). Maximum 3 photos per photographer.`

const PICK_TOOL = (n) => ({
  name: 'select_photos',
  description: `Select and rank the strongest ${n} photos.`,
  input_schema: {
    type: 'object',
    properties: {
      selections: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            index: { type: 'integer', description: 'IMAGE number as labelled' },
            note:  { type: 'string', description: 'very short: why it makes the cut' },
          },
          required: ['index', 'note'],
        },
        description: `Exactly ${n} entries (fewer only if fewer candidates), ordered strongest first.`,
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
      console.log(`    retry ${i + 1} after: ${err instanceof Error ? err.message.slice(0, 80) : err}`)
      await new Promise((r) => setTimeout(r, 5000 * (i + 1)))
    }
  }
}

// One judging call: candidates (with signed urls + meta) → ranked indices.
async function judge(candidates, keep, roundLabel) {
  const content = []
  candidates.forEach((c, i) => {
    content.push({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: c.b64 } })
    content.push({ type: 'text', text: `IMAGE ${i} — photographer: ${c.photographer ?? 'unknown'} · event: ${c.event_name ?? ''} · solo score: ${c.curation_score}` })
  })
  content.push({ type: 'text', text: `${CRITERIA}\n\nAbove are ${candidates.length} candidate photos (${roundLabel}). Select and rank the strongest ${keep}, strongest first, applying the diversity rules.` })
  const res = await callWithRetry({
    model: 'claude-sonnet-4-6',
    max_tokens: 2000,
    tools: [PICK_TOOL(keep)],
    tool_choice: { type: 'tool', name: 'select_photos' },
    messages: [{ role: 'user', content }],
  })
  const block = res.content.find((b) => b.type === 'tool_use')
  const picks = (block?.input?.selections ?? [])
    .map((s) => ({ ...candidates[s.index], note: s.note }))
    .filter(Boolean)
  // de-dupe indices the model might repeat, preserve order
  const seen = new Set()
  return picks.filter((p) => p && !seen.has(p.id) && seen.add(p.id)).slice(0, keep)
}

async function main() {
  console.log(GO ? '*** LIVE RUN (--go): comparative ranking, writes curation_rank ***'
                 : '--- DRY RUN: candidate pools only, no API calls, no writes. ---')

  const { data: evs } = await supabase
    .from('events').select('id, name, date')
    .eq('organisation_id', ORG).eq('is_public', true).is('deleted_at', null).not('date', 'is', null)
  const eventsByYear = new Map()
  for (const e of evs ?? []) {
    const m = /^(\d{4})-(\d{2})/.exec(e.date)
    if (!m) continue
    const y = +m[1]
    if (y < 2016 || y > 2026 || !['05','06','07','08','09'].includes(m[2])) continue
    if (yearArg && y !== yearArg) continue
    if (!eventsByYear.has(y)) eventsByYear.set(y, [])
    eventsByYear.get(y).push(e)
  }

  for (const year of [...eventsByYear.keys()].sort()) {
    const ids = eventsByYear.get(year).map((e) => e.id)
    const evName = new Map(eventsByYear.get(year).map((e) => [e.id, e.name]))

    const { data: pool, error } = await supabase
      .from('media_files')
      .select('id, display_path, event_id, photographer, curation_score')
      .in('event_id', ids)
      .eq('file_type', 'image').eq('review_status', 'approved').is('deleted_at', null)
      .not('curation_score', 'is', null)
      .order('curation_score', { ascending: false })
      .order('id', { ascending: false })
      .limit(POOL)
    if (error) throw new Error(`pool fetch ${year}: ${error.message}`)
    const candidates = (pool ?? []).map((p) => ({ ...p, event_name: evName.get(p.event_id) }))
    console.log(`\nSUMMER ${year}: pool=${candidates.length} (scores ${candidates[0]?.curation_score ?? '—'}…${candidates[candidates.length - 1]?.curation_score ?? '—'})`)
    if (candidates.length === 0) continue
    if (!GO) continue

    // download + resize locally, embed base64 (bypasses URL-fetch entirely)
    const withUrls = []
    let dlIdx = 0
    await Promise.all(Array.from({ length: 5 }, async () => {
      while (dlIdx < candidates.length) {
        const c = candidates[dlIdx++]
        try {
          const { data, error } = await supabase.storage.from('media').download(c.display_path)
          if (error || !data) throw new Error(error?.message ?? 'empty')
          const b64 = (await sharp(Buffer.from(await data.arrayBuffer())).rotate()
            .resize({ width: 1092, height: 1092, fit: 'inside', withoutEnlargement: true })
            .jpeg({ quality: 78 }).toBuffer()).toString('base64')
          withUrls.push({ ...c, b64 })
        } catch (e) { console.log(`  dl skip ${c.id.slice(0, 8)}: ${e.message.slice(0, 50)}`) }
      }
    }))

    let finalists
    if (withUrls.length <= FINAL_N) {
      finalists = withUrls   // tiny summer: rank all
    } else {
      // Round 1: interleave photographers across groups, cull to survivors
      const groups = []
      withUrls.forEach((c, i) => { const g = i % Math.ceil(withUrls.length / GROUP); (groups[g] ??= []).push(c) })
      const survivors = []
      for (const [gi, g] of groups.entries()) {
        const picks = await judge(g, Math.min(KEEP, g.length), `cull round, group ${gi + 1}/${groups.length}`)
        survivors.push(...picks)
        console.log(`  group ${gi + 1}/${groups.length}: kept ${picks.length}/${g.length}`)
      }
      // Round 2: final ranked selection
      finalists = await judge(survivors, Math.min(FINAL_N, survivors.length), 'FINAL round — this ordering becomes the published top 20')
    }
    console.log(`  final: ${finalists.length} ranked`)

    // write ranks: clear summer first, then set 1..N
    const { error: clearErr } = await supabase.from('media_files')
      .update({ curation_rank: null }).in('event_id', ids).not('curation_rank', 'is', null)
    if (clearErr) throw new Error(`clear ranks ${year}: ${clearErr.message}`)
    for (const [i, f] of finalists.entries()) {
      const { error: upErr } = await supabase.from('media_files').update({ curation_rank: i + 1 }).eq('id', f.id)
      if (upErr) throw new Error(`write rank ${year}#${i + 1}: ${upErr.message}`)
    }
    console.log(`  SUMMER ${year} ranks written: 1..${finalists.length}`)
  }
  console.log('\nDONE.')
}

main().catch((err) => { console.error('FATAL:', err); process.exit(1) })
