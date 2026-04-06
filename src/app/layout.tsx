import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'Archive',
  description: 'Smart media management for events',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <script dangerouslySetInnerHTML={{ __html: `(function(){var t=localStorage.getItem('trunq-theme');if(t==='dark')document.documentElement.setAttribute('data-theme','dark');})();` }} />
      </head>
      <body className={`${inter.className} min-h-screen`} style={{ background: 'var(--surface-0)', color: 'var(--text-primary)' }}>
        {children}
      </body>
    </html>
  )
}
