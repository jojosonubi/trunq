'use client'

import { useState } from 'react'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import { transformUrl } from '@/lib/supabase/storage'
import Pill from '@/components/ui/Pill'

// ─── Types ────────────────────────────────────────────────────────────────────

export type SortBy = 'year' | 'project' | 'client' | 'photographer'

export interface Project {
  id:              string
  name:            string
  date:            string
  venue:           string | null
  cover_image_url: string | null
  photoCount:      number
}

export interface FolderItem {
  id:       string
  label:    string
  projects: Project[]
}

interface Props {
  folders:        FolderItem[]
  activeFolder:   string
  onFolderChange: (id: string) => void
  onNewProject?:  () => void
  role?:          string
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-GB', {
    day: 'numeric', month: 'short', year: 'numeric',
  })
}

// ─── Project card ─────────────────────────────────────────────────────────────

function ProjectCard({ project }: { project: Project }) {
  const router  = useRouter()
  const [hover, setHover] = useState(false)

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => router.push(`/projects/${project.id}`)}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); router.push(`/projects/${project.id}`) } }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        borderRadius: 3,
        overflow:     'hidden',
        background:   hover ? 'var(--surface-2)' : 'var(--surface-1)',
        border:       '0.5px solid var(--surface-3)',
        cursor:       'pointer',
        transition:   'background 0.12s',
      }}
    >
      {/* Thumbnail */}
      <div style={{ aspectRatio: '16/10', background: 'var(--surface-2)', position: 'relative', overflow: 'hidden' }}>
        {project.cover_image_url ? (
          <Image
            src={transformUrl(project.cover_image_url, 400)}
            alt={project.name}
            fill
            sizes="(max-width: 768px) 50vw, 25vw"
            style={{ objectFit: 'cover' }}
            unoptimized
          />
        ) : (
          <div style={{ width: '100%', height: '100%', background: 'var(--surface-2)' }} />
        )}
      </div>

      {/* Metadata */}
      <div style={{ padding: '8px 10px', borderTop: '0.5px solid var(--surface-3)' }}>
        <p style={{
          fontSize:      11,
          fontWeight:    500,
          color:         'var(--text-primary)',
          letterSpacing: '-0.01em',
          margin:        0,
          overflow:      'hidden',
          whiteSpace:    'nowrap',
          textOverflow:  'ellipsis',
        }}>
          {project.name}
        </p>
        <p style={{
          fontSize:     9,
          color:        'var(--text-muted)',
          marginTop:    3,
          marginBottom: 0,
          overflow:     'hidden',
          whiteSpace:   'nowrap',
          textOverflow: 'ellipsis',
        }}>
          {[formatDate(project.date), project.venue].filter(Boolean).join(' · ')}
        </p>
        {project.photoCount > 0 && (
          <div style={{ marginTop: 4 }}>
            <Pill variant="ghost">{project.photoCount.toLocaleString()} photo{project.photoCount !== 1 ? 's' : ''}</Pill>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── FolderDrawer ─────────────────────────────────────────────────────────────

export default function FolderDrawer({ folders, activeFolder, onFolderChange, onNewProject, role }: Props) {
  const [hoveredTab, setHoveredTab] = useState<string | null>(null)

  const activeItem = folders.find((f) => f.id === activeFolder) ?? folders[0]

  if (folders.length === 0) return null

  return (
    <div>
      {/* ── Tab row ───────────────────────────────────────────────────────── */}
      <div style={{
        display:    'flex',
        alignItems: 'flex-end',
        gap:        2,
        overflowX:  'auto',
        WebkitOverflowScrolling: 'touch' as any,
        // no margin-bottom — tabs connect flush to body
      }}>
        {folders.map((folder) => {
          const isActive  = folder.id === activeItem?.id
          const isHovered = hoveredTab === folder.id && !isActive
          const n         = folder.projects.length
          return (
            <button
              key={folder.id}
              onClick={() => onFolderChange(folder.id)}
              onMouseEnter={() => setHoveredTab(folder.id)}
              onMouseLeave={() => setHoveredTab(null)}
              style={{
                height:        isActive ? 28 : 24,
                padding:       '0 14px',
                borderRadius:  '3px 3px 0 0',
                border:        isActive ? '0.5px solid var(--surface-3)' : '0.5px solid var(--surface-3)',
                borderBottom:  'none',
                fontSize:      10,
                fontWeight:    500,
                letterSpacing: '0.06em',
                fontFamily:    'inherit',
                whiteSpace:    'nowrap',
                cursor:        'pointer',
                background:    isActive   ? 'var(--surface-0)'
                             : isHovered  ? 'var(--surface-1)'
                             :               'var(--surface-2)',
                color:         isActive   ? 'var(--accent)'
                             : isHovered  ? 'var(--text-secondary)'
                             :               'var(--text-muted)',
                zIndex:        isActive ? 2 : 1,
                position:      'relative',
                display:       'inline-flex',
                alignItems:    'center',
                flexShrink:    0,
                transition:    'background 0.1s, color 0.1s',
                // Active tab overlaps body's top border by 1px → flush connection
                marginBottom:  isActive ? -1 : 0,
              }}
            >
              {folder.label}
              <span style={{
                fontSize:    8,
                color:       'var(--text-dim)',
                marginLeft:  6,
                fontWeight:  400,
                letterSpacing: 0,
              }}>
                {n} project{n !== 1 ? 's' : ''}
              </span>
            </button>
          )
        })}
      </div>

      {/* ── Folder body ────────────────────────────────────────────────────── */}
      {activeItem && (
        <div style={{
          background:   'var(--surface-0)',
          border:       '0.5px solid var(--surface-3)',
          borderRadius: '0 3px 3px 3px',
          padding:      16,
          minHeight:    120,
          position:     'relative',
          zIndex:       1,
        }}>
          {/* Header row */}
          <div style={{
            display:        'flex',
            alignItems:     'center',
            justifyContent: 'space-between',
            marginBottom:   12,
          }}>
            <p style={{
              fontSize:      8,
              textTransform: 'uppercase',
              letterSpacing: '0.14em',
              color:         'var(--text-muted)',
              margin:        0,
              fontFamily:    'inherit',
            }}>
              {activeItem.label} · {activeItem.projects.length} project{activeItem.projects.length !== 1 ? 's' : ''}
            </p>

            {role !== 'photographer' && onNewProject && (
              <button
                onClick={onNewProject}
                style={{
                  background:   'var(--accent)',
                  color:        '#fff',
                  fontSize:     10,
                  padding:      '5px 12px',
                  borderRadius: 2,
                  border:       'none',
                  fontWeight:   500,
                  cursor:       'pointer',
                  fontFamily:   'inherit',
                  letterSpacing: '0.02em',
                }}
              >
                + New project
              </button>
            )}
          </div>

          {/* Project grid */}
          {activeItem.projects.length > 0 ? (
            <div style={{
              display:              'grid',
              gridTemplateColumns:  'repeat(4, minmax(0, 1fr))',
              gap:                  8,
            }}>
              {activeItem.projects.map((project) => (
                <ProjectCard key={project.id} project={project} />
              ))}
            </div>
          ) : (
            <p style={{ fontSize: 12, color: 'var(--text-muted)', textAlign: 'center', paddingTop: 24, margin: 0 }}>
              No projects in this group.
            </p>
          )}
        </div>
      )}

      {/* Mobile scroll styles */}
      <style>{`
        @media (max-width: 767px) {
          .folder-tab-row {
            overflow-x: auto;
            flex-wrap: nowrap;
          }
        }
      `}</style>
    </div>
  )
}
