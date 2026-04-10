import { createServiceClient } from '@/lib/supabase/service'
import { getShareSession } from '@/lib/share-session'
import SharePortalClient from './SharePortalClient'

export const dynamic = 'force-dynamic'

interface Props {
  params: Promise<{ id: string }>
}

export default async function SharePage({ params }: Props) {
  const { id } = await params
  const supabase = createServiceClient()

  // Fetch share link metadata
  const { data: link } = await supabase
    .from('share_links')
    .select('id, project_id, folder_id, is_active, expires_at, label, show_watermark')
    .eq('id', id)
    .single()

  if (!link || !link.is_active) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0a0a0a' }}>
        <div style={{ textAlign: 'center', color: '#888' }}>
          <p style={{ fontSize: 15, marginBottom: 8, color: '#ccc' }}>This link is no longer active.</p>
          <p style={{ fontSize: 13 }}>It may have been revoked or never existed.</p>
        </div>
      </div>
    )
  }

  if (link.expires_at && new Date(link.expires_at) < new Date()) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0a0a0a' }}>
        <div style={{ textAlign: 'center', color: '#888' }}>
          <p style={{ fontSize: 15, marginBottom: 8, color: '#ccc' }}>This link has expired.</p>
          <p style={{ fontSize: 13 }}>Contact the person who shared it for a new link.</p>
        </div>
      </div>
    )
  }

  // Fetch project name for display
  const { data: project } = await supabase
    .from('projects')
    .select('name')
    .eq('id', link.project_id)
    .single()

  // Check if already authenticated
  const session = await getShareSession(id)

  return (
    <SharePortalClient
      shareLinkId={id}
      projectName={project?.name ?? 'Gallery'}
      label={link.label}
      showWatermark={link.show_watermark}
      initialSession={session}
    />
  )
}
