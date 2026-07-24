'use client'

import { useState, useRef, useEffect } from 'react'
import { Copy, Check } from 'lucide-react'

/** The one copy-to-clipboard button (was hand-rolled 7 times with drifting
 *  timings, icons and colors). */
export default function CopyButton({
  value,
  label = 'Copy',
  size = 13,
  className = '',
}: {
  value: string
  label?: string
  size?: number
  className?: string
}) {
  const [copied, setCopied] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current) }, [])

  async function copy() {
    await navigator.clipboard.writeText(value)
    setCopied(true)
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => setCopied(false), 1800)
  }

  return (
    <button
      onClick={copy}
      className={`inline-flex items-center gap-1.5 text-sm transition-colors hover:!text-[var(--text-primary)] ${className}`}
      style={{ color: copied ? 'var(--approved-fg)' : 'var(--text-secondary)' }}
      aria-label={`${label} to clipboard`}
    >
      {copied ? <Check size={size} /> : <Copy size={size} />}
      {copied ? 'Copied' : label}
    </button>
  )
}
