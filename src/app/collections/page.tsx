import Link from 'next/link'
import Image from 'next/image'
import { requireAuth } from '@/lib/auth'
import { createServiceClient } from '@/lib/supabase/service'
import { signStoragePathsSized } from '@/lib/supabase/storage'
import Navbar from '@/components/layout/Navbar'
import Sidebar from '@/components/layout/Sidebar'
import { FolderHeart, ImageIcon } from 'lucide-react'

export const revalidate = 0

function fmtDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-GB', {
    day: 'numeric', month: 'short', year: 'numeric',
  })
}

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
                <Link
                  key={c.id}
                  href={`/collections/${c.id}`}
                  className="group rounded overflow-hidden transition-all"
                  style={{ background: 'var(--surface-0)', border: 'var(--border-rule)' }}
                >
                  <div className="relative aspect-[16/10] w-full overflow-hidden">
                    {coverMap[c.id] ? (
                      <Image
                        src={coverMap[c.id]}
                        alt={c.name}
                        fill
                        sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 25vw"
                        className="object-cover group-hover:scale-[1.03] transition-transform duration-500"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center" style={{ background: 'var(--surface-2)' }}>
                        <ImageIcon size={28} className="text-white/15" />
                      </div>
                    )}
                  </div>
                  <div className="p-4">
                    <h3 className="text-base font-semibold truncate" style={{ color: 'var(--text-primary)' }}>
                      {c.name}
                    </h3>
                    <p className="text-sm mt-1 tabular-nums" style={{ color: 'var(--text-muted)' }}>
                      {countMap[c.id] ?? 0} photo{(countMap[c.id] ?? 0) !== 1 ? 's' : ''} · {fmtDate(c.created_at)}
                    </p>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  )
}
