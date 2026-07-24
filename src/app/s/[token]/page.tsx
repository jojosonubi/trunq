import type { Metadata } from 'next'
import PublicShareClient from './PublicShareClient'

export const metadata: Metadata = {
  title: 'Shared gallery',
  robots: { index: false, follow: false },
}

export default function PublicSharePage({ params }: { params: { token: string } }) {
  return <PublicShareClient token={params.token} />
}
