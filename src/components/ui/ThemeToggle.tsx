'use client'

import { useState, useEffect } from 'react'

const SunIcon = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="4"/>
    <line x1="12" y1="2"  x2="12" y2="4"/>
    <line x1="12" y1="20" x2="12" y2="22"/>
    <line x1="4.22"  y1="4.22"  x2="5.64"  y2="5.64"/>
    <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
    <line x1="2"  y1="12" x2="4"  y2="12"/>
    <line x1="20" y1="12" x2="22" y2="12"/>
    <line x1="4.22"  y1="19.78" x2="5.64"  y2="18.36"/>
    <line x1="18.36" y1="5.64"  x2="19.78" y2="4.22"/>
  </svg>
)

const MoonIcon = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
  </svg>
)

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

  const isDark = theme === 'dark'

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
      {/* Sun */}
      <span style={{ color: isDark ? 'var(--text-dim)' : 'var(--text-secondary)', display: 'flex', transition: 'color 0.2s' }}>
        <SunIcon />
      </span>

      {/* Pill toggle */}
      <button
        onClick={toggle}
        aria-label="Toggle theme"
        style={{
          position:   'relative',
          width:      32,
          height:     18,
          borderRadius: 9,
          background: isDark ? 'var(--surface-3)' : 'var(--surface-2)',
          border:     '0.5px solid var(--surface-3)',
          padding:    0,
          cursor:     'pointer',
          flexShrink: 0,
          transition: 'background 0.2s',
        }}
      >
        <span style={{
          position:   'absolute',
          top:        2,
          left:       isDark ? 14 : 2,
          width:      12,
          height:     12,
          borderRadius: '50%',
          background: 'var(--text-secondary)',
          transition: 'left 0.2s',
          display:    'block',
        }} />
      </button>

      {/* Moon */}
      <span style={{ color: isDark ? 'var(--text-secondary)' : 'var(--text-dim)', display: 'flex', transition: 'color 0.2s' }}>
        <MoonIcon />
      </span>
    </div>
  )
}
