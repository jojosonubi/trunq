'use client'

import { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import { MoreHorizontal, Pencil, ImagePlus, Trash2 } from 'lucide-react'
import Pill from '@/components/ui/Pill'
import EventCoverPicker from '@/components/EventCoverPicker'

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

// ─── Menu item style ──────────────────────────────────────────────────────────

const MENU_ITEM: React.CSSProperties = {
  display:     'flex',
  alignItems:  'center',
  gap:         8,
  width:       '100%',
  textAlign:   'left',
  fontSize:    11,
  padding:     '8px 12px',
  color:       'var(--text-secondary)',
  background:  'transparent',
  border:      'none',
  cursor:      'pointer',
  fontFamily:  'inherit',
  whiteSpace:  'nowrap',
}

// ─── Project card ─────────────────────────────────────────────────────────────

function ProjectCard({ project }: { project: Project }) {
  const router   = useRouter()
  const menuRef  = useRef<HTMLDivElement>(null)

  const [hover,           setHover]           = useState(false)
  const [menuOpen,        setMenuOpen]        = useState(false)
  const [renaming,        setRenaming]        = useState(false)
  const [renameDraft,     setRenameDraft]     = useState('')
  const [saving,          setSaving]          = useState(false)
  const [confirmDelete,   setConfirmDelete]   = useState(false)
  const [deleting,        setDeleting]        = useState(false)
  const [coverPickerOpen, setCoverPickerOpen] = useState(false)

  // Close menu on click outside
  useEffect(() => {
    if (!menuOpen) return
    function onDown(e: MouseEvent) {
      if (!menuRef.current?.contains(e.target as Node)) setMenuOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [menuOpen])

  function startRename() {
    setMenuOpen(false)
    setRenameDraft(project.name)
    setRenaming(true)
  }

  async function commitRename() {
    const name = renameDraft.trim()
    if (!name || name === project.name) { setRenaming(false); return }
    setSaving(true)
    try {
      await fetch(`/api/projects/${project.id}`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ name }),
      })
      router.refresh()
    } finally {
      setSaving(false)
      setRenaming(false)
    }
  }

  async function handleDelete() {
    setDeleting(true)
    try {
      await fetch(`/api/projects/${project.id}`, { method: 'DELETE' })
      router.refresh()
      setConfirmDelete(false)
    } finally {
      setDeleting(false)
    }
  }

  const blocked = menuOpen || renaming || confirmDelete || coverPickerOpen

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => { if (blocked) return; router.push(`/projects/${project.id}`) }}
      onKeyDown={(e) => {
        if (blocked) return
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); router.push(`/projects/${project.id}`) }
      }}
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
            src={project.cover_image_url}
            alt={project.name}
            fill
            sizes="(max-width: 768px) 50vw, 25vw"
            style={{ objectFit: 'cover' }}
            unoptimized
          />
        ) : (
          <div style={{ width: '100%', height: '100%', background: 'var(--surface-2)' }} />
        )}

        {/* Three-dot menu button */}
        <div ref={menuRef} style={{ position: 'absolute', top: 6, right: 6, zIndex: 10 }}>
          <button
            onClick={(e) => { e.preventDefault(); e.stopPropagation(); setMenuOpen((v) => !v) }}
            style={{
              background:   'rgba(0,0,0,0.5)',
              color:        '#fff',
              fontSize:     12,
              padding:      '2px 6px',
              borderRadius: 2,
              border:       'none',
              cursor:       'pointer',
              opacity:      hover || menuOpen ? 1 : 0,
              transition:   'opacity 0.15s',
              fontFamily:   'inherit',
              lineHeight:   1,
              display:      'inline-flex',
              alignItems:   'center',
            }}
            aria-label="Project options"
          >
            <MoreHorizontal size={13} />
          </button>

          {menuOpen && (
            <div style={{
              position:     'absolute',
              top:          28,
              right:        0,
              background:   'var(--surface-0)',
              border:       'var(--border-rule)',
              borderRadius: 2,
              minWidth:     160,
              zIndex:       20,
              overflow:     'hidden',
            }}>
              <button
                onClick={(e) => { e.stopPropagation(); startRename() }}
                style={MENU_ITEM}
                onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--surface-1)'; e.currentTarget.style.color = 'var(--text-primary)' }}
                onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent';       e.currentTarget.style.color = 'var(--text-secondary)' }}
              >
                <Pencil size={11} /> Rename project
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); setMenuOpen(false); setCoverPickerOpen(true) }}
                style={MENU_ITEM}
                onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--surface-1)'; e.currentTarget.style.color = 'var(--text-primary)' }}
                onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent';       e.currentTarget.style.color = 'var(--text-secondary)' }}
              >
                <ImagePlus size={11} /> Change cover image
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); setMenuOpen(false); setConfirmDelete(true) }}
                style={MENU_ITEM}
                onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--surface-1)'; e.currentTarget.style.color = 'var(--flagged-fg)' }}
                onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent';       e.currentTarget.style.color = 'var(--text-secondary)' }}
              >
                <Trash2 size={11} /> Delete project
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Metadata */}
      <div style={{ padding: '8px 10px', borderTop: '0.5px solid var(--surface-3)' }}>
        {renaming ? (
          <input
            autoFocus
            value={renameDraft}
            onChange={(e) => setRenameDraft(e.target.value)}
            onKeyDown={(e) => {
              e.stopPropagation()
              if (e.key === 'Enter')  { e.preventDefault(); commitRename() }
              if (e.key === 'Escape') setRenaming(false)
            }}
            onClick={(e) => e.stopPropagation()}
            onBlur={commitRename}
            disabled={saving}
            style={{
              width:        '100%',
              background:   'var(--surface-0)',
              border:       '0.5px solid var(--accent)',
              borderRadius: 2,
              padding:      '3px 6px',
              fontSize:     11,
              color:        'var(--text-primary)',
              fontFamily:   'inherit',
              outline:      'none',
              boxSizing:    'border-box',
              opacity:      saving ? 0.6 : 1,
            }}
          />
        ) : (
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
        )}
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

      {/* Cover image picker */}
      {coverPickerOpen && (
        <EventCoverPicker eventId={project.id} onClose={() => setCoverPickerOpen(false)} />
      )}

      {/* Delete confirm dialog */}
      {confirmDelete && typeof window !== 'undefined' && createPortal(
        <div
          onClick={() => { if (!deleting) setConfirmDelete(false) }}
          style={{
            position:       'fixed',
            inset:          0,
            zIndex:         50,
            display:        'flex',
            alignItems:     'center',
            justifyContent: 'center',
            background:     'rgba(0,0,0,0.7)',
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background:   'var(--surface-0)',
              border:       'var(--border-rule)',
              borderRadius: 4,
              padding:      24,
              maxWidth:     360,
              width:        '100%',
              margin:       '0 16px',
            }}
          >
            <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', margin: '0 0 8px' }}>
              Move to trash?
            </p>
            <p style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.5, margin: '0 0 20px' }}>
              <strong style={{ color: 'var(--text-primary)' }}>{project.name}</strong> will be soft-deleted. You can restore it from Settings within 30 days.
            </p>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button
                onClick={() => setConfirmDelete(false)}
                disabled={deleting}
                style={{
                  padding:      '6px 14px',
                  fontSize:     12,
                  background:   'transparent',
                  border:       'var(--border-rule)',
                  borderRadius: 3,
                  color:        'var(--text-secondary)',
                  cursor:       'pointer',
                  fontFamily:   'inherit',
                  opacity:      deleting ? 0.4 : 1,
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                disabled={deleting}
                style={{
                  padding:      '6px 14px',
                  fontSize:     12,
                  fontWeight:   500,
                  background:   'var(--flagged-bg)',
                  border:       '0.5px solid var(--flagged-border)',
                  borderRadius: 3,
                  color:        'var(--flagged-fg)',
                  cursor:       deleting ? 'not-allowed' : 'pointer',
                  fontFamily:   'inherit',
                  opacity:      deleting ? 0.6 : 1,
                }}
              >
                {deleting ? 'Deleting…' : 'Move to trash'}
              </button>
            </div>
          </div>
        </div>,
        document.body,
      )}
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
