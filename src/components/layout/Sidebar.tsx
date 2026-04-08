'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import type { CSSProperties } from 'react'
import { useEventMode } from '@/context/EventModeContext'
import GlobalSearch from '@/components/GlobalSearch'

// ─── Nav structure ────────────────────────────────────────────────────────────

type NavLink = {
  kind:        'link'
  label:       string
  href:        string
  matchPrefix: string
  badge?:      boolean  // show count badge if > 0
}
type NavDivider = { kind: 'divider' }
type NavEntry   = NavLink | NavDivider

const NAV: NavEntry[] = [
  { kind: 'link',    label: 'Projects',  href: '/projects',       matchPrefix: '/projects'  },
  { kind: 'divider' },
  { kind: 'link',    label: 'Queue',     href: '/queue',          matchPrefix: '/queue', badge: true },
  { kind: 'link',    label: 'Delivery',  href: '/delivery/manage', matchPrefix: '/delivery' },
  { kind: 'divider' },
  { kind: 'link',    label: 'Team',      href: '/settings#team',  matchPrefix: '__never__'  },
  { kind: 'link',    label: 'Settings',  href: '/settings',       matchPrefix: '/settings'  },
]

// Mobile tabs — links only, no dividers
const MOBILE_TABS = NAV.filter((e): e is NavLink => e.kind === 'link' && e.label !== 'Team')

// ─── Styles ───────────────────────────────────────────────────────────────────

const sidebar: CSSProperties = {
  width:         140,
  flexShrink:    0,
  background:    'var(--surface-1)',
  borderRight:   'var(--border-rule)',
  height:        'calc(100vh - 44px)',
  position:      'sticky',
  top:           44,
  overflowY:     'auto',
  flexDirection: 'column',
}

function linkStyle(active: boolean): CSSProperties {
  return {
    display:        'flex',
    alignItems:     'center',
    justifyContent: 'space-between',
    fontSize:       11,
    color:          active ? 'var(--accent)' : 'var(--text-secondary)',
    padding:        '8px 14px',
    borderLeft:     active ? '1.5px solid var(--accent)' : '1.5px solid transparent',
    background:     active ? 'var(--accent-bg)' : 'transparent',
    textDecoration: 'none',
    whiteSpace:     'nowrap' as const,
    transition:     'color 0.15s, background 0.15s, border-color 0.15s',
  }
}

const dot: CSSProperties = {
  width:        3,
  height:       3,
  borderRadius: '50%',
  background:   'currentColor',
  flexShrink:   0,
}

