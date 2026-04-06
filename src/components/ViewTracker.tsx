'use client'

import { useEffect } from 'react'

export default function ViewTracker({ eventId }: { eventId: string }) {
  useEffect(() => {
    fetch('/api/project-views', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ event_id: eventId }),
    }).catch(() => {/* fire-and-forget */})
  }, [eventId])

  return null
}
