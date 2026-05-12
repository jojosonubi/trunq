import type { SupabaseClient } from '@supabase/supabase-js'
import { getUserOrgId } from '@/lib/supabase/org'

export interface AuditEntry {
  userId:          string | null
  action:          string
  entityType?:     string | null
  entityId?:       string | null
  metadata?:       Record<string, unknown>
  organisationId?: string | null
}

/**
 * Writes one entry to audit_log. Never throws — failures are console-only.
 * Always call with a service-role client so the insert bypasses RLS.
 *
 * organisation_id is required by the DB (NOT NULL). Callers should pass it
 * via entry.organisationId when available. If not provided, we fall back to
 * looking up the user's org. If neither is available we skip the insert and
 * log a warning rather than crashing the calling flow.
 */
export async function writeAudit(
  supabase: SupabaseClient,
  entry: AuditEntry,
): Promise<void> {
  try {
    let orgId = entry.organisationId ?? null
    if (!orgId && entry.userId) {
      orgId = await getUserOrgId(supabase, entry.userId)
    }
    if (!orgId) {
      console.error('[audit] skipping insert — could not resolve organisation_id for action:', entry.action)
      return
    }
    const { error } = await supabase.from('audit_log').insert({
      organisation_id: orgId,
      user_id:         entry.userId,
      action:          entry.action,
      entity_type:     entry.entityType ?? null,
      entity_id:       entry.entityId   ?? null,
      metadata:        entry.metadata   ?? {},
    })
    if (error) console.error('[audit] write failed:', error.message)
  } catch (err) {
    console.error('[audit] unexpected error:', err)
  }
}
