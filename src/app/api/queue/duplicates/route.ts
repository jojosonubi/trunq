import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireApiUser } from '@/lib/api-auth'

// ─── Types ────────────────────────────────────────────────────────────────────

interface PendingPhoto {
  id:            string
  event_id:      string
  filename:      string
  quality_score: number | null
  created_at:    string
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Extract numeric suffix from a filename (without extension). */
function extractSeq(filename: string): { prefix: string; num: number } | null {
  const base = filename.replace(/\.[^.]+$/, '')
  const m    = base.match(/^(.*?)(\d+)$/)
  if (!m) return null
  return { prefix: m[1], num: parseInt(m[2], 10) }
}

/**
 * Merge overlapping ID groups (union by shared membership).
 * Returns only groups with 2+ members.
 */
function mergeGroups(groups: string[][]): string[][] {
  const result: string[][] = []
  for (const group of groups) {
    let targetIdx = -1
    for (let i = 0; i < result.length; i++) {
      if (group.some((id) => result[i].includes(id))) {
        targetIdx = i
        break
      }
    }
    if (targetIdx >= 0) {
      for (const id of group) {
        if (!result[targetIdx].includes(id)) result[targetIdx].push(id)
      }
    } else {
      result.push([...group])
    }
  }
  return result.filter((g) => g.length >= 2)
}

// ─── Route ────────────────────────────────────────────────────────────────────

export async function POST() {
  const auth = await requireApiUser()
  if (auth.response) return auth.response

  const supabase = createClient()

  const { data, error } = await supabase
    .from('media_files')
    .select('id, event_id, filename, quality_score, created_at')
    .or('review_status.eq.pending,review_status.eq.held')
    .is('deleted_at', null)
    .order('event_id',   { ascending: true })
    .order('created_at', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const photos    = (data ?? []) as PendingPhoto[]
  const scoreMap  = new Map<string, number | null>(photos.map((p) => [p.id, p.quality_score]))

  // Group photos by event_id for localised analysis
  const byEvent = new Map<string, PendingPhoto[]>()
  for (const p of photos) {
    const arr = byEvent.get(p.event_id) ?? []
    arr.push(p)
    byEvent.set(p.event_id, arr)
  }

  const candidates: string[][] = []

  for (const [, eventPhotos] of byEvent) {

    // ── 1. Timestamp proximity (within 30 s, same event) ──────────────────
    const byTime = [...eventPhotos].sort(
      (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
    )
    let tGroup: PendingPhoto[] = [byTime[0]]
    for (let i = 1; i < byTime.length; i++) {
      const delta =
        new Date(byTime[i].created_at).getTime() -
        new Date(byTime[i - 1].created_at).getTime()
      if (delta <= 30_000) {
        tGroup.push(byTime[i])
      } else {
        if (tGroup.length >= 2) candidates.push(tGroup.map((p) => p.id))
        tGroup = [byTime[i]]
      }
    }
    if (tGroup.length >= 2) candidates.push(tGroup.map((p) => p.id))

    // ── 2. Filename consecutive sequences (3+ in a row, same event) ───────
    const seqMap = new Map<string, { num: number; id: string }[]>()
    for (const p of eventPhotos) {
      const seq = extractSeq(p.filename)
      if (!seq) continue
      const arr = seqMap.get(seq.prefix) ?? []
      arr.push({ num: seq.num, id: p.id })
      seqMap.set(seq.prefix, arr)
    }
    for (const [, entries] of seqMap) {
      const sorted = [...entries].sort((a, b) => a.num - b.num)
      let run: string[] = [sorted[0].id]
      for (let i = 1; i < sorted.length; i++) {
        if (sorted[i].num - sorted[i - 1].num <= 1) {
          run.push(sorted[i].id)
        } else {
          if (run.length >= 3) candidates.push([...run])
          run = [sorted[i].id]
        }
      }
      if (run.length >= 3) candidates.push([...run])
    }
  }

  // Merge overlapping groups
  const merged = mergeGroups(candidates)

  // Pick recommended_keep = highest quality_score (or first if all null)
  const groups = merged.map((ids) => {
    let bestId    = ids[0]
    let bestScore = scoreMap.get(ids[0]) ?? -1
    for (const id of ids.slice(1)) {
      const s = scoreMap.get(id) ?? -1
      if (s > bestScore) { bestScore = s; bestId = id }
    }
    return { ids, recommended_keep: bestId }
  })

  return NextResponse.json({ groups })
}
