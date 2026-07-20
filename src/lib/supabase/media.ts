import type { SupabaseClient } from '@supabase/supabase-js'

/** Minimal media_files row used for cover fallbacks and per-event stats. */
export interface MediaRowLite {
  event_id: string | null
  file_size: number | null
  storage_path: string
  display_path: string | null
}

const PAGE_SIZE = 1000

/**
 * Fetch ALL non-deleted media rows, paged past PostgREST's row cap.
 * A single .limit(N) silently truncates once the library outgrows N —
 * events whose photos were uploaded after the cutoff lose their fallback
 * cover and photo counts.
 */
export async function fetchAllMediaRows(supabase: SupabaseClient): Promise<MediaRowLite[]> {
  const { count, error: countError } = await supabase
    .from('media_files')
    .select('id', { count: 'exact', head: true })
    .is('deleted_at', null)

  if (countError || count == null) {
    console.error('[media] fetchAllMediaRows count failed:', countError?.message)
    return []
  }

  const pages = Math.ceil(count / PAGE_SIZE)
  const responses = await Promise.all(
    Array.from({ length: pages }, (_, i) =>
      supabase
        .from('media_files')
        .select('event_id, file_size, storage_path, display_path')
        .is('deleted_at', null)
        .order('created_at', { ascending: true })
        .order('id', { ascending: true })
        .range(i * PAGE_SIZE, (i + 1) * PAGE_SIZE - 1)
    )
  )

  const rows: MediaRowLite[] = []
  for (const { data, error } of responses) {
    if (error) { console.error('[media] fetchAllMediaRows page failed:', error.message); continue }
    rows.push(...((data ?? []) as MediaRowLite[]))
  }
  return rows
}
