'use client'

import { createContext, useContext, useState, useEffect } from 'react'

interface Ctx {
  eventMode: boolean
  toggleEventMode: () => void
}

const EventModeContext = createContext<Ctx>({ eventMode: false, toggleEventMode: () => {} })

export function EventModeProvider({ children }: { children: React.ReactNode }) {
  const [eventMode, setEventMode] = useState(false)

  useEffect(() => {
    setEventMode(localStorage.getItem('trunq-event-mode') === '1')
  }, [])

  function toggleEventMode() {
    setEventMode((v) => {
      const next = !v
      localStorage.setItem('trunq-event-mode', next ? '1' : '0')
      return next
    })
  }

  return (
    <EventModeContext.Provider value={{ eventMode, toggleEventMode }}>
      {children}
    </EventModeContext.Provider>
  )
}

export function useEventMode() {
  return useContext(EventModeContext)
}
