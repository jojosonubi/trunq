import type { CSSProperties, ReactNode } from 'react'

interface Props {
  variant: 'label' | 'score' | 'approved' | 'flagged' | 'ghost'
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
    color:        '#555',
    borderColor:  '#3a3a3a',
  },
}

export default function Pill({ variant, children }: Props) {
  return (
    <span style={{ ...BASE, ...VARIANTS[variant] }}>
      {children}
    </span>
  )
}
