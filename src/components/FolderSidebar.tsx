'use client'

import { useState, useRef, useEffect } from 'react'
import { FolderOpen, Folder as FolderIcon, Plus, Pencil, Trash2, Check, X, Files } from 'lucide-react'
import clsx from 'clsx'
import type { Folder } from '@/types'

interface Props {
  folders: Folder[]
  /** file counts per folder id */
  folderCounts: Record<string, number>
  totalCount: number
  /** null = "All files" is active */
  activeFolderId: string | null
  onSelect: (id: string | null) => void
  onCreateFolder: (name: string) => Promise<void>
  onRenameFolder: (id: string, name: string) => Promise<void>
  onDeleteFolder: (id: string) => Promise<void>
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
}: Props) {
  const [creating, setCreating]       = useState(false)
  const [createValue, setCreateValue] = useState('')
  const [renamingId, setRenamingId]   = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const [busy, setBusy]               = useState(false)

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

  return (
    <aside className="w-44 shrink-0 flex flex-col gap-0.5">
      {/* All files */}
      <button
        onClick={() => onSelect(null)}
        className={clsx(
          'flex items-center gap-2.5 w-full text-left px-3 py-2 rounded-lg text-sm transition-colors',
          activeFolderId === null
            ? 'bg-white/8 text-white'
            : 'text-[#666] hover:text-[#999] hover:bg-white/4'
        )}
      >
        <Files size={14} className="shrink-0" />
        <span className="flex-1 truncate">All files</span>
        <span className="text-xs tabular-nums text-[#444]">{totalCount}</span>
      </button>

      {/* Folders */}
      {folders.map((folder) => {
        const isActive  = activeFolderId === folder.id
        const isRenaming = renamingId === folder.id
        const count     = folderCounts[folder.id] ?? 0

        return (
          <div key={folder.id} className="group relative">
            {isRenaming ? (
              <div className="flex items-center gap-1 px-2 py-1">
                <input
                  ref={renameInputRef}
                  value={renameValue}
                  onChange={(e) => setRenameValue(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter')  submitRename(folder.id)
                    if (e.key === 'Escape') setRenamingId(null)
                  }}
                  className="flex-1 min-w-0 bg-surface-0 border border-[#333] text-white text-xs px-2 py-1 rounded focus:outline-none"
                />
                <button
                  onClick={() => submitRename(folder.id)}
                  disabled={busy}
                  className="text-emerald-400 hover:text-emerald-300 disabled:opacity-40 transition-colors"
                  aria-label="Confirm rename"
                >
                  <Check size={12} />
                </button>
                <button
                  onClick={() => setRenamingId(null)}
                  className="text-[#555] hover:text-[#999] transition-colors"
                  aria-label="Cancel rename"
                >
                  <X size={12} />
                </button>
              </div>
            ) : (
              <button
                onClick={() => onSelect(folder.id)}
                className={clsx(
                  'flex items-center gap-2.5 w-full text-left px-3 py-2 rounded-lg text-sm transition-colors',
                  isActive
                    ? 'bg-white/8 text-white'
                    : 'text-[#666] hover:text-[#999] hover:bg-white/4'
                )}
              >
                {isActive
                  ? <FolderOpen size={14} className="shrink-0" />
                  : <FolderIcon size={14} className="shrink-0" />}
                <span className="flex-1 truncate">{folder.name}</span>
                <span className="text-xs tabular-nums text-[#444]">{count}</span>
              </button>
            )}

            {/* Hover actions (only visible when not renaming) */}
            {!isRenaming && (
              <div className="absolute right-1 top-1/2 -translate-y-1/2 flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity bg-surface-0 rounded px-0.5">
                <button
                  onClick={(e) => { e.stopPropagation(); startRename(folder) }}
                  className="p-1 text-[#444] hover:text-white transition-colors"
                  aria-label="Rename folder"
                >
                  <Pencil size={10} />
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); handleDelete(folder.id) }}
                  disabled={busy}
                  className="p-1 text-[#444] hover:text-red-400 transition-colors disabled:opacity-40"
                  aria-label="Delete folder"
                >
                  <Trash2 size={10} />
                </button>
              </div>
            )}
          </div>
        )
      })}

      {/* Unfiled virtual folder */}
      {unfiledCount > 0 && (
        <button
          onClick={() => onSelect('__unfiled__')}
          className={clsx(
            'flex items-center gap-2.5 w-full text-left px-3 py-2 rounded-lg text-sm transition-colors',
            activeFolderId === '__unfiled__'
              ? 'bg-white/8 text-white'
              : 'text-[#555] hover:text-[#777] hover:bg-white/4'
          )}
        >
          <FolderIcon size={14} className="shrink-0 text-[#444]" />
          <span className="flex-1 truncate italic">Unfiled</span>
          <span className="text-xs tabular-nums text-[#444]">{unfiledCount}</span>
        </button>
      )}

      {/* Divider */}
      <div className="border-t border-[#1a1a1a] my-1" />

      {/* Create folder */}
      {creating ? (
        <div className="flex items-center gap-1 px-2 py-1">
          <input
            ref={createInputRef}
            value={createValue}
            onChange={(e) => setCreateValue(e.target.value)}
            placeholder="Folder name…"
            onKeyDown={(e) => {
              if (e.key === 'Enter')  submitCreate()
              if (e.key === 'Escape') { setCreating(false); setCreateValue('') }
            }}
            className="flex-1 min-w-0 bg-surface-0 border border-[#333] text-white text-xs px-2 py-1 rounded placeholder:text-[#444] focus:outline-none"
          />
          <button
            onClick={submitCreate}
            disabled={busy || !createValue.trim()}
            className="text-emerald-400 hover:text-emerald-300 disabled:opacity-40 transition-colors"
            aria-label="Create"
          >
            <Check size={12} />
          </button>
          <button
            onClick={() => { setCreating(false); setCreateValue('') }}
            className="text-[#555] hover:text-[#999] transition-colors"
            aria-label="Cancel"
          >
            <X size={12} />
          </button>
        </div>
      ) : (
        <button
          onClick={() => setCreating(true)}
          className="flex items-center gap-2 px-3 py-2 text-xs text-[#444] hover:text-[#888] transition-colors w-full text-left rounded-lg hover:bg-white/4"
        >
          <Plus size={12} />
          New folder
        </button>
      )}
    </aside>
  )
}
