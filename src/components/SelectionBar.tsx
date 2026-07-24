'use client'

import type { ReactNode } from 'react'

/**
 * THE app-standard selection UI: photos are selected inline on the existing
 * grid (no layout switch, no grid resize) with this floating footer bar.
 * `children` holds the primary action(s) — e.g. "Add to collection", a
 * folder picker + Move, etc.
 */
export default function SelectionBar({
  count,
  emptyLabel = 'Click photos to select',
  hasUnselected,
  selectAllLabel,
  onSelectAll,
  onClear,
  onCancel,
  children,
}: {
  count: number
  emptyLabel?: string
  hasUnselected: boolean
  selectAllLabel: string
  onSelectAll: () => void
  onClear?: () => void
  onCancel?: () => void
  children?: ReactNode
}) {
  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 flex items-center gap-4 bg-[#111] border border-[#2a2a2a] rounded-full pl-5 pr-2 py-2 shadow-2xl">
      <span className="text-white text-base font-medium tabular-nums whitespace-nowrap">
        {count === 0 ? emptyLabel : `${count} selected`}
      </span>
      {hasUnselected && (
        <button
          onClick={onSelectAll}
          className="text-sm text-[#888] hover:text-white transition-colors whitespace-nowrap"
        >
          {selectAllLabel}
        </button>
      )}
      {count > 0 && onClear && (
        <button onClick={onClear} className="text-sm text-[#888] hover:text-white transition-colors">
          Clear
        </button>
      )}
      {onCancel && (
        <button onClick={onCancel} className="text-sm text-[#888] hover:text-white transition-colors">
          Cancel
        </button>
      )}
      {children}
    </div>
  )
}
