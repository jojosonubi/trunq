'use client'

import { useState, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { LogOut, Settings, ChevronDown } from 'lucide-react'
import type { UserProfile } from '@/lib/auth'

interface Props {
  profile: UserProfile
}

function initials(profile: UserProfile): string {
  if (profile.full_name) {
    const parts = profile.full_name.trim().split(/\s+/)
    return (parts[0][0] + (parts[1]?.[0] ?? '')).toUpperCase()
  }
  return profile.email[0].toUpperCase()
}

const ROLE_COLOURS: Record<string, string> = {
  admin:        'text-amber-400/80 bg-amber-400/8 border-amber-400/20',
  producer:     'text-blue-400/80 bg-blue-400/8 border-blue-400/20',
  photographer: 'text-[#666] bg-white/4 border-white/8',
}

export default function UserMenu({ profile }: Props) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function onDown(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setOpen(false)
    }
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  async function handleLogout() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  const displayName = profile.full_name ?? profile.email.split('@')[0]
  const avatar      = initials(profile)

  return (
    <div ref={menuRef} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-white/5 transition-colors"
        aria-label="Account menu"
      >
        <div className="w-7 h-7 rounded-full bg-white/10 border border-white/15 flex items-center justify-center text-white text-[11px] font-semibold shrink-0 select-none">
          {avatar}
        </div>
        <span className="text-[#666] text-xs hidden sm:block max-w-[120px] truncate">
          {displayName}
        </span>
        <ChevronDown size={12} className="text-[#444]" />
      </button>

      {open && (
        <div className="absolute top-full right-0 mt-2 w-56 bg-[#141414] border border-[#222] rounded-xl shadow-2xl py-1 z-50">
          {/* Profile info */}
          <div className="px-3.5 py-3 border-b border-[#1a1a1a]">
            <p className="text-white text-xs font-medium truncate">{profile.full_name ?? displayName}</p>
            <p className="text-[#555] text-[11px] mt-0.5 truncate">{profile.email}</p>
            <span className={`inline-block mt-2 text-[10px] px-2 py-0.5 rounded-full border font-medium capitalize ${ROLE_COLOURS[profile.role] ?? ROLE_COLOURS.photographer}`}>
              {profile.role}
            </span>
          </div>

          <Link
            href="/settings"
            onClick={() => setOpen(false)}
            className="flex items-center gap-2.5 w-full px-3.5 py-2.5 text-sm text-[#888] hover:text-white hover:bg-white/4 transition-colors"
          >
            <Settings size={13} className="shrink-0" />
            Settings
          </Link>

          <button
            onClick={handleLogout}
            className="flex items-center gap-2.5 w-full text-left px-3.5 py-2.5 text-sm text-[#888] hover:text-white hover:bg-white/4 transition-colors"
          >
            <LogOut size={13} className="shrink-0" />
            Sign out
          </button>
        </div>
      )}
    </div>
  )
}
