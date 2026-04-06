'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import type { CSSProperties } from 'react'
import type { UserProfile } from '@/lib/auth'
import ThemeToggle from '@/components/ui/ThemeToggle'

// ─── Types ────────────────────────────────────────────────────────────────────

export type StatItem = {
  label: string
  value: string | number
  sub?:  string
}

interface Props {
  profile:        UserProfile
  eventModeHref?: string
  stats?:         StatItem[]
}

// ─── Nav links ────────────────────────────────────────────────────────────────

const NAV_LINKS = [
  { label: 'Projects', href: '/projects', matchPrefix: '/projects' },
  { label: 'Search',   href: '/search',   matchPrefix: '/search'   },
]

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

const navArea: CSSProperties = {
  display:    'flex',
  alignItems: 'stretch',
  height:     44,
  flex:       1,
}

function navLinkStyle(active: boolean): CSSProperties {
  return {
    display:        'inline-flex',
    alignItems:     'center',
    fontSize:       11,
    letterSpacing:  '0.04em',
    color:          active ? 'var(--accent-dark)' : 'var(--text-muted)',
    padding:        '0 12px',
    textDecoration: 'none',
    borderBottom:   active ? '1.5px solid var(--accent)' : '1.5px solid transparent',
    transition:     'color 0.15s, border-color 0.15s',
    whiteSpace:     'nowrap' as const,
  }
}

const rightArea: CSSProperties = {
  display:    'flex',
  alignItems: 'center',
  gap:        10,
  flexShrink: 0,
}

const eventBadge: CSSProperties = {
  background:   'var(--accent-bg)',
  border:       '0.5px solid var(--accent)',
  borderRadius: 2,
  padding:      '2px 7px',
  fontSize:     9,
  color:        'var(--accent-dark)',
  letterSpacing:'0.06em',
  textDecoration:'none',
  whiteSpace:   'nowrap' as const,
}

function avatarCircle(): CSSProperties {
  return {
    width:          26,
    height:         26,
    borderRadius:   '50%',
    background:     'var(--surface-2)',
    border:         'var(--border-subtle)',
    display:        'flex',
    alignItems:     'center',
    justifyContent: 'center',
    fontSize:       9,
    fontWeight:     600,
    color:          'var(--text-primary)',
    flexShrink:     0,
    cursor:         'pointer',
    userSelect:     'none' as const,
    textDecoration: 'none',
  }
}

const statBar: CSSProperties = {
  display:    'flex',
  flexWrap:   'nowrap' as const,
  width:      '100%',
  background: 'var(--surface-1)',
  borderBottom: 'var(--border-rule)',
}

function statCell(index: number, total: number): CSSProperties {
  return {
    flex:       '1 1 0',
    minWidth:   0,
    padding:    '8px 16px',
    borderRight: index < total - 1 ? 'var(--border-rule)' : 'none',
  }
}

const statLabel: CSSProperties = {
  fontSize:      9,
  textTransform: 'uppercase' as const,
  letterSpacing: '0.14em',
  color:         'var(--text-dim)',
  marginBottom:  2,
  whiteSpace:    'nowrap' as const,
}

function statValue(first: boolean): CSSProperties {
  return {
    fontSize:   22,
    fontWeight: 500,
    lineHeight: 1,
    color:      first ? 'var(--accent-dark)' : 'var(--text-primary)',
    marginBottom: 1,
  }
}

const statSub: CSSProperties = {
  fontSize: 10,
  color:    'var(--text-dim)',
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function initials(profile: UserProfile): string {
  if (profile.full_name) {
    const parts = profile.full_name.trim().split(/\s+/)
    return (parts[0][0] + (parts[1]?.[0] ?? '')).toUpperCase()
  }
  return profile.email[0].toUpperCase()
}

function isActive(matchPrefix: string, pathname: string): boolean {
  return pathname === matchPrefix || pathname.startsWith(matchPrefix + '/')
}

// ─── Navbar ───────────────────────────────────────────────────────────────────

export default function Navbar({ profile, eventModeHref, stats }: Props) {
  const pathname = usePathname()
  const avatar   = initials(profile)

  return (
    <>
      {/* ── Main bar ──────────────────────────────────────────────────────── */}
      <div style={bar}>
        {/* Wordmark */}
        <Link href="/projects" style={wordmark}>TRUNQ</Link>

        {/* Nav links */}
        <nav style={navArea}>
          {NAV_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              style={navLinkStyle(isActive(link.matchPrefix, pathname))}
            >
              {link.label}
            </Link>
          ))}
        </nav>

        {/* Right side */}
        <div style={rightArea}>
          <ThemeToggle />
          {eventModeHref && (
            <Link href={eventModeHref} style={eventBadge}>
              ● EVENT MODE
            </Link>
          )}
          <Link href="/settings" style={avatarCircle()} aria-label="Account settings">
            {avatar}
          </Link>
        </div>
      </div>

      {/* ── Stat bar ──────────────────────────────────────────────────────── */}
      {stats && stats.length > 0 && (
        <div style={statBar}>
          {stats.map((stat, i) => (
            <div key={stat.label} style={statCell(i, stats.length)}>
              <p style={statLabel}>{stat.label}</p>
              <p style={statValue(i === 0)}>{stat.value}</p>
              {stat.sub && <p style={statSub}>{stat.sub}</p>}
            </div>
          ))}
        </div>
      )}
    </>
  )
}
