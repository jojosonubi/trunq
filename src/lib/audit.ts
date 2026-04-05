import type { SupabaseClient } from '@supabase/supabase-js'

export interface AuditEntry {
  userId:      string | null
  action:      string
  entityType?: string | null
  entityId?:   string | null
  metadata?:   Record<string, unknown>
}

/**
 * Writes one entry to audit_log. Never throws — failures are console-only.
 * Always call with a service-role client so the insert bypasses RLS.
 */
export async function writeAudit(
  supabase: SupabaseClient,
  entry: AuditEntry,
): Promise<void> {
  try {
    const { error } = await supabase.from('audit_log').insert({
      user_id:     entry.userId,
      action:      entry.action,
      entity_type: entry.entityType ?? null,
      entity_id:   entry.entityId   ?? null,
      metadata:    entry.metadata   ?? {},
    })
    if (error) console.error('[audit] write failed:', error.message)
  } catch (err) {
    console.error('[audit] unexpected error:', err)
  }
}
