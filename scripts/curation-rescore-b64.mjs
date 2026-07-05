/**
 * curation-rescore-b64.mjs — base64 mode: bypasses Anthropic URL-fetch entirely
 * (Supabase incident 2026-07-03/04 made URL-fetch batches fail 60-95%).
 *
 * Same rubric v2 + columns as curation-rescore.mjs. Per chunk of 600 pending
 * rows: download derivative locally, resize to 1092px JPEG q78 (sharp), embed
 * base64 in the batch request, poll, ingest. Idempotent; failures stay NULL.
 *
 *   node scripts/curation-rescore-b64.mjs --go
 */

import dotenv from "dotenv"
import sharp from "sharp"
import Anthropic from "@anthropic-ai/sdk"
import { createClient } from "@supabase/supabase-js"

dotenv.config({ path: ".env.local" })

const GO         = process.argv.includes("--go")
const ORG        = "2b557660-6bb3-4d41-9b49-71e860681b9c"
const CHUNK      = 600
const DL_CONC    = 5
const POLL_MS    = 20_000
const POLL_MAX   = 360

const supabase  = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
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



async function withRetry(fn, label, tries = 8) {
  for (let i = 0; ; i++) {
    try { return await fn() }
    catch (err) {
      if (i >= tries - 1) throw err
      console.log("    [" + ts() + "] " + label + " retry " + (i + 1) + ": " + (err instanceof Error ? err.message.slice(0, 70) : err))
      await sleep(Math.min(120_000, 10_000 * 2 ** i))
    }
  }
}

async function fetchPending() {
  const rows = []
  for (let f = 0; ; f += 1000) {
    const { data, error } = await supabase.from("media_files")
      .select("id, storage_path, display_path")
      .is("curation_score", null).eq("file_type", "image").is("deleted_at", null)
      .eq("organisation_id", ORG).order("created_at", { ascending: true })
      .range(f, f + 999)
    if (error) throw new Error("fetch failed: " + error.message)
    rows.push(...(data ?? []))
    if (!data || data.length < 1000) break
  }
  return rows
}

async function downloadB64(row) {
  const path = row.display_path ?? row.storage_path
  const { data, error } = await withRetry(() => supabase.storage.from("media").download(path), "dl", 3)
  if (error || !data) throw new Error(error?.message ?? "empty")
  const buf = Buffer.from(await data.arrayBuffer())
  return (await sharp(buf).rotate().resize({ width: 1092, height: 1092, fit: "inside", withoutEnlargement: true }).jpeg({ quality: 78 }).toBuffer()).toString("base64")
}

async function runConc(items, conc, fn) {
  let idx = 0
  await Promise.all(Array.from({ length: Math.min(conc, items.length) }, async () => {
    while (idx < items.length) { const i = idx++; await fn(items[i]) }
  }))
}

async function waitForEnd(batchId) {
  for (let i = 0; i < POLL_MAX; i++) {
    const b = await withRetry(() => anthropic.messages.batches.retrieve(batchId), "poll")
    if (b.processing_status === "ended") return
    if (i % 6 === 0) console.log("    [" + ts() + "] processing:" + b.request_counts.processing + " ok:" + b.request_counts.succeeded + " err:" + b.request_counts.errored)
    await sleep(POLL_MS)
  }
  throw new Error("batch timeout " + batchId)
}

async function ingest(batchId) {
  const updates = []
  let failed = 0
  for await (const item of await withRetry(() => anthropic.messages.batches.results(batchId), "results")) {
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
  await runConc(updates, 20, async (u) => {
    const { id, ...fields } = u
    const { error } = await supabase.from("media_files").update(fields).eq("id", id)
    if (error) { failed++ } else ok++
  })
  return { ok, failed }
}

async function main() {
  if (!GO) { const rows = await fetchPending(); console.log("DRY: pending=" + rows.length + " → " + Math.ceil(rows.length / CHUNK) + " chunks of " + CHUNK); return }
  const rows = await fetchPending()
  const nChunks = Math.ceil(rows.length / CHUNK)
  console.log("BASE64 MODE: pending=" + rows.length + " → " + nChunks + " chunks of " + CHUNK)

  let okTotal = 0, failTotal = 0
  for (let i = 0, idx = 1; i < rows.length; i += CHUNK, idx++) {
    const chunk = rows.slice(i, i + CHUNK)
    const loaded = []
    let dlFail = 0
    await runConc(chunk, DL_CONC, async (row) => {
      try { loaded.push({ id: row.id, b64: await downloadB64(row) }) }
      catch { dlFail++ }
    })
    console.log("  chunk " + idx + "/" + nChunks + ": [" + ts() + "] downloaded " + loaded.length + "/" + chunk.length + (dlFail ? " (dl failed " + dlFail + ")" : ""))
    if (!loaded.length) continue

    const requests = loaded.map((r) => ({
      custom_id: r.id,
      params: {
        model: "claude-sonnet-4-6", max_tokens: 512,
        tools: [SCORE_TOOL], tool_choice: { type: "tool", name: "curate_image" },
        messages: [{ role: "user", content: [
          { type: "image", source: { type: "base64", media_type: "image/jpeg", data: r.b64 } },
          { type: "text", text: RUBRIC },
        ] }],
      },
    }))
    const batch = await withRetry(() => anthropic.messages.batches.create({ requests }), "submit")
    console.log("  chunk " + idx + "/" + nChunks + ": [" + ts() + "] submitted " + batch.id)
    await waitForEnd(batch.id)
    const { ok, failed } = await ingest(batch.id)
    okTotal += ok; failTotal += failed + dlFail
    console.log("  chunk " + idx + "/" + nChunks + ": [" + ts() + "] ingested — scored=" + ok + " failed=" + (failed + dlFail))
  }
  console.log("\nDONE. scored=" + okTotal + " failed=" + failTotal + ". Re-run for stragglers.")
}

main().catch((err) => { console.error("FATAL:", err); process.exit(1) })
