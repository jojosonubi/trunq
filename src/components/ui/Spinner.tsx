import { Loader2 } from 'lucide-react'

/** The one loading spinner (replaces 37 hand-assembled Loader2 instances). */
export default function Spinner({ size = 16, className = '' }: { size?: number; className?: string }) {
  return (
    <Loader2
      size={size}
      className={`animate-spin ${className}`}
      style={{ color: 'var(--text-muted)' }}
      aria-label="Loading"
    />
  )
}

/** Centered block spinner for section/page loading areas. */
export function SpinnerBlock({ size = 20, className = 'py-16' }: { size?: number; className?: string }) {
  return (
    <div className={`flex items-center justify-center ${className}`} role="status">
      <Spinner size={size} />
    </div>
  )
}
