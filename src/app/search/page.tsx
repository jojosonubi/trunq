import { requireAuth } from '@/lib/auth'
import SearchPageClient from './SearchPageClient'

interface Props {
  searchParams: { q?: string }
}

export default async function SearchPage({ searchParams }: Props) {
  await requireAuth()
  return <SearchPageClient initialQuery={searchParams.q ?? ''} />
}
