'use client'

import { useState, useRef, useEffect } from 'react'
import { FolderOpen, Folder as FolderIcon, Plus, Pencil, Trash2, Check, X, Files } from 'lucide-react'
import type { Folder } from '@/types'

interface Props {
  folders: Folder[]
  folderCounts: Record<string, number>
  totalCount: number
  activeFolderId: string | null
  onSelect: (id: string | null) => void
  onCreateFolder: (name: string) => Promise<void>
  onRenameFolder: (id: string, name: string) => Promise<void>
  onDeleteFolder: (id: string) => Promise<void>
  onFileDrop?: (folderId: string, fileId: string) => void
}

const ITEM_BASE: React.CSSProperties = {
  display:        'flex',
  alignItems:     'center',
  gap:            6,
  width:          '100%',
  textAlign:      'left',
  padding:        '6px 12px',
  fontSize:       11,
  fontFamily:     'inherit',
  background:     'none',
  border:         'none',
  borderBottom:   'var(--border-rule)',
  cursor:         'pointer',
  transition:     'color 0.12s, background 0.12s',
}

function itemStyle(active: boolean): React.CSSProperties {
  return {
    ...ITEM_BASE,
    color:        active ? 'var(--accent)' : 'var(--text-secondary)',
    background:   active ? 'var(--accent-bg)' : 'transparent',
    borderLeft:   active ? '1.5px solid var(--accent)' : '1.5px solid transparent',
  }
}

