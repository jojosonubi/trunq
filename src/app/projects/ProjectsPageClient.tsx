'use client'

import { useState } from 'react'
import Sidebar from '@/components/layout/Sidebar'
import FolderDrawer, { type FolderItem, type SortBy, type Project } from '@/components/archive/FolderDrawer'
import NewProjectModal from '@/components/archive/NewProjectModal'
import type { Event } from '@/types'

interface Props {
  events:         (Event & { cover_image_url: string | null })[]
  photoCountMap:  Record<string, number>
  folderCountMap: Record<string, number>
  role:           string
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function projectFromEvent(
  e: Event & { cover_image_url: string | null },
  photoCountMap: Record<string, number>,
): Project {
  return {
    id:              e.id,
    name:            e.name,
    date:            e.date,
    venue:           e.venue ?? null,
    cover_image_url: e.cover_image_url,
    photoCount:      photoCountMap[e.id] ?? 0,
  }
}

function buildFolders(
  events: (Event & { cover_image_url: string | null })[],
  sortBy:       SortBy,
  photoCountMap: Record<string, number>,
): FolderItem[] {

  if (sortBy === 'year') {
    const yearMap = new Map<string, typeof events>()
    for (const e of events) {
      const year = String(new Date(e.date).getFullYear())
      if (!yearMap.has(year)) yearMap.set(year, [])
      yearMap.get(year)!.push(e)
    }
    return [...yearMap.keys()]
      .sort()
      .reverse()
      .map((year) => ({
        id:       year,
        label:    year,
        projects: yearMap.get(year)!.map((e) => projectFromEvent(e, photoCountMap)),
      }))
  }

  if (sortBy === 'project') {
    return [...events]
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((e) => ({
        id:       e.id,
        label:    e.name,
        projects: [projectFromEvent(e, photoCountMap)],
      }))
  }

  if (sortBy === 'client') {
    const clientMap = new Map<string, typeof events>()
    for (const e of events) {
      const client = e.venue?.trim() || 'No client'
      if (!clientMap.has(client)) clientMap.set(client, [])
      clientMap.get(client)!.push(e)
    }
    return [...clientMap.keys()]
      .sort((a, b) => (a === 'No client' ? 1 : b === 'No client' ? -1 : a.localeCompare(b)))
      .map((client) => ({
        id:       client,
        label:    client,
        projects: clientMap.get(client)!.map((e) => projectFromEvent(e, photoCountMap)),
      }))
  }

  // photographer
  const photogMap = new Map<string, typeof events>()
  for (const e of events) {
    const photog = e.photographers?.[0]?.trim() || 'Unassigned'
    if (!photogMap.has(photog)) photogMap.set(photog, [])
    photogMap.get(photog)!.push(e)
  }
  return [...photogMap.keys()]
    .sort((a, b) => (a === 'Unassigned' ? 1 : b === 'Unassigned' ? -1 : a.localeCompare(b)))
    .map((photog) => ({
      id:       photog,
      label:    photog,
      projects: photogMap.get(photog)!.map((e) => projectFromEvent(e, photoCountMap)),
    }))
}

// ─── Sort controls ────────────────────────────────────────────────────────────

const SORT_OPTIONS: { value: SortBy; label: string }[] = [
  { value: 'year',         label: 'Year'   },
  { value: 'project',      label: 'A–Z'    },
  { value: 'client',       label: 'Client' },
  { value: 'photographer', label: 'Photog' },
]

function segBtnStyle(active: boolean, position: 'first' | 'mid' | 'last'): React.CSSProperties {
  const radius =
    position === 'first' ? '2px 0 0 2px' :
    position === 'last'  ? '0 2px 2px 0' : '0'

  return {
    fontSize:      9,
    letterSpacing: '0.06em',
    fontWeight:    active ? 600 : 400,
    padding:       '3px 8px',
    background:    active ? 'var(--accent-bg)' : 'transparent',
    color:         active ? 'var(--accent)'    : 'var(--text-muted)',
    border:        active ? '0.5px solid var(--accent-border)' : 'var(--border-subtle)',
    borderRadius:  radius,
    cursor:        'pointer',
    marginLeft:    position === 'first' ? 0 : -1,
    lineHeight:    1,
    fontFamily:    'inherit',
    position:      'relative' as const,
    zIndex:        active ? 1 : 0,
    transition:    'color 0.12s, background 0.12s',
  }
}

// ─── ProjectsPageClient ───────────────────────────────────────────────────────

export default function ProjectsPageClient({
  events,
  photoCountMap,
  folderCountMap: _folderCountMap,
  role,
}: Props) {
  const [sortBy, setSortBy]       = useState<SortBy>('year')
  const [modalOpen, setModalOpen] = useState(false)

  const folders = buildFolders(events, sortBy, photoCountMap)
  const [activeFolder, setActiveFolder] = useState<string>(folders[0]?.id ?? '')

  function handleSortChange(newSort: SortBy) {
    const newFolders = buildFolders(events, newSort, photoCountMap)
    setSortBy(newSort)
    setActiveFolder(newFolders[0]?.id ?? '')
  }

  return (
    <div style={{ display: 'flex', alignItems: 'flex-start' }}>
      {/* ── Sidebar ─────────────────────────────────────────────────────────── */}
      <Sidebar />

      {/* ── Main content ────────────────────────────────────────────────────── */}
      <main style={{ flex: 1, minWidth: 0, padding: '20px 24px', minHeight: 'calc(100vh - 44px)' }}>

        {/* Header row */}
        <div style={{
          display:        'flex',
          alignItems:     'center',
          justifyContent: 'space-between',
          marginBottom:   16,
          paddingBottom:  8,
          borderBottom:   'var(--border-rule)',
        }}>
          <p style={{
            fontSize:      9,
            textTransform: 'uppercase',
            letterSpacing: '0.14em',
            color:         'var(--text-muted)',
            margin:        0,
          }}>
            Archive
          </p>

          {/* Sort controls */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 9, color: 'var(--text-dim)', letterSpacing: '0.1em', textTransform: 'uppercase', fontFamily: 'inherit' }}>
              Sort
            </span>
            <div style={{ display: 'flex' }}>
              {SORT_OPTIONS.map((opt, i) => {
                const position =
                  i === 0                        ? 'first' :
                  i === SORT_OPTIONS.length - 1  ? 'last'  : 'mid'
                return (
                  <button
                    key={opt.value}
                    style={segBtnStyle(sortBy === opt.value, position)}
                    onClick={() => handleSortChange(opt.value)}
                  >
                    {opt.label}
                  </button>
                )
              })}
            </div>
          </div>
        </div>

        {/* Folder drawer */}
        <FolderDrawer
          folders={folders}
          activeFolder={activeFolder}
          onFolderChange={setActiveFolder}
          onNewProject={() => setModalOpen(true)}
          role={role}
        />

        {/* New project modal */}
        <NewProjectModal isOpen={modalOpen} onClose={() => setModalOpen(false)} />
      </main>
    </div>
  )
}
