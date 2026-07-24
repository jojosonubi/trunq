import Link from 'next/link'
import { requireAuth } from '@/lib/auth'
import { createServiceClient } from '@/lib/supabase/service'
import { signStoragePathsSized } from '@/lib/supabase/storage'
import Navbar from '@/components/layout/Navbar'
import Sidebar from '@/components/layout/Sidebar'
import { FolderHeart } from 'lucide-react'
import CollectionCard from './CollectionCard'
import { formatDate as fmtDate } from '@/lib/format'

export const revalidate = 0
export default async function CollectionsPage() {
  const profile = await requireAuth()
  const supabase = createServiceClient()

  const { data: membership } = await supabase
    .from('organisation_members')
    .select('organisation_id')
    .eq('user_id', profile.id)
    .limit(1)
    .maybeSingle()

  const orgId = membership?.organisation_id as string | undefined

  const { data: collections } = orgId
    ? await supabase
        .from('collections')
        .select('id, name, created_at')
        .eq('organisation_id', orgId)
        .order('created_at', { ascending: false })
    : { data: [] }

  const ids = (collections ?? []).map((c) => c.id)

  // Item counts + a cover (earliest-added photo) per collection
  const countMap: Record<string, number> = {}
  const coverRefMap: Record<string, { storage_path: string; display_path: string | null }> = {}
  if (ids.length > 0) {
    const { data: items } = await supabase
      .from('collection_items')
      .select('collection_id, added_at, media_files(storage_path, display_path)')
      .in('collection_id', ids)
      .order('added_at', { ascending: true })
    for (const row of items ?? []) {
      countMap[row.collection_id] = (countMap[row.collection_id] ?? 0) + 1
      const mf = row.media_files as unknown as { storage_path: string; display_path: string | null } | null
      if (mf?.storage_path && !coverRefMap[row.collection_id]) coverRefMap[row.collection_id] = mf
    }
  }

  const coverUrls = await signStoragePathsSized(Object.values(coverRefMap), 'card', { aspect: 'preserve' })
  const coverMap: Record<string, string> = {}
  for (const [collectionId, ref] of Object.entries(coverRefMap)) {
    const url = coverUrls.get(ref.storage_path)
    if (url) coverMap[collectionId] = url
  }

  return (
    <div className="min-h-screen bg-surface-0">
      <Navbar profile={profile} />
      <main className="flex">
        <Sidebar />
        <div className="flex-1 min-w-0 px-6 py-6">
          <p className="text-xs uppercase tracking-wider mb-5" style={{ color: 'var(--text-muted)' }}>
            Collections
          </p>

          {(collections ?? []).length === 0 ? (
            <div className="flex flex-col items-center justify-center py-24 text-center border border-dashed rounded-lg" style={{ borderColor: 'var(--surface-3)' }}>
              <FolderHeart size={28} className="mb-3" style={{ color: 'var(--text-dim)' }} />
              <p className="text-base" style={{ color: 'var(--text-secondary)' }}>No collections yet</p>
              <p className="text-sm mt-1 max-w-xs" style={{ color: 'var(--text-muted)' }}>
                Select photos from search results and add them to a collection to start one.
              </p>
              <Link
                href="/search"
                className="mt-4 text-sm underline underline-offset-2 hover:opacity-80"
                style={{ color: 'var(--text-secondary)' }}
              >
                Go to search
              </Link>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {(collections ?? []).map((c) => (
                <CollectionCard
                  key={c.id}
                  collection={{
                    id:        c.id,
                    name:      c.name,
                    coverUrl:  coverMap[c.id] ?? null,
                    count:     countMap[c.id] ?? 0,
                    dateLabel: fmtDate(c.created_at),
                  }}
                />
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  )
}
