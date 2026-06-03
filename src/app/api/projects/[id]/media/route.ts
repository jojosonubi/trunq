/**
 * GET /api/events/[id]/media
 *
 * Paginated, filtered media fetch for the project gallery.
 * Signs URLs server-side. Cursor-based pagination on (created_at DESC, id DESC).
 *
 * Query params:
 *   cursor        — base64-encoded { t: number (ms), id: string }
 *   q             — text search (description + tag values)
 *   photographer  — exact name match
 *   starred       — 'true' to show starred only
 *   file_type     — 'image' | 'video' | 'graphic'
 *   colour        — dominant colour name
 *   performer_id  — UUID
 *   brand_id      — UUID
 *   folder_id     — UUID | '__unfiled__'
 *   pills         — comma-separated tag values (OR match)
 */

import { NextRequest, NextResponse } from 'next/server'
import { requireApiUserWithOrg } from '@/lib/api-auth'
import { createServiceClient } from '@/lib/supabase/service'
import { signMediaFiles } from '@/lib/supabase/storage'
import type { MediaFileWithTags } from '@/types'

const PAGE_SIZE = 60

const MEDIA_SELECT = '*, tags(*), performer_tags(*, performers(*)), brand_tags(*, brands(*))'

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await requireApiUserWithOrg()
  if (auth.response) return auth.response

  const service = createServiceClient()

  // Verify event belongs to caller's org
  const { data: event, error: evErr } = await service
    .from('events')
    .select('organisation_id')
    .eq('id', params.id)
    .is('deleted_at', null)
    .single()

  if (evErr || !event) return NextResponse.json({ error: 'Event not found' }, { status: 404 })
  if (event.organisation_id !== auth.organisationId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const p            = req.nextUrl.searchParams
  const cursor       = p.get('cursor')        ?? null
  const q            = p.get('q')?.trim()     ?? ''
  const photographer = p.get('photographer')  ?? null
  const starred      = p.get('starred')       === 'true'
  const fileType     = p.get('file_type')     ?? null
  const colour       = p.get('colour')        ?? null
  const performerId  = p.get('performer_id')  ?? null
  const brandId      = p.get('brand_id')      ?? null
  const folderId     = p.get('folder_id')     ?? null
  const pills        = p.get('pills')?.split(',').filter(Boolean) ?? []

  // ── Two-step tag search ────────────────────────────────────────────────────
  // PostgREST can't filter media_files by "has any tag matching X" in one step.
  // Fetch matching tag → media_file_id pairs first, then OR with description match.
  let tagFileIds: string[] | null = null
  if (q.length >= 1) {
    const qClean = q.replace(/[*%,()\[\]]/g, '')
    const { data: tagRows } = await service
      .from('tags')
      .select('media_file_id')
      .ilike('value', `%${qClean}%`)
      .limit(2000)
    tagFileIds = [...new Set((tagRows ?? []).map((r: { media_file_id: string }) => r.media_file_id))]
  }

  // ── Pill filter (OR: file has any of the active pills) ─────────────────────
  let pillFileIds: string[] | null = null
  if (pills.length > 0) {
    const { data: pillRows } = await service
      .from('tags')
      .select('media_file_id')
      .in('value', pills)
      .limit(5000)
    pillFileIds = [...new Set((pillRows ?? []).map((r: { media_file_id: string }) => r.media_file_id))]
    if (pillFileIds.length === 0) return NextResponse.json({ files: [], nextCursor: null })
  }

  // ── Performer subquery ────────────────────────────────────────────────────
  let performerFileIds: string[] | null = null
  if (performerId) {
    const { data: ptRows } = await service
      .from('performer_tags')
      .select('media_file_id')
      .eq('performer_id', performerId)
      .limit(5000)
    performerFileIds = (ptRows ?? []).map((r: { media_file_id: string }) => r.media_file_id)
    if (performerFileIds.length === 0) return NextResponse.json({ files: [], nextCursor: null })
  }

  // ── Brand subquery ────────────────────────────────────────────────────────
  let brandFileIds: string[] | null = null
  if (brandId) {
    const { data: btRows } = await service
      .from('brand_tags')
      .select('media_file_id')
      .eq('brand_id', brandId)
      .limit(5000)
    brandFileIds = (btRows ?? []).map((r: { media_file_id: string }) => r.media_file_id)
    if (brandFileIds.length === 0) return NextResponse.json({ files: [], nextCursor: null })
  }

  // ── Build main query ──────────────────────────────────────────────────────
  let query = service
    .from('media_files')
    .select(MEDIA_SELECT)
    .eq('event_id', params.id)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(PAGE_SIZE + 1) // +1 to detect hasMore

  // Cursor: (created_at, id) < (cursor_ca, cursor_id)
  if (cursor) {
    try {
      const { t, id: cid } = JSON.parse(Buffer.from(cursor, 'base64url').toString())
      const ca = new Date(t).toISOString()
      // PostgREST wildcard in or() uses * not %
      query = query.or(`created_at.lt.${ca},and(created_at.eq.${ca},id.lt.${cid})`)
    } catch { /* invalid cursor — start from beginning */ }
  }

  // Simple column filters
  if (photographer)            query = query.eq('photographer', photographer)
  if (starred)                 query = query.eq('starred', true)
  if (fileType)                query = query.eq('file_type', fileType)
  if (colour)                  query = query.contains('dominant_colours', [colour])
  if (folderId === '__unfiled__') query = query.is('folder_id', null)
  else if (folderId)           query = query.eq('folder_id', folderId)

  // ID-set filters from subqueries (cap at 1000 to keep URL length reasonable)
  if (performerFileIds) query = query.in('id', performerFileIds.slice(0, 1000))
  if (brandFileIds)     query = query.in('id', brandFileIds.slice(0, 1000))
  if (pillFileIds)      query = query.in('id', pillFileIds.slice(0, 1000))

  // Text search: match description OR any of the tag-matched file IDs
  // PostgREST uses * as wildcard inside or() filter strings
  if (q.length >= 1) {
    const qClean = q.replace(/[*%,()\[\]]/g, '')
    if (tagFileIds && tagFileIds.length > 0) {
      query = query.or(`description.ilike.*${qClean}*,id.in.(${tagFileIds.slice(0, 500).join(',')})`)
    } else if (tagFileIds !== null) {
      // q was set but no tag matches — fall back to description only
      query = query.ilike('description', `%${qClean}%`)
    }
  }

  const { data: rows, error } = await query
  if (error) {
    console.error('[events/media] query error:', error.message)
    return NextResponse.json({ error: 'Query failed' }, { status: 500 })
  }

  const allRows  = rows ?? []
  const hasMore  = allRows.length > PAGE_SIZE
  const pageRows = hasMore ? allRows.slice(0, PAGE_SIZE) : allRows

  const signed = await signMediaFiles(pageRows as MediaFileWithTags[])

  // Encode cursor from last row
  let nextCursor: string | null = null
  if (hasMore && pageRows.length > 0) {
    const last = pageRows[pageRows.length - 1] as { created_at: string; id: string }
    nextCursor = Buffer.from(
      JSON.stringify({ t: new Date(last.created_at).getTime(), id: last.id })
    ).toString('base64url')
  }

  return NextResponse.json({ files: signed, nextCursor })
}
