import type { ReactNode } from 'react'

/** The one empty-state treatment (every surface hand-rolled its own). */
export default function EmptyState({
  icon,
  title,
  hint,
  action,
  className = 'py-20',
}: {
  icon?: ReactNode
  title: string
  hint?: string
  action?: ReactNode
  className?: string
}) {
  return (
    <div
      className={`flex flex-col items-center justify-center text-center border border-dashed rounded-lg px-6 ${className}`}
      style={{ borderColor: 'var(--surface-3)' }}
    >
      {icon && <div className="mb-3" style={{ color: 'var(--text-dim)' }}>{icon}</div>}
      <p className="text-base font-medium" style={{ color: 'var(--text-secondary)' }}>{title}</p>
      {hint && <p className="text-sm mt-1 max-w-sm" style={{ color: 'var(--text-muted)' }}>{hint}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}
