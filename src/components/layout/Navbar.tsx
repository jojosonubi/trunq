'use client'

import Link from 'next/link'
import type { CSSProperties } from 'react'
import type { UserProfile } from '@/lib/auth'
import ThemeToggle from '@/components/ui/ThemeToggle'
import GlobalSearch from '@/components/GlobalSearch'
import UserMenu from '@/components/UserMenu'
import { useEventMode } from '@/context/EventModeContext'

interface Props {
  profile: UserProfile
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const bar: CSSProperties = {
  height:       44,
  background:   'var(--surface-1)',
  borderBottom: 'var(--border-rule)',
  padding:      '0 16px',
  display:      'flex',
  alignItems:   'center',
  position:     'sticky',
  top:          0,
  zIndex:       40,
}

const wordmark: CSSProperties = {
  fontSize:      12,
  fontWeight:    700,
  letterSpacing: '0.18em',
  color:         'var(--text-primary)',
  textDecoration:'none',
  marginRight:   28,
  flexShrink:    0,
}

const rightArea: CSSProperties = {
  display:    'flex',
  alignItems: 'center',
  gap:        10,
  flexShrink: 0,
}

// ─── Navbar ───────────────────────────────────────────────────────────────────

export default function Navbar({ profile }: Props) {
  const { eventMode } = useEventMode()

  return (
    <div style={{ ...bar, borderBottom: eventMode ? '2px solid var(--accent)' : 'var(--border-rule)' }}>
      {/* Wordmark */}
      <Link href="/projects" style={wordmark}>TRUNQ</Link>

      {/* Nav spacer — keeps right side pushed right */}
      <div style={{ flex: 1 }} />

      {/* Centred search — desktop only */}
      <div className="hidden md:block" style={{ position: 'absolute', left: '50%', transform: 'translateX(-50%)', width: 320, zIndex: 1 }}>
        <GlobalSearch />
      </div>

      {/* Right side */}
      <div style={rightArea}>
        <ThemeToggle />
        <UserMenu profile={profile} />
      </div>
    </div>
  )
}
