'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { Loader2, AlertCircle, Check } from 'lucide-react'

interface Props {
  initialCode: string
}

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

// ─── SignupForm ───────────────────────────────────────────────────────────────

export default function SignupForm({ initialCode }: Props) {
  const router = useRouter()

  const [code, setCode]           = useState(initialCode)
  const [fullName, setFullName]   = useState('')
  const [email, setEmail]         = useState('')
  const [password, setPassword]   = useState('')
  const [loading, setLoading]     = useState(false)
  const [error, setError]         = useState<string | null>(null)

  // Invite validation state
  type CodeState = { valid: boolean; role?: string } | null
  const [codeState, setCodeState]       = useState<CodeState>(null)
  const [validating, setValidating]     = useState(false)
  const debounceRef = useState<ReturnType<typeof setTimeout> | null>(null)

  async function validateCode(c: string) {
    const trimmed = c.trim()
    if (!trimmed) { setCodeState(null); return }
    setValidating(true)
    try {
      const res  = await fetch(`/api/invites/${encodeURIComponent(trimmed)}`)
      const data = await res.json()
      setCodeState(data)
    } catch {
      setCodeState({ valid: false })
    } finally {
      setValidating(false)
    }
  }

  // Validate on mount if pre-filled
  useEffect(() => {
    if (initialCode) validateCode(initialCode)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  function handleCodeChange(val: string) {
    setCode(val)
    if (debounceRef[0]) clearTimeout(debounceRef[0])
    debounceRef[1](setTimeout(() => validateCode(val), 500) as unknown as null)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!codeState?.valid) { setError('Please enter a valid invite code.'); return }
    setError(null)
    setLoading(true)

    const supabase = createClient()
    const { error: signUpError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name:   fullName.trim() || null,
          invite_code: code.trim(),
        },
      },
    })

    if (signUpError) {
      setError(signUpError.message)
      setLoading(false)
      return
    }

    router.push('/events')
    router.refresh()
  }

  const roleLabel = codeState?.valid && codeState.role
    ? codeState.role.charAt(0).toUpperCase() + codeState.role.slice(1)
    : null

  return (
    <div className="min-h-screen bg-[#0a0a0a] flex flex-col items-center justify-center px-4">
      <div className="w-full max-w-[360px]">

        <div className="mb-10">
          <TrunqLogo />
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          {/* Invite code */}
          <div className="relative">
            <input
              type="text"
              value={code}
              onChange={(e) => handleCodeChange(e.target.value)}
              placeholder="Invite code"
              required
              className="w-full bg-[#111] border border-[#1f1f1f] rounded-xl px-4 py-3 text-white text-sm placeholder:text-[#333] focus:outline-none focus:border-[#2e2e2e] transition-colors pr-28"
            />
            <div className="absolute right-3.5 top-1/2 -translate-y-1/2 flex items-center gap-1">
              {validating && (
                <Loader2 size={12} className="text-[#444] animate-spin" />
              )}
              {!validating && codeState?.valid && (
                <>
                  <Check size={12} className="text-emerald-400" />
                  <span className="text-emerald-400 text-[11px] font-medium">{roleLabel}</span>
                </>
              )}
              {!validating && codeState && !codeState.valid && (
                <span className="text-red-400 text-[11px]">Invalid</span>
              )}
            </div>
          </div>

          <input
            type="text"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            placeholder="Full name"
            required
            autoComplete="name"
            className="w-full bg-[#111] border border-[#1f1f1f] rounded-xl px-4 py-3 text-white text-sm placeholder:text-[#333] focus:outline-none focus:border-[#2e2e2e] transition-colors"
          />
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
            placeholder="Password (min 8 characters)"
            required
            minLength={8}
            autoComplete="new-password"
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
            disabled={loading || !codeState?.valid}
            className="w-full bg-white text-black text-sm font-semibold py-3 rounded-xl hover:bg-white/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed mt-1"
          >
            {loading
              ? <Loader2 size={16} className="animate-spin mx-auto" />
              : 'Create account'}
          </button>
        </form>

        <p className="text-center text-[#3a3a3a] text-xs mt-8">
          Already have an account?{' '}
          <Link href="/login" className="text-[#666] hover:text-white transition-colors">
            Sign in
          </Link>
        </p>

      </div>
    </div>
  )
}