export default function FolderSidebar({
  folders,
  folderCounts,
  totalCount,
  activeFolderId,
  onSelect,
  onCreateFolder,
  onRenameFolder,
  onDeleteFolder,
  onFileDrop,
}: Props) {
  const [creating, setCreating]       = useState(false)
  const [createValue, setCreateValue] = useState('')
  const [renamingId, setRenamingId]   = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const [busy, setBusy]               = useState(false)
  const [hovered, setHovered]         = useState<string | null>(null)
  const [dragOverId, setDragOverId]   = useState<string | null>(null)

  const createInputRef = useRef<HTMLInputElement>(null)
  const renameInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => { if (creating)   createInputRef.current?.focus() }, [creating])
  useEffect(() => { if (renamingId) renameInputRef.current?.focus()  }, [renamingId])

  async function submitCreate() {
    const name = createValue.trim()
    if (!name || busy) return
    setBusy(true)
    try { await onCreateFolder(name) } finally { setBusy(false) }
    setCreateValue('')
    setCreating(false)
  }

  async function submitRename(id: string) {
    const name = renameValue.trim()
    if (!name || busy) return
    setBusy(true)
    try { await onRenameFolder(id, name) } finally { setBusy(false) }
    setRenamingId(null)
  }

  async function handleDelete(id: string) {
    if (busy) return
    setBusy(true)
    try { await onDeleteFolder(id) } finally { setBusy(false) }
  }

  function startRename(folder: Folder) {
    setRenamingId(folder.id)
    setRenameValue(folder.name)
  }

  const unfiledCount = totalCount - Object.values(folderCounts).reduce((s, n) => s + n, 0)

  const inputStyle: React.CSSProperties = {
    flex: 1, minWidth: 0,
    background: 'var(--surface-1)', border: 'var(--border-rule)',
    borderRadius: 2, color: 'var(--text-primary)',
    fontSize: 11, padding: '3px 6px', fontFamily: 'inherit', outline: 'none',
  }

  const iconBtnStyle = (danger?: boolean): React.CSSProperties => ({
    background: 'none', border: 'none', cursor: 'pointer', padding: 2,
    color: danger ? 'var(--flagged-fg)' : 'var(--text-muted)',
    display: 'flex', alignItems: 'center',
  })

  return (
    <aside style={{ width: 160, flexShrink: 0, display: 'flex', flexDirection: 'column' }}>
      {/* All files */}
      <button
        onClick={() => onSelect(null)}
        style={itemStyle(activeFolderId === null)}
      >
        <Files size={12} style={{ flexShrink: 0 }} />
        <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>All files</span>
        <span style={{ fontSize: 10, color: 'var(--text-dim)', tabularNums: true } as React.CSSProperties}>{totalCount}</span>
      </button>

      {/* Folders */}
      {folders.map((folder) => {
        const isActive   = activeFolderId === folder.id
        const isRenaming = renamingId === folder.id
        const count      = folderCounts[folder.id] ?? 0

        const isDragOver = dragOverId === folder.id

        return (
          <div key={folder.id} style={{ position: 'relative' }}
            onMouseEnter={() => setHovered(folder.id)}
            onMouseLeave={() => setHovered(null)}
            onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; setDragOverId(folder.id) }}
            onDragLeave={() => setDragOverId(null)}
            onDrop={(e) => {
              e.preventDefault()
              setDragOverId(null)
              const fileId = e.dataTransfer.getData('text/plain')
              if (fileId) onFileDrop?.(folder.id, fileId)
            }}
          >
            {isRenaming ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 8px', borderBottom: 'var(--border-rule)' }}>
                <input
                  ref={renameInputRef}
                  value={renameValue}
                  onChange={(e) => setRenameValue(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter')  submitRename(folder.id)
                    if (e.key === 'Escape') setRenamingId(null)
                  }}
                  style={inputStyle}
                />
                <button onClick={() => submitRename(folder.id)} disabled={busy} style={iconBtnStyle()}>
                  <Check size={11} />
                </button>
                <button onClick={() => setRenamingId(null)} style={iconBtnStyle()}>
                  <X size={11} />
                </button>
              </div>
            ) : (
              <button onClick={() => onSelect(folder.id)} style={{
                ...itemStyle(isActive),
                ...(isDragOver ? { background: 'var(--accent-bg)', borderLeft: '1.5px solid var(--accent)', color: 'var(--accent)' } : {}),
              }}>
                {isActive || isDragOver
                  ? <FolderOpen size={12} style={{ flexShrink: 0 }} />
                  : <FolderIcon size={12} style={{ flexShrink: 0 }} />}
                <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{folder.name}</span>
                <span style={{ fontSize: 10, color: 'var(--text-dim)' }}>{count}</span>
              </button>
            )}

            {/* Hover actions */}
            {!isRenaming && hovered === folder.id && (
              <div style={{
                position: 'absolute', right: 4, top: '50%', transform: 'translateY(-50%)',
                display: 'flex', alignItems: 'center', gap: 0,
                background: 'var(--surface-1)', borderRadius: 2, padding: '0 2px',
              }}>
                <button onClick={(e) => { e.stopPropagation(); startRename(folder) }} style={iconBtnStyle()} aria-label="Rename">
                  <Pencil size={10} />
                </button>
                <button onClick={(e) => { e.stopPropagation(); handleDelete(folder.id) }} disabled={busy} style={iconBtnStyle(true)} aria-label="Delete">
                  <Trash2 size={10} />
                </button>
              </div>
            )}
          </div>
        )
      })}

      {/* Unfiled */}
      {unfiledCount > 0 && (
        <button onClick={() => onSelect('__unfiled__')} style={itemStyle(activeFolderId === '__unfiled__')}>
          <FolderIcon size={12} style={{ flexShrink: 0, color: 'var(--text-dim)' }} />
          <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontStyle: 'italic' }}>Unfiled</span>
          <span style={{ fontSize: 10, color: 'var(--text-dim)' }}>{unfiledCount}</span>
        </button>
      )}

      {/* Divider */}
      <div style={{ borderTop: 'var(--border-rule)', margin: '4px 0' }} />

      {/* Create folder */}
      {creating ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 8px' }}>
          <input
            ref={createInputRef}
            value={createValue}
            onChange={(e) => setCreateValue(e.target.value)}
            placeholder="Folder name…"
            onKeyDown={(e) => {
              if (e.key === 'Enter')  submitCreate()
              if (e.key === 'Escape') { setCreating(false); setCreateValue('') }
            }}
            style={{ ...inputStyle, fontSize: 10 }}
          />
          <button onClick={submitCreate} disabled={busy || !createValue.trim()} style={iconBtnStyle()}>
            <Check size={11} />
          </button>
          <button onClick={() => { setCreating(false); setCreateValue('') }} style={iconBtnStyle()}>
            <X size={11} />
          </button>
        </div>
      ) : (
        <button
          onClick={() => setCreating(true)}
          style={{
            display: 'flex', alignItems: 'center', gap: 5,
            padding: '6px 12px', fontSize: 11, fontFamily: 'inherit',
            color: 'var(--text-muted)', background: 'none', border: 'none', cursor: 'pointer',
            width: '100%', textAlign: 'left',
          }}
          onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--accent)')}
          onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--text-muted)')}
        >
          <Plus size={10} />
          New folder
        </button>
      )}
    </aside>
  )
}
