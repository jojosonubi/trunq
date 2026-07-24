/**
 * GET /api/tag/batch-status
 *
 * Polls all pending tag_batches records, ingests results from completed
 * Anthropic batches, writes tags to DB, and updates tagging_status.
 *
 * Called every 5 minutes by Vercel Cron (Authorization: Bearer <CRON_SECRET>)
 * or on demand by an owner-authenticated user.
 *
 * Never touches score_status or quality_score — scoring is a separate concern.
 */

import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { requireApiUserWithOrg } from '@/lib/api-auth'
import { createServiceClient } from '@/lib/supabase/service'

type SupabaseClient = ReturnType<typeof createServiceClient>

function isCronAuth(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET
  // Fail closed: no configured secret means no access (matches foto-lab/index).
  if (!secret) return false
  return req.headers.get('authorization') === `Bearer ${secret}`
}

interface TagResult {
  scene_tags:       string[]
  mood_tags:        string[]
  subject_tags:     string[]
  gesture_tags:     string[]
  fashion_tags: {
    hair:           string[]
    garment:        string[]
    cultural_dress: string[]
    accessory:      string[]
  }
}

async function processCompletedBatch(
  supabase: SupabaseClient,
  anthropic: Anthropic,
  batch: { id: string; anthropic_batch_id: string; organisation_id: string },
): Promise<{ succeeded: number; failed: number }> {
  const orgId = batch.organisation_id

  const tagRows: Record<string, unknown>[] = []
  const successIds: string[] = []
  const failedIds:  string[] = []

  // Stream results from Anthropic — one JSON object per line
  for await (const item of await anthropic.messages.batches.results(batch.anthropic_batch_id)) {
    const mediaFileId = item.custom_id

    if (item.result.type !== 'succeeded') {
      // errored | expired | canceled → mark failed
      console.warn(`[tag/batch-status] ${mediaFileId} result=${item.result.type}`)
      failedIds.push(mediaFileId)
      continue
    }

    const toolBlock = item.result.message.content.find(b => b.type === 'tool_use')
    if (!toolBlock || toolBlock.type !== 'tool_use') {
      console.warn(`[tag/batch-status] ${mediaFileId} no tool_use block in response`)
      failedIds.push(mediaFileId)
      continue
    }

    const r = toolBlock.input as TagResult
    const tag = (tag_type: string, value: string, confidence: number) => ({
      media_file_id:   mediaFileId,
      organisation_id: orgId,
      tag_type,
      value:           value.toLowerCase(),
      confidence,
    })

    tagRows.push(
      ...(r.scene_tags ?? []).slice(0, 4).map(v => tag('scene', v, 0.9)),
      ...(r.mood_tags ?? []).slice(0, 2).map(v => tag('mood', v, 0.85)),
      ...(r.subject_tags ?? []).slice(0, 4).map(v => tag('subject', v, 0.9)),
      ...(r.gesture_tags ?? []).slice(0, 2).map(v => tag('gesture', v, 0.85)),
      ...(r.fashion_tags?.hair ?? []).slice(0, 2).map(v => tag('hair', v, 0.85)),
      ...(r.fashion_tags?.garment ?? []).slice(0, 3).map(v => tag('garment', v, 0.85)),
      ...(r.fashion_tags?.cultural_dress ?? []).slice(0, 2).map(v => tag('cultural_dress', v, 0.85)),
      ...(r.fashion_tags?.accessory ?? []).slice(0, 3).map(v => tag('accessory', v, 0.85)),
    )
    successIds.push(mediaFileId)
  }

  // ── Delete stale tags then bulk-insert new ones ───────────────────────────
  if (successIds.length > 0) {
    for (let i = 0; i < successIds.length; i += 500) {
      await supabase.from('tags').delete().in('media_file_id', successIds.slice(i, i + 500))
    }
    for (let i = 0; i < tagRows.length; i += 500) {
      const { error } = await supabase.from('tags').insert(tagRows.slice(i, i + 500))
      if (error) console.error('[tag/batch-status] tags insert error:', error.message)
    }
  }

  // ── Update tagging_status on media_files (never score_status) ────────────
  for (let i = 0; i < successIds.length; i += 500) {
    await supabase
      .from('media_files')
      .update({ tagging_status: 'complete' })
      .in('id', successIds.slice(i, i + 500))
  }
  for (let i = 0; i < failedIds.length; i += 500) {
    await supabase
      .from('media_files')
      .update({ tagging_status: 'failed' })
      .in('id', failedIds.slice(i, i + 500))
  }

  // ── Mark batch complete ───────────────────────────────────────────────────
  await supabase
    .from('tag_batches')
    .update({
      status:          'complete',
      succeeded_count: successIds.length,
      failed_count:    failedIds.length,
      completed_at:    new Date().toISOString(),
    })
    .eq('id', batch.id)

  console.log(
    `[tag/batch-status] batch ${batch.anthropic_batch_id} ingested — ` +
    `succeeded=${successIds.length} failed=${failedIds.length} tags_written=${tagRows.length}`
  )

  return { succeeded: successIds.length, failed: failedIds.length }
}

async function handle(): Promise<NextResponse> {
  const supabase   = createServiceClient()
  const anthropic  = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })

  // ── Find all submitted batches (global — cron polls for all orgs) ────────
  const { data: batches, error: batchErr } = await supabase
    .from('tag_batches')
    .select('id, anthropic_batch_id, organisation_id, total_count')
    .eq('status', 'submitted')

  if (batchErr) {
    console.error('[tag/batch-status] fetch error:', batchErr.message)
    return NextResponse.json({ error: 'Failed to fetch batches' }, { status: 500 })
  }

  if (!batches || batches.length === 0) {
    return NextResponse.json({ checked: 0, completed: 0 })
  }

  let completed      = 0
  let totalSucceeded = 0
  let totalFailed    = 0

  for (const batch of batches) {
    try {
      const remote = await anthropic.messages.batches.retrieve(batch.anthropic_batch_id)

      if (remote.processing_status !== 'ended') {
        console.log(`[tag/batch-status] ${batch.anthropic_batch_id} still ${remote.processing_status}`)
        continue
      }

      const { succeeded, failed } = await processCompletedBatch(supabase, anthropic, batch)
      completed++
      totalSucceeded += succeeded
      totalFailed    += failed
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error(`[tag/batch-status] error on batch ${batch.anthropic_batch_id}:`, msg)
    }
  }

  return NextResponse.json({
    checked:   batches.length,
    completed,
    succeeded: totalSucceeded,
    failed:    totalFailed,
  })
}

export async function GET(req: NextRequest) {
  // Accept cron header OR owner session
  if (isCronAuth(req)) return handle()

  const auth = await requireApiUserWithOrg()
  if (auth.response) return auth.response
  if (auth.organisationRole !== 'owner') {
    return NextResponse.json({ error: 'Owner role required' }, { status: 403 })
  }
  return handle()
}
