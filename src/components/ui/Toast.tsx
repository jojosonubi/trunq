'use client'

import { useEffect, useState } from 'react'
import { CheckCircle2, AlertCircle, Info, X } from 'lucide-react'

/**
 * App-wide toast system — the feedback layer the audit found missing
 * entirely (actions failed silently into empty catch blocks).
 *
 * Usage anywhere (no hook needed):  toast('Saved')  ·  toast('Failed to
 * delete', 'error'). <ToastHost/> is mounted once in the root layout.
 */
export type ToastKind = 'success' | 'error' | 'info'

interface ToastItem {
  id: number
  message: string
  kind: ToastKind
}

type Listener = (t: ToastItem) => void
let listener: Listener | null = null
let nextId = 1

export function toast(message: string, kind: ToastKind = 'info') {
  listener?.({ id: nextId++, message, kind })
}

const KIND_STYLE: Record<ToastKind, { icon: typeof Info; color: string }> = {
  success: { icon: CheckCircle2, color: 'var(--approved-fg)' },
  error:   { icon: AlertCircle,  color: 'var(--flagged-fg)'  },
  info:    { icon: Info,         color: 'var(--text-secondary)' },
}

const AUTO_DISMISS_MS = 3800

export function ToastHost() {
  const [items, setItems] = useState<ToastItem[]>([])

  useEffect(() => {
    listener = (t) => {
      setItems((prev) => [...prev.slice(-3), t]) // max 4 on screen
      setTimeout(() => setItems((prev) => prev.filter((i) => i.id !== t.id)), AUTO_DISMISS_MS)
    }
    return () => { listener = null }
  }, [])

  if (items.length === 0) return null

  return (
    <div
      className="fixed bottom-6 right-6 z-[60] flex flex-col gap-2 items-end"
      role="status"
      aria-live="polite"
    >
      {items.map((t) => {
        const { icon: Icon, color } = KIND_STYLE[t.kind]
        return (
          <div
            key={t.id}
            className="flex items-center gap-2.5 pl-3.5 pr-2 py-2.5 rounded-lg shadow-2xl max-w-sm"
            style={{ background: 'var(--surface-1)', border: 'var(--border-rule)' }}
          >
            <Icon size={15} style={{ color, flexShrink: 0 }} />
            <span className="text-sm" style={{ color: 'var(--text-primary)' }}>{t.message}</span>
            <button
              onClick={() => setItems((prev) => prev.filter((i) => i.id !== t.id))}
              aria-label="Dismiss"
              className="ml-1 w-6 h-6 flex items-center justify-center rounded hover:opacity-70 shrink-0"
              style={{ color: 'var(--text-muted)' }}
            >
              <X size={13} />
            </button>
          </div>
        )
      })}
    </div>
  )
}
