'use client'

import { useState, useEffect } from 'react'

export default function ThemeToggle() {
  const [theme, setTheme] = useState<'light' | 'dark'>('light')

  useEffect(() => {
    const stored = localStorage.getItem('trunq-theme') as 'light' | 'dark' | null
    const resolved = stored ?? 'light'
    setTheme(resolved)
    document.documentElement.setAttribute('data-theme', resolved)
  }, [])

  function toggle() {
    const next = theme === 'light' ? 'dark' : 'light'
    setTheme(next)
    document.documentElement.setAttribute('data-theme', next)
    localStorage.setItem('trunq-theme', next)
  }

  return (
    <button
      onClick={toggle}
      style={{
        background:  'none',
        border:      'none',
        padding:     '4px 6px',
        display:     'flex',
        alignItems:  'center',
        gap:         5,
        fontSize:    11,
        fontFamily:  'inherit',
        color:       'var(--text-secondary)',
        cursor:      'pointer',
      }}
      onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-primary)' }}
      onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-secondary)' }}
    >
      {theme === 'light' ? '○ Day' : '● Night'}
    </button>
  )
}
