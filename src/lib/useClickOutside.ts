'use client'

import { useEffect, type RefObject } from 'react'

/**
 * Close-on-outside-click, shared (was copy-pasted as a mousedown useEffect in
 * 9 components). Pass `enabled` so the listener only exists while open.
 */
export function useClickOutside(
  ref: RefObject<HTMLElement | null>,
  onOutside: () => void,
  enabled = true,
) {
  useEffect(() => {
    if (!enabled) return
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onOutside()
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [ref, onOutside, enabled])
}
