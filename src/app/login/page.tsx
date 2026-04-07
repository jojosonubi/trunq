'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { Loader2, AlertCircle } from 'lucide-react'

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
    const { data: authData, error: authError } = await supabase.auth.signInWithPassword({ email, password })

    if (authError) {
      setError('Invalid email or password.')
      setLoading(false)
      return
    }

    // Audit log — fire-and-forget; session cookie is set so the API can auth the request
    fetch('/api/audit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action:     'user_login',
        entityType: 'user',
        entityId:   authData.user?.id ?? null,
        metadata:   { email },
      }),
    }).catch(() => {})

    router.push('/projects')
    router.refresh()
  }

  return (
    <div className="min-h-screen bg-surface-0 flex flex-col items-center justify-center px-4">
      <div className="w-full max-w-[360px]">

        <div style={{ marginBottom: 40, textAlign: 'center' }}>
          <span style={{ fontSize: 18, fontWeight: 700, letterSpacing: '0.18em', color: 'var(--text-primary)', fontFamily: 'inherit' }}>
            TRUNQ
          </span>
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Email address"
            required
            autoComplete="email"
            style={{
              width: '100%', background: 'var(--surface-1)', border: 'var(--border-rule)',
              borderRadius: 2, padding: '10px 12px', fontSize: 13,
              color: 'var(--text-primary)', fontFamily: 'inherit',
              outline: 'none', boxSizing: 'border-box',
            }}
          />
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Password"
            required
            autoComplete="current-password"
            style={{
              width: '100%', background: 'var(--surface-1)', border: 'var(--border-rule)',
              borderRadius: 2, padding: '10px 12px', fontSize: 13,
              color: 'var(--text-primary)', fontFamily: 'inherit',
              outline: 'none', boxSizing: 'border-box',
            }}
          />

          {error && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: 6,
              color: 'var(--flagged-fg)', fontSize: 12,
              background: 'var(--flagged-bg)', border: '0.5px solid var(--flagged-border)',
              borderRadius: 2, padding: '8px 10px',
            }}>
              <AlertCircle size={13} style={{ flexShrink: 0 }} />
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            style={{
              width: '100%', background: 'var(--accent)', color: '#fff',
              fontSize: 13, fontWeight: 500, padding: '10px 12px',
              borderRadius: 2, border: 'none', cursor: 'pointer',
              fontFamily: 'inherit', marginTop: 4,
              opacity: loading ? 0.5 : 1,
            }}
          >
            {loading
              ? <Loader2 size={16} style={{ display: 'block', margin: '0 auto', animation: 'spin 1s linear infinite' }} />
              : 'Sign in'}
          </button>
        </form>

        <p style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: 11, marginTop: 32 }}>
          Have an invite?{' '}
          <Link href="/signup" style={{ color: 'var(--text-secondary)', textDecoration: 'none' }}>
            Create account
          </Link>
        </p>

      </div>
    </div>
  )
}
