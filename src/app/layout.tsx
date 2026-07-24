import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import { EventModeProvider } from '@/context/EventModeContext'
import TaggingProgress from '@/components/TaggingProgress'
import NavigationProgress from '@/components/NavigationProgress'
import { ToastHost } from '@/components/ui/Toast'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'Archive',
  description: 'Smart media management for events',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        {/* Dark is the base theme; light only when explicitly chosen */}
        <script dangerouslySetInnerHTML={{ __html: `(function(){var t=localStorage.getItem('trunq-theme');if(t!=='light')document.documentElement.setAttribute('data-theme','dark');})();` }} />
      </head>
      <body className={`${inter.className} min-h-screen`} style={{ background: 'var(--surface-0)', color: 'var(--text-primary)' }}>
        <EventModeProvider>
          <NavigationProgress />
          {children}
          <TaggingProgress />
          <ToastHost />
        </EventModeProvider>
      </body>
    </html>
  )
}
