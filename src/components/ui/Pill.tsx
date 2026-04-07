import type { CSSProperties, ReactNode } from 'react'

interface Props {
  variant: 'label' | 'score' | 'approved' | 'flagged' | 'ghost' | 'tag'
  children: ReactNode
}

const BASE: CSSProperties = {
  fontSize:      '8px',
  padding:       '2px 6px',
  borderRadius:  '2px',
  letterSpacing: '0.05em',
  fontFamily:    'inherit',
  display:       'inline-flex',
  alignItems:    'center',
  whiteSpace:    'nowrap',
  borderStyle:   'solid',
  borderWidth:   '0.5px',
  lineHeight:    1,
}

const VARIANTS: Record<Props['variant'], CSSProperties> = {
  label: {
    background:   'var(--label-bg)',
    color:        'var(--label-text)',
    borderColor:  'var(--label-border)',
  },
  score: {
    background:   'var(--label-bg)',
    color:        'var(--label-text)',
    borderColor:  'var(--label-border)',
    fontWeight:   600,
  },
  approved: {
    background:   'var(--approved-bg)',
    color:        'var(--approved-fg)',
    borderColor:  'var(--approved-border)',
  },
  flagged: {
    background:   'var(--flagged-bg)',
    color:        'var(--flagged-fg)',
    borderColor:  'var(--flagged-border)',
  },
  ghost: {
    background:   'transparent',
    color:        'var(--text-secondary)',
    borderColor:  'var(--surface-3)',
  },
  tag: {
    background:    'transparent',
    color:         'var(--text-muted)',
    borderColor:   'var(--surface-3)',
    padding:       '2px 5px',
    letterSpacing: '0.04em',
    borderRadius:  '2px',
  },
}

export default function Pill({ variant, children }: Props) {
  return (
    <span style={{ ...BASE, ...VARIANTS[variant] }}>
      {children}
    </span>
  )
}

// ─── Color-coded score pill ───────────────────────────────────────────────────

export function ScorePill({ score }: { score: number }) {
  const color = score >= 80 ? '#1D9E75'
              : score >= 60 ? '#b8860b'
              : '#c0392b'
  return (
    <span style={{
      ...BASE,
      background:   'var(--label-bg)',
      borderColor:  'var(--label-border)',
      color,
      fontWeight:   600,
    }}>
      {score}
    </span>
  )
}
