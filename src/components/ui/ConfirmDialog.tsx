'use client'

import { useState, type ReactNode } from 'react'
import Modal from '@/components/ui/Modal'
import Button from '@/components/ui/Button'

/**
 * The one destructive-action confirmation (the audit found 4 competing
 * patterns, including several deletes with NO confirmation at all).
 */
export default function ConfirmDialog({
  title,
  body,
  confirmLabel = 'Delete',
  onConfirm,
  onClose,
}: {
  title: string
  body: ReactNode
  confirmLabel?: string
  /** May be async — the confirm button shows a busy state until it resolves. */
  onConfirm: () => void | Promise<void>
  onClose: () => void
}) {
  const [busy, setBusy] = useState(false)

  async function confirm() {
    setBusy(true)
    try {
      await onConfirm()
      onClose()
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal onClose={() => !busy && onClose()} maxWidth="max-w-sm" labelledBy="confirm-title">
      <h2 id="confirm-title" className="text-base font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>
        {title}
      </h2>
      <div className="text-sm leading-relaxed mb-5" style={{ color: 'var(--text-secondary)' }}>
        {body}
      </div>
      <div className="flex gap-3 justify-end">
        <Button variant="ghost" size="sm" onClick={onClose} disabled={busy}>
          Cancel
        </Button>
        <Button variant="danger" size="sm" onClick={confirm} disabled={busy}>
          {busy ? 'Working…' : confirmLabel}
        </Button>
      </div>
    </Modal>
  )
}
