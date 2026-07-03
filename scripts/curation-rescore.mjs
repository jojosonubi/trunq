/**
 * curation-rescore.mjs — FULL-ARCHIVE curation scoring (rubric v2, validated
 * on the 104-photo sample 2026-07-03 with user sign-off).
 *
 * Scores every live image (org recess) with curation_score IS NULL via the
 * Message Batches API and writes curation_score / curation_strength /
 * curation_flags / curation_reason (migration 041). NEVER touches
 * quality_score, tags, or any existing column. Idempotent: re-run picks up
 * only rows still missing curation_score.
 *
 * SAFETY: dry run by default. Submits/writes ONLY with --go (billable, ~$200).
 *   node scripts/curation-rescore.mjs        # dry run
 *   node scripts/curation-rescore.mjs --go   # live
 */

import dotenv from "dotenv"
import Anthropic from "@anthropic-ai/sdk"
import { createClient } from "@supabase/supabase-js"

dotenv.config({ path: ".env.local" })

const GO           = process.argv.includes("--go")
const ORG          = "2b557660-6bb3-4d41-9b49-71e860681b9c"   // recess
const MEDIA_BUCKET = "media"
const BATCH_SIZE   = 1500
const SIGN_CHUNK   = 1000
const SIGN_TTL     = 48 * 60 * 60
const DB_CONC      = 20
const POLL_MS      = 20_000
const POLL_MAX     = 360

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!SUPABASE_URL || !SERVICE_KEY) { console.error("Missing Supabase env"); process.exit(1) }
if (GO && !process.env.ANTHROPIC_API_KEY) { console.error("Missing ANTHROPIC_API_KEY"); process.exit(1) }

const supabase  = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } })
const anthropic = process.env.ANTHROPIC_API_KEY ? new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY }) : null
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const ts    = () => new Date().toISOString().slice(11, 19)

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


async function fetchPending() {
  const rows = []
  for (let f = 0; ; f += 1000) {
    const { data, error } = await supabase
      .from("media_files")
      .select("id, storage_path, display_path")
      .is("curation_score", null)
      .eq("file_type", "image")
      .is("deleted_at", null)
      .eq("organisation_id", ORG)
      .order("created_at", { ascending: true })
      .range(f, f + 999)
    if (error) throw new Error("fetch failed: " + error.message)
    rows.push(...(data ?? []))
    if (!data || data.length < 1000) break
  }
  return rows
}

async function signPaths(paths) {
  const map = new Map()
  for (let i = 0; i < paths.length; i += SIGN_CHUNK) {
    const { data, error } = await supabase.storage.from(MEDIA_BUCKET).createSignedUrls(paths.slice(i, i + SIGN_CHUNK), SIGN_TTL)
    if (error) { console.error("  sign chunk failed:", error.message); continue }
    for (const item of (data ?? [])) if (item.signedUrl && item.path) map.set(item.path, item.signedUrl)
  }
  return map
}

async function waitForEnd(batchId) {
  for (let i = 0; i < POLL_MAX; i++) {
    const b = await anthropic.messages.batches.retrieve(batchId)
    if (b.processing_status === "ended") return
    if (i % 3 === 0) console.log(`    [${ts()}] ${b.processing_status} — processing:${b.request_counts.processing} ok:${b.request_counts.succeeded} err:${b.request_counts.errored}`)
    await sleep(POLL_MS)
  }
  throw new Error("batch " + batchId + " did not end in time")
}

async function runConc(items, conc, fn) {
  let idx = 0
  await Promise.all(Array.from({ length: Math.min(conc, items.length) }, async () => {
    while (idx < items.length) { const i = idx++; await fn(items[i]) }
  }))
}

