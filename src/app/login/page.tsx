'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { Loader2, AlertCircle } from 'lucide-react'

// ─── Logo ─────────────────────────────────────────────────────────────────────

function TrunqLogo() {
  return (
    <div className="flex items-center gap-2.5 justify-center">
      <div className="w-9 h-9 rounded-xl bg-white flex items-center justify-center shrink-0">
        <svg width="20" height="20" viewBox="0 0 14 14" fill="none">
          <rect x="1" y="1" width="5" height="5" rx="1" fill="#0a0a0a" />
          <rect x="8" y="1" width="5" height="5" rx="1" fill="#0a0a0a" />
          <rect x="1" y="8" width="5" height="5" rx="1" fill="#0a0a0a" />
          <rect x="8" y="8" width="5" height="5" rx="1" fill="#0a0a0a" opacity="0.35" />
        </svg>
      </div>
      <span className="text-white font-semibold text-xl tracking-tight">Trunq</span>
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function LoginPage() {
  const router = useRouter()

  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)

    const supabase = createClient()
    const { error: authError } = await supabase.auth.signInWithPassword({ email, password })

    if (authError) {
      setError('Invalid email or password.')
      setLoading(false)
      return
    }

    router.push('/events')
    router.refresh()
  }

  return (
    <div className="min-h-screen bg-[#0a0a0a] flex flex-col items-center justify-center px-4">
      <div className="w-full max-w-[360px]">

        <div className="mb-10">
          <TrunqLogo />
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Email address"
            required
            autoComplete="email"
            className="w-full bg-[#111] border border-[#1f1f1f] rounded-xl px-4 py-3 text-white text-sm placeholder:text-[#333] focus:outline-none focus:border-[#2e2e2e] transition-colors"
          />
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Password"
            required
            autoComplete="current-password"
            className="w-full bg-[#111] border border-[#1f1f1f] rounded-xl px-4 py-3 text-white text-sm placeholder:text-[#333] focus:outline-none focus:border-[#2e2e2e] transition-colors"
          />

          {error && (
            <div className="flex items-center gap-2 text-red-400 text-sm bg-red-500/8 border border-red-500/15 rounded-xl px-3 py-2.5">
              <AlertCircle size={14} className="shrink-0" />
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-white text-black text-sm font-semibold py-3 rounded-xl hover:bg-white/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed mt-1"
          >
            {loading
              ? <Loader2 size={16} className="animate-spin mx-auto" />
              : 'Sign in'}
          </button>
        </form>

        <p className="text-center text-[#3a3a3a] text-xs mt-8">
          Have an invite?{' '}
          <Link href="/signup" className="text-[#666] hover:text-white transition-colors">
            Create account
          </Link>
        </p>

      </div>
    </div>
  )
}
