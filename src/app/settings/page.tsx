import { requireAuth } from '@/lib/auth'
import { createServiceClient } from '@/lib/supabase/service'
import SettingsClient from './SettingsClient'
import type { AuditLog, Event, MediaFile } from '@/types'
import type { BackupStats } from '@/app/api/backup/route'

export const revalidate = 0

export default async function SettingsPage() {
  const profile = await requireAuth()
  const service = createServiceClient()

  // All users: just render account section
  if (profile.role !== 'admin') {
    return <SettingsClient currentProfile={profile} />
  }

  // Admin: fetch everything in parallel
  const [
    usersRes,
    invitesRes,
    totalRes,
    backedUpRes,
    missingRes,
    photographersRes,
    filesRes,
    trashedEventsRes,
    trashedPhotosRes,
    auditLogsRes,
  ] = await Promise.all([
    service.from('profiles').select('*').order('created_at', { ascending: true }),
    service.from('invites').select('*').order('created_at', { ascending: false }).limit(50),
    service.from('media_files').select('id', { count: 'exact', head: true }).is('deleted_at', null),
    service.from('media_files').select('id', { count: 'exact', head: true }).is('deleted_at', null).not('backup_storage_path', 'is', null),
    service.from('media_files').select('id, filename, storage_path, event_id, created_at').is('deleted_at', null).is('backup_storage_path', null).order('created_at', { ascending: false }).limit(100),
    service.from('photographers').select('id, name, created_at').order('name'),
    service.from('media_files').select('photographer, event_id').not('photographer', 'is', null).is('deleted_at', null),
    service.from('events').select('*').not('deleted_at', 'is', null).order('deleted_at', { ascending: false }),
    service.from('media_files').select('*').not('deleted_at', 'is', null).order('deleted_at', { ascending: false }),
    service
      .from('audit_log')
      .select('id, user_id, action, entity_type, entity_id, metadata, created_at, profiles(full_name, email)')
      .order('created_at', { ascending: false })
      .limit(500),
  ])

  // Build per-photographer stats
  const pStats: Record<string, { photos: number; events: Set<string> }> = {}
  for (const f of filesRes.data ?? []) {
    if (!f.photographer) continue
    const key = f.photographer.toLowerCase()
    if (!pStats[key]) pStats[key] = { photos: 0, events: new Set() }
    pStats[key].photos++
    pStats[key].events.add(f.event_id)
  }
  const photographers = (photographersRes.data ?? []).map((p: { id: string; name: string; created_at: string }) => ({
    ...p,
    photoCount: pStats[p.name.toLowerCase()]?.photos ?? 0,
    eventCount: pStats[p.name.toLowerCase()]?.events.size ?? 0,
  }))

  const backupStats: BackupStats = {
    total:         totalRes.count    ?? 0,
    backed_up:     backedUpRes.count ?? 0,
    missing:       (totalRes.count ?? 0) - (backedUpRes.count ?? 0),
    missing_files: (missingRes.data  ?? []) as BackupStats['missing_files'],
  }

  return (
    <SettingsClient
      currentProfile={profile}
      users={usersRes.data ?? []}
      invites={invitesRes.data ?? []}
      backupStats={backupStats}
      photographers={photographers}
      trashedEvents={(trashedEventsRes.data ?? []) as Event[]}
      trashedPhotos={(trashedPhotosRes.data ?? []) as MediaFile[]}
      auditLogs={(auditLogsRes.data ?? []) as unknown as AuditLog[]}
    />
  )
}
