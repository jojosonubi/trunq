'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import type { CSSProperties } from 'react'
import {
  Archive, Calendar, Search,
  Crop, Send, ScanFace,
  Users, Settings,
} from 'lucide-react'

// ─── Nav data ─────────────────────────────────────────────────────────────────

type NavItem = {
  label: string
  href:  string
  icon:  React.ElementType
  matchPrefix?: string
}

type Section = {
  title: string
  items: NavItem[]
}

const SECTIONS: Section[] = [
  {
    title: 'Workspace',
    items: [
      { label: 'Archive',  href: '/projects', icon: Archive,  matchPrefix: '/projects' },
      { label: 'Events',   href: '/events',   icon: Calendar, matchPrefix: '/events'   },
      { label: 'Search',   href: '/search',   icon: Search,   matchPrefix: '/search'   },
    ],
  },
  {
    title: 'Tools',
    items: [
      { label: 'Crop',       href: '/crop',      icon: Crop     },
      { label: 'Delivery',   href: '/delivery',  icon: Send     },
      { label: 'Face match', href: '/face-scan', icon: ScanFace },
    ],
  },
  {
    title: 'Admin',
    items: [
      { label: 'Team',     href: '/settings#team', icon: Users    },
      { label: 'Settings', href: '/settings',       icon: Settings },
    ],
  },
]

// ─── Styles ───────────────────────────────────────────────────────────────────

const sidebar: CSSProperties = {
  width:       140,
  flexShrink:  0,
  background:  'var(--surface-1)',
  borderRight: 'var(--border-rule)',
  height:      '100vh',
  position:    'sticky',
  top:         0,
  overflowY:   'auto',
  display:     'flex',
  flexDirection: 'column',
}

const sectionHeaderBase: CSSProperties = {
  fontSize:      8,
  letterSpacing: '0.14em',
  color:         'var(--text-dim)',
  padding:       '12px 12px 5px',
  textTransform: 'uppercase',
  borderTop:     'var(--border-rule)',
}

const sectionHeaderFirst: CSSProperties = {
  ...sectionHeaderBase,
  borderTop: 'none',
}

function navItemStyle(active: boolean): CSSProperties {
  return {
    display:         'flex',
    flexDirection:   'row',
    alignItems:      'center',
    gap:             8,
    fontSize:        11,
    color:           active ? 'var(--accent-dark)' : 'var(--text-muted)',
    padding:         '7px 12px',
    borderLeft:      active ? '1.5px solid var(--accent)' : '1.5px solid transparent',
    background:      active ? 'var(--accent-bg)' : 'transparent',
    textDecoration:  'none',
    whiteSpace:      'nowrap' as const,
    transition:      'color 0.15s, background 0.15s, border-color 0.15s',
  }
}

const dot: CSSProperties = {
  width:        3,
  height:       3,
  borderRadius: '50%',
  background:   'currentColor',
  opacity:      0.5,
  flexShrink:   0,
}

// ─── Sidebar ──────────────────────────────────────────────────────────────────

function isActive(item: NavItem, pathname: string): boolean {
  const prefix = item.matchPrefix ?? item.href
  return pathname === item.href || pathname.startsWith(prefix + '/')
}

export default function Sidebar() {
  const pathname = usePathname()

  return (
    <>
      {/* ── Desktop: sticky left sidebar ────────────────────────────────── */}
      <nav style={sidebar} aria-label="Main navigation" className="sidebar-desktop">
        {SECTIONS.map((section, si) => (
          <div key={section.title}>
            <p style={si === 0 ? sectionHeaderFirst : sectionHeaderBase}>
              {section.title}
            </p>
            {section.items.map((item) => {
              const active = isActive(item, pathname)
              const Icon   = item.icon
              return (
                <Link key={item.href} href={item.href} style={navItemStyle(active)}>
                  <Icon size={13} strokeWidth={1.6} style={{ flexShrink: 0 }} />
                  {item.label}
                  {active && <span style={dot} />}
                </Link>
              )
            })}
          </div>
        ))}
      </nav>

      {/* ── Mobile: bottom tab bar (icons only) ─────────────────────────── */}
      <nav aria-label="Main navigation" className="sidebar-mobile">
        {SECTIONS.flatMap((s) => s.items).map((item) => {
          const active = isActive(item, pathname)
          const Icon   = item.icon
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-label={item.label}
              style={{
                display:        'flex',
                flexDirection:  'column',
                alignItems:     'center',
                justifyContent: 'center',
                flex:           1,
                padding:        '8px 4px',
                color:          active ? 'var(--accent-dark)' : 'var(--text-muted)',
                borderTop:      active ? '1.5px solid var(--accent)' : '1.5px solid transparent',
                background:     active ? 'var(--accent-bg)' : 'transparent',
                textDecoration: 'none',
                transition:     'color 0.15s, background 0.15s',
              }}
            >
              <Icon size={18} strokeWidth={1.6} />
            </Link>
          )
        })}
      </nav>

      <style>{`
        .sidebar-desktop { display: flex; }
        .sidebar-mobile  { display: none; }

        @media (max-width: 767px) {
          .sidebar-desktop {
            display: none;
          }
          .sidebar-mobile {
            display: flex;
            flex-direction: row;
            position: fixed;
            bottom: 0;
            left: 0;
            right: 0;
            height: 56px;
            background: var(--surface-1);
            border-top: var(--border-rule);
            z-index: 50;
          }
        }
      `}</style>
    </>
  )
}
