import { notFound } from 'next/navigation'
import { requireAuth } from '@/lib/auth'
import { createServiceClient } from '@/lib/supabase/service'
import { signStoragePathsSized } from '@/lib/supabase/storage'
import Navbar from '@/components/layout/Navbar'
import Sidebar from '@/components/layout/Sidebar'
import CollectionDetailClient, { type CollectionPhoto } from './CollectionDetailClient'

export const revalidate = 0

export default async function CollectionPage({ params }: { params: { id: string } }) {
  const profile = await requireAuth()
  const supabase = createServiceClient()

  const { data: collection } = await supabase
    .from('collections')
    .select('id, name, created_at')
    .eq('id', params.id)
    .maybeSingle()

  if (!collection) notFound()

  const { data: items } = await supabase
    .from('collection_items')
    .select('media_file_id, added_at, media_files(id, event_id, storage_path, display_path, description, events(name, date))')
    .eq('collection_id', params.id)
    .order('added_at', { ascending: true })

  interface ItemRow {
    media_file_id: string
    media_files: {
      id: string
      event_id: string
      storage_path: string
      display_path: string | null
      description: string | null
      events: { name: string; date: string } | null
    } | null
  }

  const rows = ((items ?? []) as unknown as ItemRow[]).filter((r) => r.media_files)

  const urlMap = await signStoragePathsSized(
    rows.map((r) => ({ storage_path: r.media_files!.storage_path, display_path: r.media_files!.display_path })),
    'card',
    { aspect: 'preserve' },
  )

  const photos: CollectionPhoto[] = rows.map((r) => ({
    id:          r.media_files!.id,
    event_id:    r.media_files!.event_id,
    event_name:  r.media_files!.events?.name ?? '',
    event_date:  r.media_files!.events?.date ?? '',
    description: r.media_files!.description,
    url:         urlMap.get(r.media_files!.storage_path) ?? null,
  }))

  return (
    <div className="min-h-screen bg-surface-0">
      <Navbar profile={profile} />
      <main className="flex">
        <Sidebar />
        <CollectionDetailClient
          collectionId={collection.id}
          name={collection.name}
          initialPhotos={photos}
        />
      </main>
    </div>
  )
}
