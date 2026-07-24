/**
 * The 12-colour palette — MUST match the enum in the tag API and migration
 * 016_dominant_colours. Single source of truth for every colour-filter UI
 * (the old per-file copies had drifted: one fork was missing four colours).
 */
export const COLOUR_SWATCHES: { name: string; bg: string; ring: string }[] = [
  { name: 'red',    bg: '#ef4444', ring: '#f87171' },
  { name: 'orange', bg: '#f97316', ring: '#fb923c' },
  { name: 'yellow', bg: '#eab308', ring: '#fbbf24' },
  { name: 'green',  bg: '#22c55e', ring: '#4ade80' },
  { name: 'teal',   bg: '#14b8a6', ring: '#2dd4bf' },
  { name: 'blue',   bg: '#3b82f6', ring: '#60a5fa' },
  { name: 'purple', bg: '#a855f7', ring: '#c084fc' },
  { name: 'pink',   bg: '#ec4899', ring: '#f472b6' },
  { name: 'white',  bg: '#e5e7eb', ring: '#f3f4f6' },
  { name: 'black',  bg: '#1f2937', ring: '#374151' },
  { name: 'grey',   bg: '#6b7280', ring: '#9ca3af' },
  { name: 'brown',  bg: '#92400e', ring: '#b45309' },
]
