'use client'

import type { CSSProperties, ReactNode } from 'react'
import Pill from '@/components/ui/Pill'

// ─── Types ────────────────────────────────────────────────────────────────────

export type SortBy = 'year' | 'project' | 'client' | 'photographer'

export interface FolderItem {
  id:     string
  label:  string    // short tab label
  name:   string    // full name in body
  count:  number
  active: boolean
  pill?:  ReactNode
}

interface Props {
  folders:      FolderItem[]
  sortBy:       SortBy
  onSelect:     (id: string) => void
  onSortChange: (sort: SortBy) => void
}

// ─── Sort options ─────────────────────────────────────────────────────────────

const SORT_OPTIONS: { value: SortBy; label: string }[] = [
  { value: 'year',         label: 'Year'         },
  { value: 'project',      label: 'Project'      },
  { value: 'client',       label: 'Client'       },
  { value: 'photographer', label: 'Photographer' },
]

// ─── Styles ───────────────────────────────────────────────────────────────────

const wrapper: CSSProperties = {
  display:       'flex',
  flexDirection: 'column',
  gap:           0,
  borderBottom:  'var(--border-rule)',
  paddingBottom: 16,
}

const toolbar: CSSProperties = {
  display:     'flex',
  alignItems:  'center',
  gap:         10,
  marginBottom: 14,
}

const sortLabel: CSSProperties = {
  fontSize:      9,
  textTransform: 'uppercase' as const,
  letterSpacing: '0.1em',
  color:         'var(--text-dim)',
  flexShrink:    0,
}

const segGroup: CSSProperties = {
  display: 'flex',
}

function segBtn(active: boolean, position: 'first' | 'mid' | 'last'): CSSProperties {
  const radius =
    position === 'first' ? '2px 0 0 2px' :
    position === 'last'  ? '0 2px 2px 0' : '0'

  return {
    fontSize:      9,
    letterSpacing: '0.06em',
    fontWeight:    active ? 600 : 400,
    padding:       '3px 9px',
    background:    active ? 'var(--accent-bg)' : 'transparent',
    color:         active ? 'var(--accent-dark)' : 'var(--text-muted)',
    border:        active ? '0.5px solid var(--accent-border)' : 'var(--border-subtle)',
    borderRadius:  radius,
    cursor:        'pointer',
    marginLeft:    position === 'first' ? 0 : -1,
    transition:    'color 0.12s, background 0.12s, border-color 0.12s',
    lineHeight:    1,
    fontFamily:    'inherit',
    position:      'relative' as const,
    zIndex:        active ? 1 : 0,
  }
}

const folderList: CSSProperties = {
  display:       'flex',
  flexDirection: 'column',
  gap:           4,
}

// Per-folder container — needs padding-top to reserve space for the tab
function folderWrap(): CSSProperties {
  return {
    position:   'relative',
    paddingTop: 18,
  }
}

// Tab: absolutely positioned at the stagger offset, sits above the body
function tabStyle(active: boolean, offsetPct: number): CSSProperties {
  return {
    position:     'absolute',
    top:          0,
    left:         `calc(${offsetPct}% + 0px)`,
    height:       18,
    minWidth:     90,
    maxWidth:     '40%',
    borderRadius: '2px 2px 0 0',
    border:       active ? '0.5px solid var(--accent)' : '0.5px solid var(--surface-3)',
    borderBottom: 'none',
    background:   active ? 'var(--accent)' : 'var(--surface-1)',
    display:      'flex',
    alignItems:   'center',
    paddingInline: 8,
    cursor:       'pointer',
    zIndex:       1,
    overflow:     'hidden',
  }
}

function tabLabel(active: boolean): CSSProperties {
  return {
    fontSize:      9,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.08em',
    fontWeight:    500,
    color:         active ? 'var(--text-primary)' : 'var(--text-dim)',
    whiteSpace:    'nowrap' as const,
    overflow:      'hidden',
    textOverflow:  'ellipsis',
  }
}

// Body: full-width row beneath the tab
function bodyStyle(active: boolean): CSSProperties {
  return {
    height:       40,
    borderRadius: '0 3px 3px 3px',
    border:       active ? '0.5px solid var(--accent-border)' : 'var(--border-subtle)',
    background:   active ? 'var(--accent-bg)' : 'var(--surface-1)',
    padding:      '0 14px',
    display:      'flex',
    alignItems:   'center',
    justifyContent: 'space-between',
    cursor:       'pointer',
  }
}

function bodyName(active: boolean): CSSProperties {
  return {
    fontSize:   11,
    color:      active ? 'var(--accent)' : 'var(--text-muted)',
    fontWeight: active ? 500 : 400,
    overflow:   'hidden',
    whiteSpace: 'nowrap' as const,
    textOverflow: 'ellipsis',
    flex:       1,
    minWidth:   0,
  }
}

const bodyRight: CSSProperties = {
  display:    'flex',
  alignItems: 'center',
  gap:        6,
  flexShrink: 0,
  marginLeft: 10,
}

function countStyle(active: boolean): CSSProperties {
  return {
    fontSize:      9,
    letterSpacing: '0.04em',
    color:         active ? 'var(--accent-dark)' : 'var(--text-dim)',
    fontVariantNumeric: 'tabular-nums' as const,
  }
}

// ─── FolderDrawer ─────────────────────────────────────────────────────────────

export default function FolderDrawer({ folders, sortBy, onSelect, onSortChange }: Props) {
  return (
    <div style={wrapper}>
      {/* ── Sort toolbar ────────────────────────────────────────────────── */}
      <div style={toolbar}>
        <span style={sortLabel}>Sort by</span>
        <div style={segGroup}>
          {SORT_OPTIONS.map((opt, i) => {
            const position =
              i === 0                        ? 'first' :
              i === SORT_OPTIONS.length - 1  ? 'last'  : 'mid'
            return (
              <button
                key={opt.value}
                style={segBtn(sortBy === opt.value, position)}
                onClick={() => onSortChange(opt.value)}
              >
                {opt.label}
              </button>
            )
          })}
        </div>
      </div>

      {/* ── Folder stack ────────────────────────────────────────────────── */}
      <div style={folderList}>
        {folders.map((folder, index) => {
          const offsetPct = (index % 5) * 20
          return (
            <div key={folder.id} style={folderWrap()}>
              {/* Tab */}
              <div
                style={tabStyle(folder.active, offsetPct)}
                onClick={() => onSelect(folder.id)}
              >
                <span style={tabLabel(folder.active)}>{folder.label}</span>
              </div>

              {/* Body */}
              <div
                style={bodyStyle(folder.active)}
                onClick={() => onSelect(folder.id)}
              >
                <span style={bodyName(folder.active)}>{folder.name}</span>
                <div style={bodyRight}>
                  <span style={countStyle(folder.active)}>{folder.count}</span>
                  {folder.pill}
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