const dividerStyle: CSSProperties = {
  borderTop: 'var(--border-rule)',
  margin:    '4px 0',
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function isActive(entry: NavLink, pathname: string): boolean {
  if (entry.matchPrefix === '__never__') return false
  return pathname === entry.matchPrefix
    || pathname.startsWith(entry.matchPrefix + '/')
    || (entry.matchPrefix !== '/projects' && pathname === entry.matchPrefix)
}

// ─── Sidebar ──────────────────────────────────────────────────────────────────

export default function Sidebar() {
  const pathname = usePathname()
  const [pendingCount, setPendingCount] = useState(0)
  const { eventMode, toggleEventMode } = useEventMode()

  useEffect(() => {
    fetch('/api/queue/count')
      .then((r) => r.json())
      .then((d) => setPendingCount(d.count ?? 0))
      .catch(() => {})
  }, [pathname])

  return (
    <>
      {/* ── Desktop sidebar ──────────────────────────────────────────────── */}
      <nav style={sidebar} aria-label="Main navigation" className="sidebar-desktop hidden md:flex">
        <div style={{ flex: 1 }}>
          {NAV.map((entry, i) => {
            if (entry.kind === 'divider') {
              return <div key={`div-${i}`} style={dividerStyle} />
            }
            const active = isActive(entry, pathname)
            const count  = entry.badge ? pendingCount : 0
            return (
              <Link key={entry.href} href={entry.href} style={linkStyle(active)}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  {entry.label}
                  {active && (
                    <span style={{
                      ...dot,
                      background: eventMode ? 'var(--accent)' : 'currentColor',
                      animation:  eventMode ? 'pulse-dot 1.4s ease-in-out infinite' : 'none',
                    }} />
                  )}
                </span>
                {count > 0 && (
                  <span style={{
                    fontSize:     9,
                    fontWeight:   600,
                    color:        active ? 'var(--accent)' : 'var(--text-muted)',
                    background:   active ? 'var(--accent-bg)' : 'var(--surface-3)',
                    borderRadius: 8,
                    padding:      '1px 5px',
                    letterSpacing: '0.02em',
                  }}>
                    {count}
                  </span>
                )}
              </Link>
            )
          })}
        </div>

        {/* ── Event mode toggle ─────────────────────────────────────────── */}
        <div style={{ borderTop: 'var(--border-rule)', padding: '10px 14px' }}>
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            background: eventMode ? 'var(--accent-bg)' : 'transparent',
            borderLeft: eventMode ? '1.5px solid var(--accent)' : '1.5px solid transparent',
            margin: '0 -14px', padding: '4px 14px',
          }}>
            <span style={{ fontSize: 11, color: eventMode ? 'var(--accent)' : 'var(--text-muted)', fontFamily: 'inherit' }}>
              Event mode
            </span>
            <button
              onClick={toggleEventMode}
              aria-label="Toggle event mode"
              style={{
                width: 32, height: 18, borderRadius: 9, position: 'relative',
                background: eventMode ? 'var(--accent)' : 'var(--surface-3)',
                border: 'none', padding: 0, cursor: 'pointer',
                transition: 'background 0.2s', flexShrink: 0,
              }}
            >
              <span style={{
                position: 'absolute', top: 2,
                left: eventMode ? 16 : 2,
                width: 14, height: 14, borderRadius: '50%',
                background: eventMode ? '#fff' : 'var(--surface-0)',
                transition: 'left 0.2s',
                display: 'block',
              }} />
            </button>
          </div>
        </div>
      </nav>

      {/* ── Mobile floating search bar ───────────────────────────────────── */}
      <div className="sidebar-mobile-search">
        <GlobalSearch upward />
      </div>

      {/* ── Mobile bottom tab bar ────────────────────────────────────────── */}
      <nav aria-label="Main navigation" className="sidebar-mobile">
        {MOBILE_TABS.map((entry) => {
          const active = isActive(entry, pathname)
          return (
            <Link
              key={entry.href}
              href={entry.href}
              aria-label={entry.label}
              style={{
                display:        'flex',
                flexDirection:  'column',
                alignItems:     'center',
                justifyContent: 'center',
                flex:           1,
                paddingTop:     8,
                paddingLeft:    4,
                paddingRight:   4,
                paddingBottom:  0,
                fontSize:       10,
                color:          active ? 'var(--accent)' : 'var(--text-muted)',
                borderTop:      active ? '1.5px solid var(--accent)' : '1.5px solid transparent',
                background:     'transparent',
                textDecoration: 'none',
                transition:     'color 0.15s',
                letterSpacing:  '0.08em',
                textTransform:  'uppercase',
              }}
            >
              {entry.label}
            </Link>
          )
        })}
      </nav>

      <style>{`
        @keyframes pulse-dot {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.4; transform: scale(1.6); }
        }
        .sidebar-desktop       { display: flex; }
        .sidebar-mobile        { display: none; }
        .sidebar-mobile-search { display: none; }
        @media (max-width: 767px) {
          .sidebar-desktop { display: none; }
          .sidebar-mobile {
            display: flex;
            flex-direction: row;
            position: fixed;
            bottom: 0; left: 0; right: 0;
            height: 48px;
            padding-bottom: env(safe-area-inset-bottom);
            background: var(--surface-1);
            border-top: var(--border-rule);
            z-index: 50;
          }
          .sidebar-mobile-search {
            display: block;
            position: fixed;
            bottom: calc(48px + env(safe-area-inset-bottom) + 8px);
            left: 16px;
            right: 16px;
            z-index: 51;
          }
        }
      `}</style>
    </>
  )
}