async function ingest(batchId) {
  const updates = []
  let failed = 0
  for await (const item of await anthropic.messages.batches.results(batchId)) {
    if (item.result.type !== "succeeded") { failed++; continue }
    const block = item.result.message.content.find((b) => b.type === "tool_use")
    if (!block) { failed++; continue }
    const r = block.input
    updates.push({
      id: item.custom_id,
      curation_score:    Math.min(100, Math.max(0, Math.round(Number(r.curation_score) || 0))),
      curation_strength: typeof r.primary_strength === "string" ? r.primary_strength : null,
      curation_flags:    Array.isArray(r.flags) ? r.flags : [],
      curation_reason:   typeof r.reason === "string" ? r.reason : null,
    })
  }
  let ok = 0
  await runConc(updates, DB_CONC, async (u) => {
    const { id, ...fields } = u
    const { error } = await supabase.from("media_files").update(fields).eq("id", id)
    if (error) { failed++; console.error("    update failed " + id + ": " + error.message) } else ok++
  })
  return { ok, failed }
}

async function main() {
  const ingestIdx = process.argv.indexOf("--ingest")
  if (ingestIdx !== -1) {
    const batchId = process.argv[ingestIdx + 1]
    if (!batchId?.startsWith("msgbatch_")) { console.error("usage: --ingest <msgbatch_id>"); process.exit(1) }
    console.log("Ingesting orphaned batch " + batchId + " …")
    await waitForEnd(batchId)
    const { ok, failed } = await ingest(batchId)
    console.log("ingested — scored=" + ok + " failed=" + failed)
    return
  }
  console.log(GO ? "*** LIVE RUN (--go): full-archive curation scoring, billable (~$200) ***"
                 : "--- DRY RUN: no submissions, no DB writes. Re-run with --go. ---")
  console.log("Writes ONLY curation_score/strength/flags/reason. quality_score and tags untouched.\n")

  const rows = await fetchPending()
  const noDisplay = rows.filter((r) => !r.display_path).length
  console.log(`Pending (curation_score IS NULL, recess live images): ${rows.length}`)
  console.log(`Missing display derivative (will send original): ${noDisplay}`)
  console.log(`Plan: ${Math.ceil(rows.length / BATCH_SIZE)} sequential batch(es) of up to ${BATCH_SIZE}.`)
  if (rows.length === 0) { console.log("Nothing to do."); return }
  if (!GO) { console.log("\nDry run complete."); return }

  let okTotal = 0, failTotal = 0
  const nBatches = Math.ceil(rows.length / BATCH_SIZE)
  for (let i = 0, idx = 1; i < rows.length; i += BATCH_SIZE, idx++) {
    const chunk = rows.slice(i, i + BATCH_SIZE)
    const urlMap = await signPaths(chunk.map((r) => r.display_path ?? r.storage_path))
    const requests = chunk.map((row) => ({
      custom_id: row.id,
      params: {
        model: "claude-sonnet-4-6",
        max_tokens: 512,
        tools: [SCORE_TOOL],
        tool_choice: { type: "tool", name: "curate_image" },
        messages: [{ role: "user", content: [
          { type: "image", source: { type: "url", url: urlMap.get(row.display_path ?? row.storage_path) ?? "" } },
          { type: "text", text: RUBRIC },
        ] }],
      },
    }))
    const batch = await anthropic.messages.batches.create({ requests })
    console.log(`  batch ${idx}/${nBatches}: [${ts()}] submitted ${batch.id} (${chunk.length} reqs) — waiting…`)
    await waitForEnd(batch.id)
    const { ok, failed } = await ingest(batch.id)
    okTotal += ok; failTotal += failed
    console.log(`  batch ${idx}/${nBatches}: [${ts()}] ingested — scored=${ok} failed=${failed}`)
    if (i + BATCH_SIZE < rows.length) {
      // Supabase storage throttles after heavy egress days: back off 45 min
      // after a majority-failure batch (waiting out the throttle), 10 min
      // otherwise (staying under the URL-fetch rate limit).
      const cooldown = failed > ok ? 2_700_000 : 600_000
      console.log(`    cooling down ${cooldown / 60000} min before next batch`)
      await sleep(cooldown)
    }
  }
  console.log(`\nDONE. scored=${okTotal} failed=${failTotal}. Re-run with --go to retry failures.`)
}

main().catch((err) => { console.error("FATAL:", err); process.exit(1) })
