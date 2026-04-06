'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  ArrowLeft, User, Users, HardDrive, Trash2, AlertTriangle,
  Plus, Copy, Check, Clock, Mail, RefreshCw,
  RotateCcw, Calendar, ImageIcon, CheckCircle2, AlertCircle,
  Pencil, Loader2, Eye, EyeOff, Camera, ShieldCheck, History,
  XCircle, Filter,
} from 'lucide-react'
import UserMenu from '@/components/UserMenu'
import { createClient } from '@/lib/supabase/client'
import type { UserProfile } from '@/lib/auth'
import type { BackupStats } from '@/app/api/backup/route'
import type { AuditLog, Event, MediaFile } from '@/types'

// ─── Types ────────────────────────────────────────────────────────────────────

interface Invite {
  id: string; code: string; role: string
  used_by: string | null; used_at: string | null
  expires_at: string; created_at: string
}

interface Photographer {
  id: string; name: string; created_at: string
  photoCount: number; eventCount: number
}

interface VerifyResult {
  checked:    number
  valid:      number
  invalid:    number
  mismatches: { id: string; filename: string; valid: boolean; expected?: string; actual?: string; error?: string }[]
}

interface Props {
  currentProfile: UserProfile
  users?:         UserProfile[]
  invites?:       Invite[]
  backupStats?:   BackupStats | null
  photographers?: Photographer[]
  trashedEvents?: Event[]
  trashedPhotos?: MediaFile[]
  auditLogs?:     AuditLog[]
}

type SectionId = 'account' | 'team' | 'storage' | 'trash' | 'audit' | 'danger'

const ACTION_LABELS: Record<string, string> = {
  photo_uploaded:              'Photo uploaded',
  photo_viewed:                'Photo viewed',
  photo_downloaded:            'Photo downloaded',
  photo_approved:              'Photo approved',
  photo_rejected:              'Photo rejected',
  photo_held:                  'Photo held',
  photo_pending:               'Photo set to pending',
  photo_restored:              'Photo restored',
  photo_deleted:               'Photo trashed',
  photo_permanently_deleted:   'Photo permanently deleted',
  delivery_portal_created:     'Delivery portal created',
  delivery_portal_accessed:    'Delivery portal accessed',
  user_login:                  'User login',
  event_created:               'Event created',
  event_edited:                'Event edited',
  event_deleted:               'Event trashed',
  event_restored:              'Event restored',
  event_permanently_deleted:   'Event permanently deleted',
  team_member_invited:         'Member invited',
  team_member_removed:         'Member removed',
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}
function isExpired(iso: string) { return new Date(iso) < new Date() }
function daysUntilPurge(deletedAt: string) {
  return Math.max(0, Math.ceil((new Date(deletedAt).getTime() + 30 * 86_400_000 - Date.now()) / 86_400_000))
}
function initials(p: UserProfile) {
  if (p.full_name) {
    const parts = p.full_name.trim().split(/\s+/)
    return (parts[0][0] + (parts[1]?.[0] ?? '')).toUpperCase()
  }
  return p.email[0].toUpperCase()
}

const ROLE_PILL: Record<string, string> = {
  admin:        'text-amber-400 bg-amber-400/8 border-amber-400/20',
  producer:     'text-blue-400 bg-blue-400/8 border-blue-400/20',
  photographer: 'text-[#666] bg-white/4 border-white/10',
}

// ─── Section header ───────────────────────────────────────────────────────────

function SectionHead({ id, icon: Icon, title, subtitle }: { id: string; icon: React.ElementType; title: string; subtitle?: string }) {
  return (
    <div id={id} className="flex items-center gap-3 mb-6 scroll-mt-24">
      <div className="w-8 h-8 rounded-lg bg-[#141414] border border-[#222] flex items-center justify-center shrink-0">
        <Icon size={14} className="text-[#555]" />
      </div>
      <div>
        <h2 className="text-white text-sm font-semibold">{title}</h2>
        {subtitle && <p className="text-[#555] text-xs mt-0.5">{subtitle}</p>}
      </div>
    </div>
  )
}

// ─── Card wrapper ─────────────────────────────────────────────────────────────

function Card({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`bg-[#0f0f0f] border border-[#1a1a1a] rounded-xl ${className}`}>
      {children}
    </div>
  )
}

// ─── SettingsClient ───────────────────────────────────────────────────────────

export default function SettingsClient({
  currentProfile,
  users: initialUsers = [],
  invites: initialInvites = [],
  backupStats,
  photographers = [],
  trashedEvents = [],
  trashedPhotos = [],
  auditLogs = [],
}: Props) {
  const router       = useRouter()
  const isAdmin      = currentProfile.role === 'admin'

  // ── Sidebar active section ────────────────────────────────────────────────
  const [activeSection, setActiveSection] = useState<SectionId>('account')

  function scrollTo(id: SectionId) {
    setActiveSection(id)
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  const SECTIONS: { id: SectionId; label: string; icon: React.ElementType }[] = [
    { id: 'account', label: 'Account',        icon: User         },
    ...(isAdmin ? [
      { id: 'team'    as SectionId, label: 'Team',           icon: Users        },
      { id: 'storage' as SectionId, label: 'Storage & Data', icon: HardDrive    },
      { id: 'trash'   as SectionId, label: 'Trash',          icon: Trash2       },
      { id: 'audit'   as SectionId, label: 'Audit log',      icon: History      },
      { id: 'danger'  as SectionId, label: 'Danger zone',    icon: AlertTriangle},
    ] : []),
  ]

  // ── Account: name ─────────────────────────────────────────────────────────
  const [nameValue,  setNameValue]  = useState(currentProfile.full_name ?? '')
  const [nameSaving, setNameSaving] = useState(false)
  const [nameSaved,  setNameSaved]  = useState(false)

  async function saveName() {
    setNameSaving(true)
    try {
      await fetch('/api/profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ full_name: nameValue.trim() || null }),
      })
      setNameSaved(true)
      setTimeout(() => setNameSaved(false), 2000)
      router.refresh()
    } finally {
      setNameSaving(false)
    }
  }

  // ── Account: password ─────────────────────────────────────────────────────
  const supabase         = createClient()
  const [showPassForm,   setShowPassForm]   = useState(false)
  const [newPass,        setNewPass]        = useState('')
  const [confirmPass,    setConfirmPass]    = useState('')
  const [showNew,        setShowNew]        = useState(false)
  const [showConfirm,    setShowConfirm]    = useState(false)
  const [passError,      setPassError]      = useState('')
  const [passSaving,     setPassSaving]     = useState(false)
  const [passSuccess,    setPassSuccess]    = useState(false)

  async function changePassword() {
    setPassError('')
    if (newPass.length < 6) { setPassError('Password must be at least 6 characters'); return }
    if (newPass !== confirmPass) { setPassError("Passwords don't match"); return }
    setPassSaving(true)
    try {
      const { error } = await supabase.auth.updateUser({ password: newPass })
      if (error) { setPassError(error.message); return }
      setPassSuccess(true)
      setShowPassForm(false)
      setNewPass('')
      setConfirmPass('')
      setTimeout(() => setPassSuccess(false), 3000)
    } finally {
      setPassSaving(false)
    }
  }

  // ── Team: invite ──────────────────────────────────────────────────────────
  const [invites,     setInvites]     = useState<Invite[]>(initialInvites)
  const [newRole,     setNewRole]     = useState<'admin' | 'producer' | 'photographer'>('photographer')
  const [generating,  setGenerating]  = useState(false)
  const [copiedId,    setCopiedId]    = useState<string | null>(null)

  async function generateInvite() {
    setGenerating(true)
    try {
      const res  = await fetch('/api/invites', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: newRole }),
      })
      const json = await res.json()
      if (json.invite) setInvites((prev) => [json.invite, ...prev])
    } finally {
      setGenerating(false)
    }
  }

  async function revokeInvite(code: string) {
    await fetch(`/api/invites/${encodeURIComponent(code)}`, { method: 'DELETE' })
    setInvites((prev) => prev.filter((i) => i.code !== code))
  }

  async function copyInviteLink(invite: Invite) {
    await navigator.clipboard.writeText(`${window.location.origin}/signup?code=${invite.code}`)
    setCopiedId(invite.id)
    setTimeout(() => setCopiedId(null), 2000)
  }

  const activeInvites  = invites.filter((i) => !i.used_at && !isExpired(i.expires_at))
  const usedInvites    = invites.filter((i) => !!i.used_at)
  const expiredInvites = invites.filter((i) => !i.used_at && isExpired(i.expires_at))

  // ── Team: remove member ───────────────────────────────────────────────────
  const [users,        setUsers]       = useState<UserProfile[]>(initialUsers)
  const [removingId,   setRemovingId]  = useState<string | null>(null)

  async function removeMember(id: string) {
    if (!confirm('Remove this team member? They will lose all access immediately.')) return
    setRemovingId(id)
    try {
      await fetch(`/api/team/${id}`, { method: 'DELETE' })
      setUsers((prev) => prev.filter((u) => u.id !== id))
    } finally {
      setRemovingId(null)
    }
  }

  // ── Backup: retry ─────────────────────────────────────────────────────────
  const [retrying,    setRetrying]    = useState<Set<string>>(new Set())
  const [retryingAll, setRetryingAll] = useState(false)
  const [localStats,  setLocalStats]  = useState(backupStats ?? null)

  async function retryOne(id: string) {
    setRetrying((prev) => new Set(prev).add(id))
    try {
      await fetch('/api/backup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      })
      router.refresh()
    } finally {
      setRetrying((prev) => { const n = new Set(prev); n.delete(id); return n })
    }
  }

  async function retryAll() {
    if (!localStats || retryingAll) return
    setRetryingAll(true)
    try {
      for (const file of localStats.missing_files) {
        await fetch('/api/backup', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: file.id }),
        })
      }
      router.refresh()
    } finally {
      setRetryingAll(false)
    }
  }

  // ── Trash: restore / delete ───────────────────────────────────────────────
  const [tEvents, setTEvents] = useState<Event[]>(trashedEvents)
  const [tPhotos, setTPhotos] = useState<MediaFile[]>(trashedPhotos)
  const [trashBusy, setTrashBusy] = useState<string | null>(null)

  async function trashRestore(type: 'event' | 'photo', id: string) {
    setTrashBusy(id)
    try {
      await fetch('/api/trash', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type, id }),
      })
      if (type === 'event') setTEvents((p) => p.filter((e) => e.id !== id))
      else                  setTPhotos((p) => p.filter((f) => f.id !== id))
    } finally {
      setTrashBusy(null)
    }
  }

  async function trashDelete(type: 'event' | 'photo', id: string) {
    if (!confirm('Permanently delete this item? This cannot be undone.')) return
    setTrashBusy(id)
    try {
      await fetch(`/api/trash?type=${type}&id=${encodeURIComponent(id)}`, { method: 'DELETE' })
      if (type === 'event') setTEvents((p) => p.filter((e) => e.id !== id))
      else                  setTPhotos((p) => p.filter((f) => f.id !== id))
    } finally {
      setTrashBusy(null)
    }
  }

  // ── Integrity verification ────────────────────────────────────────────────
  const [verifying,    setVerifying]    = useState(false)
  const [verifyResult, setVerifyResult] = useState<VerifyResult | null>(null)

  async function runVerify() {
    setVerifying(true)
    setVerifyResult(null)
    try {
      const res  = await fetch('/api/verify', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ limit: 50 }) })
      const json = await res.json() as VerifyResult
      setVerifyResult(json)
    } catch {
      setVerifyResult({ checked: 0, valid: 0, invalid: 0, mismatches: [] })
    } finally {
      setVerifying(false)
    }
  }

  // ── Audit log filters ─────────────────────────────────────────────────────
  const [auditActionFilter, setAuditActionFilter] = useState('')
  const [auditDateFrom,     setAuditDateFrom]     = useState('')
  const [auditDateTo,       setAuditDateTo]       = useState('')

  const uniqueActions = Array.from(new Set(auditLogs.map((l) => l.action))).sort()

  const filteredLogs = auditLogs.filter((log) => {
    if (auditActionFilter && log.action !== auditActionFilter) return false
    if (auditDateFrom && log.created_at < auditDateFrom) return false
    if (auditDateTo   && log.created_at > auditDateTo + 'T23:59:59') return false
    return true
  })

  // ─────────────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-[#0a0a0a]">

      {/* ── Header ────────────────────────────────────────────────────────── */}
      <header className="border-b border-[#1a1a1a] bg-[#0a0a0a] sticky top-0 z-20">
        <div className="max-w-5xl mx-auto px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/events" className="text-[#555] hover:text-white transition-colors">
              <ArrowLeft size={15} />
            </Link>
            <div className="flex items-center gap-2">
              <div className="w-5 h-5 rounded bg-white flex items-center justify-center shrink-0">
                <svg width="11" height="11" viewBox="0 0 14 14" fill="none">
                  <rect x="1" y="1" width="5" height="5" rx="1" fill="#0a0a0a" />
                  <rect x="8" y="1" width="5" height="5" rx="1" fill="#0a0a0a" />
                  <rect x="1" y="8" width="5" height="5" rx="1" fill="#0a0a0a" />
                  <rect x="8" y="8" width="5" height="5" rx="1" fill="#0a0a0a" opacity="0.35" />
                </svg>
              </div>
              <span className="text-white text-sm font-semibold tracking-tight">Settings</span>
            </div>
          </div>
          <UserMenu profile={currentProfile} />
        </div>
      </header>

      <div className="max-w-5xl mx-auto px-6 py-10 flex gap-10">

        {/* ── Sidebar ───────────────────────────────────────────────────── */}
        <aside className="w-40 shrink-0">
          <div className="sticky top-24 space-y-0.5">
            {SECTIONS.map((s) => (
              <button
                key={s.id}
                onClick={() => scrollTo(s.id)}
                className={`flex items-center gap-2.5 w-full text-left px-3 py-2 rounded-lg text-xs transition-colors ${
                  activeSection === s.id
                    ? 'bg-white/8 text-white'
                    : 'text-[#555] hover:text-[#888] hover:bg-white/4'
                }`}
              >
                <s.icon size={13} className="shrink-0" />
                {s.label}
              </button>
            ))}
          </div>
        </aside>

        {/* ── Content ───────────────────────────────────────────────────── */}
        <div className="flex-1 min-w-0 space-y-16">

          {/* ╔══════════════════════════════════════════════════╗ */}
          {/* ║  ACCOUNT                                         ║ */}
          {/* ╚══════════════════════════════════════════════════╝ */}
          <section>
            <SectionHead id="account" icon={User} title="Account" subtitle="Your personal profile and login settings" />

            <Card>
              {/* Avatar row */}
              <div className="flex items-center gap-4 px-5 py-5 border-b border-[#1a1a1a]">
                <div className="w-14 h-14 rounded-full bg-white/10 border border-white/15 flex items-center justify-center text-white text-lg font-semibold select-none shrink-0">
                  {initials(currentProfile)}
                </div>
                <div>
                  <p className="text-white text-sm font-medium">{currentProfile.full_name ?? currentProfile.email.split('@')[0]}</p>
                  <p className="text-[#555] text-xs mt-0.5">{currentProfile.email}</p>
                  <span className={`inline-block mt-1.5 text-[10px] px-2 py-0.5 rounded-full border font-medium capitalize ${ROLE_PILL[currentProfile.role] ?? ROLE_PILL.photographer}`}>
                    {currentProfile.role}
                  </span>
                </div>
              </div>

              {/* Display name */}
              <div className="px-5 py-4 border-b border-[#1a1a1a]">
                <p className="text-[#555] text-xs uppercase tracking-wider mb-2">Display name</p>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={nameValue}
                    onChange={(e) => setNameValue(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && saveName()}
                    placeholder="Your name"
                    className="flex-1 bg-[#111] border border-[#222] rounded-lg px-3 py-2 text-white text-sm placeholder:text-[#333] focus:outline-none focus:border-[#333] transition-colors"
                  />
                  <button
                    onClick={saveName}
                    disabled={nameSaving || nameValue === (currentProfile.full_name ?? '')}
                    className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium bg-white text-black rounded-lg hover:bg-white/90 transition-colors disabled:opacity-40"
                  >
                    {nameSaving ? <Loader2 size={12} className="animate-spin" /> : nameSaved ? <Check size={12} className="text-emerald-500" /> : <Pencil size={12} />}
                    {nameSaved ? 'Saved' : 'Save'}
                  </button>
                </div>
              </div>

              {/* Email */}
              <div className="px-5 py-4 border-b border-[#1a1a1a]">
                <p className="text-[#555] text-xs uppercase tracking-wider mb-2">Email</p>
                <p className="text-[#888] text-sm font-mono">{currentProfile.email}</p>
                <p className="text-[#333] text-xs mt-1">Email address cannot be changed here</p>
              </div>

              {/* Password */}
              <div className="px-5 py-4">
                <p className="text-[#555] text-xs uppercase tracking-wider mb-3">Password</p>
                {!showPassForm ? (
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => setShowPassForm(true)}
                      className="text-xs px-3 py-2 border border-[#222] text-[#888] hover:text-white hover:border-[#444] rounded-lg transition-colors"
                    >
                      Change password
                    </button>
                    {passSuccess && (
                      <span className="text-emerald-400 text-xs flex items-center gap-1">
                        <Check size={11} /> Password updated
                      </span>
                    )}
                  </div>
                ) : (
                  <div className="space-y-2.5 max-w-sm">
                    <div className="relative">
                      <input
                        type={showNew ? 'text' : 'password'}
                        value={newPass}
                        onChange={(e) => setNewPass(e.target.value)}
                        placeholder="New password"
                        className="w-full bg-[#111] border border-[#222] rounded-lg px-3 py-2 pr-9 text-white text-sm placeholder:text-[#333] focus:outline-none focus:border-[#333] transition-colors"
                      />
                      <button onClick={() => setShowNew((v) => !v)} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#444] hover:text-[#888]">
                        {showNew ? <EyeOff size={13} /> : <Eye size={13} />}
                      </button>
                    </div>
                    <div className="relative">
                      <input
                        type={showConfirm ? 'text' : 'password'}
                        value={confirmPass}
                        onChange={(e) => setConfirmPass(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && changePassword()}
                        placeholder="Confirm new password"
                        className="w-full bg-[#111] border border-[#222] rounded-lg px-3 py-2 pr-9 text-white text-sm placeholder:text-[#333] focus:outline-none focus:border-[#333] transition-colors"
                      />
                      <button onClick={() => setShowConfirm((v) => !v)} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#444] hover:text-[#888]">
                        {showConfirm ? <EyeOff size={13} /> : <Eye size={13} />}
                      </button>
                    </div>
                    {passError && <p className="text-red-400 text-xs">{passError}</p>}
                    <div className="flex gap-2">
                      <button
                        onClick={changePassword}
                        disabled={passSaving || !newPass || !confirmPass}
                        className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium bg-white text-black rounded-lg hover:bg-white/90 transition-colors disabled:opacity-40"
                      >
                        {passSaving && <Loader2 size={11} className="animate-spin" />}
                        {passSaving ? 'Updating…' : 'Update password'}
                      </button>
                      <button
                        onClick={() => { setShowPassForm(false); setNewPass(''); setConfirmPass(''); setPassError('') }}
                        className="px-3 py-2 text-xs text-[#555] hover:text-white border border-[#222] hover:border-[#444] rounded-lg transition-colors"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </Card>
          </section>

          {isAdmin && (
            <>
              {/* ╔══════════════════════════════════════════════════╗ */}
              {/* ║  TEAM                                            ║ */}
              {/* ╚══════════════════════════════════════════════════╝ */}
              <section>
                <SectionHead id="team" icon={Users} title="Team" subtitle={`${users.length} member${users.length !== 1 ? 's' : ''}`} />

                {/* Members list */}
                <Card className="mb-6">
                  {users.map((u, i) => (
                    <div
                      key={u.id}
                      className={`flex items-center gap-3 px-4 py-3.5 ${i > 0 ? 'border-t border-[#161616]' : ''}`}
                    >
                      <div className="w-8 h-8 rounded-full bg-white/8 border border-white/10 flex items-center justify-center text-white text-xs font-semibold shrink-0 select-none">
                        {initials(u)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-white text-sm truncate">
                          {u.full_name ?? <span className="text-[#555] italic">No name</span>}
                          {u.id === currentProfile.id && (
                            <span className="text-[#333] text-xs ml-2">(you)</span>
                          )}
                        </p>
                        <p className="text-[#555] text-xs truncate">{u.email}</p>
                      </div>
                      <span className={`text-[10px] px-2 py-0.5 rounded-full border font-medium capitalize shrink-0 ${ROLE_PILL[u.role] ?? ROLE_PILL.photographer}`}>
                        {u.role}
                      </span>
                      <p className="text-[#333] text-xs shrink-0 hidden sm:block tabular-nums">{formatDate(u.created_at)}</p>
                      {u.id !== currentProfile.id && (
                        <button
                          onClick={() => removeMember(u.id)}
                          disabled={removingId === u.id}
                          className="shrink-0 text-[#333] hover:text-red-400 transition-colors p-1 rounded"
                          title="Remove member"
                        >
                          {removingId === u.id
                            ? <Loader2 size={13} className="animate-spin" />
                            : <Trash2 size={13} />
                          }
                        </button>
                      )}
                    </div>
                  ))}
                </Card>

                {/* Invite section */}
                <div>
                  <p className="text-[#444] text-xs uppercase tracking-wider mb-3 flex items-center gap-2">
                    <Mail size={11} />
                    Invite new member
                  </p>
                  <div className="flex gap-2 mb-5">
                    <select
                      value={newRole}
                      onChange={(e) => setNewRole(e.target.value as typeof newRole)}
                      className="bg-[#111] border border-[#1f1f1f] text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-[#333] transition-colors appearance-none cursor-pointer"
                    >
                      <option value="photographer">Photographer</option>
                      <option value="producer">Producer</option>
                      <option value="admin">Admin</option>
                    </select>
                    <button
                      onClick={generateInvite}
                      disabled={generating}
                      className="inline-flex items-center gap-1.5 bg-white text-black text-sm font-semibold px-4 py-2 rounded-lg hover:bg-white/90 transition-colors disabled:opacity-50"
                    >
                      {generating ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />}
                      {generating ? 'Generating…' : 'Generate invite'}
                    </button>
                  </div>

                  {activeInvites.length > 0 && (
                    <Card>
                      {activeInvites.map((inv, i) => (
                        <div key={inv.id} className={`flex items-center gap-3 px-4 py-3 ${i > 0 ? 'border-t border-[#161616]' : ''}`}>
                          <code className="text-[#888] text-xs font-mono flex-1 truncate">{inv.code}</code>
                          <span className={`text-[10px] px-2 py-0.5 rounded-full border font-medium capitalize shrink-0 ${ROLE_PILL[inv.role] ?? ROLE_PILL.photographer}`}>
                            {inv.role}
                          </span>
                          <span className="text-[#333] text-xs shrink-0 hidden sm:flex items-center gap-1">
                            <Clock size={10} />
                            {formatDate(inv.expires_at)}
                          </span>
                          <button
                            onClick={() => copyInviteLink(inv)}
                            className="shrink-0 flex items-center gap-1 text-xs text-[#555] hover:text-white px-2 py-1 border border-[#1f1f1f] hover:border-[#333] rounded-lg transition-colors"
                          >
                            {copiedId === inv.id
                              ? <><Check size={11} className="text-emerald-400" /> Copied</>
                              : <><Copy size={11} /> Copy link</>
                            }
                          </button>
                          <button
                            onClick={() => revokeInvite(inv.code)}
                            className="shrink-0 text-[#333] hover:text-red-400 transition-colors p-1"
                            title="Revoke invite"
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      ))}
                    </Card>
                  )}
                  {activeInvites.length === 0 && (
                    <p className="text-[#333] text-sm">No active invites. Generate one above.</p>
                  )}
                  {(usedInvites.length > 0 || expiredInvites.length > 0) && (
                    <p className="text-[#2a2a2a] text-xs mt-3">
                      {usedInvites.length} used · {expiredInvites.length} expired
                    </p>
                  )}
                </div>
              </section>

              {/* ╔══════════════════════════════════════════════════╗ */}
              {/* ║  STORAGE & DATA                                  ║ */}
              {/* ╚══════════════════════════════════════════════════╝ */}
              <section>
                <SectionHead id="storage" icon={HardDrive} title="Storage & Data" subtitle="Backup status and photographer directory" />

                {/* Backup stats */}
                {localStats && (() => {
                  const coverage = localStats.total === 0 ? 100 : Math.round((localStats.backed_up / localStats.total) * 100)
                  const allGood  = localStats.missing === 0
                  return (
                    <div className="mb-10">
                      <p className="text-[#444] text-xs uppercase tracking-wider mb-3">Backup</p>

                      {/* Stat cards */}
                      <div className="grid grid-cols-3 gap-3 mb-4">
                        {[
                          { label: 'Total files',  value: localStats.total,     sub: 'in main bucket'  },
                          { label: 'Backed up',    value: localStats.backed_up, sub: 'in media-backup' },
                          { label: 'Missing',      value: localStats.missing,   sub: 'not yet copied'  },
                        ].map(({ label, value, sub }) => (
                          <Card key={label} className="px-4 py-3.5">
                            <p className="text-white text-xl font-semibold tabular-nums">{value.toLocaleString()}</p>
                            <p className="text-white text-xs font-medium mt-0.5">{label}</p>
                            <p className="text-[#444] text-[11px] mt-0.5">{sub}</p>
                          </Card>
                        ))}
                      </div>

                      {/* Coverage bar */}
                      <Card className="px-4 py-3.5 mb-4">
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2">
                            {allGood
                              ? <CheckCircle2 size={13} className="text-emerald-400" />
                              : <AlertCircle  size={13} className="text-amber-400"   />}
                            <span className="text-white text-sm font-medium">
                              {allGood ? 'All files backed up' : `${coverage}% coverage`}
                            </span>
                          </div>
                          <span className="text-[#555] text-xs tabular-nums">{localStats.backed_up} / {localStats.total}</span>
                        </div>
                        <div className="h-1.5 bg-[#1a1a1a] rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all duration-500 ${allGood ? 'bg-emerald-500' : coverage >= 80 ? 'bg-blue-500' : 'bg-amber-400'}`}
                            style={{ width: `${coverage}%` }}
                          />
                        </div>
                      </Card>

                      {/* Missing files */}
                      {localStats.missing > 0 && (
                        <div>
                          <div className="flex items-center justify-between mb-3">
                            <p className="text-[#888] text-xs">
                              {localStats.missing} missing backup{localStats.missing !== 1 ? 's' : ''}
                              {localStats.missing > localStats.missing_files.length && ` (showing ${localStats.missing_files.length})`}
                            </p>
                            <button
                              onClick={retryAll}
                              disabled={retryingAll}
                              className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 border border-[#1f1f1f] text-[#555] hover:text-white hover:border-[#333] rounded-lg transition-all disabled:opacity-40"
                            >
                              <RefreshCw size={11} className={retryingAll ? 'animate-spin' : ''} />
                              {retryingAll ? 'Retrying…' : 'Retry all'}
                            </button>
                          </div>
                          <div className="space-y-2">
                            {localStats.missing_files.map((file) => (
                              <Card key={file.id} className="flex items-center gap-4 px-4 py-3">
                                <div className="flex-1 min-w-0">
                                  <p className="text-[#888] text-sm truncate">{file.filename}</p>
                                  <p className="text-[#333] text-xs mt-0.5 font-mono truncate">{file.storage_path}</p>
                                </div>
                                <button
                                  onClick={() => retryOne(file.id)}
                                  disabled={retrying.has(file.id) || retryingAll}
                                  className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 border border-[#1f1f1f] text-[#555] hover:text-white hover:border-[#333] rounded-lg transition-all disabled:opacity-40 shrink-0"
                                >
                                  <RefreshCw size={11} className={retrying.has(file.id) ? 'animate-spin' : ''} />
                                  {retrying.has(file.id) ? 'Copying…' : 'Retry'}
                                </button>
                              </Card>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })()}

                {/* Integrity verification */}
                <div className="mb-10">
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-[#444] text-xs uppercase tracking-wider">File integrity</p>
                    <button
                      onClick={runVerify}
                      disabled={verifying}
                      className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 border border-[#1f1f1f] text-[#555] hover:text-white hover:border-[#333] rounded-lg transition-all disabled:opacity-40"
                    >
                      {verifying
                        ? <><Loader2 size={11} className="animate-spin" /> Verifying…</>
                        : <><ShieldCheck size={11} /> Verify integrity</>
                      }
                    </button>
                  </div>
                  {verifyResult && (
                    <Card className="px-4 py-3.5">
                      <div className="flex items-center gap-3 mb-3">
                        {verifyResult.invalid === 0
                          ? <CheckCircle2 size={14} className="text-emerald-400 shrink-0" />
                          : <XCircle      size={14} className="text-red-400 shrink-0" />
                        }
                        <span className="text-white text-sm font-medium">
                          {verifyResult.invalid === 0
                            ? `All ${verifyResult.checked} files verified — checksums match`
                            : `${verifyResult.invalid} mismatch${verifyResult.invalid !== 1 ? 'es' : ''} found across ${verifyResult.checked} files checked`
                          }
                        </span>
                        <span className="text-[#444] text-xs ml-auto tabular-nums">
                          {verifyResult.valid} / {verifyResult.checked} OK
                        </span>
                      </div>
                      {verifyResult.mismatches.length > 0 && (
                        <div className="space-y-1.5 mt-3 border-t border-[#1a1a1a] pt-3">
                          {verifyResult.mismatches.map((m) => (
                            <div key={m.id} className="flex items-start gap-2">
                              <AlertCircle size={12} className="text-red-400 shrink-0 mt-0.5" />
                              <div className="min-w-0">
                                <p className="text-[#888] text-xs truncate">{m.filename}</p>
                                {m.error
                                  ? <p className="text-red-400/70 text-[11px]">{m.error}</p>
                                  : <p className="text-[#444] text-[11px] font-mono truncate">expected {m.expected?.slice(0, 16)}… got {m.actual?.slice(0, 16)}…</p>
                                }
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                      <p className="text-[#2a2a2a] text-[11px] mt-3">Checked the {verifyResult.checked} oldest files with stored hashes</p>
                    </Card>
                  )}
                </div>

                {/* Photographers directory */}
                <div>
                  <p className="text-[#444] text-xs uppercase tracking-wider mb-3">Photographers</p>
                  {photographers.length === 0 ? (
                    <Card className="flex flex-col items-center justify-center py-12 text-center">
                      <Camera size={24} className="text-[#333] mb-3" />
                      <p className="text-[#555] text-sm">No photographers yet</p>
                      <p className="text-[#3a3a3a] text-xs mt-1">They appear when added to events</p>
                    </Card>
                  ) : (
                    <Card className="overflow-hidden">
                      {photographers.map((p, i) => (
                        <Link
                          key={p.id}
                          href={`/photographers/${p.id}`}
                          className={`flex items-center gap-3 px-4 py-3.5 hover:bg-white/3 transition-colors group ${i > 0 ? 'border-t border-[#161616]' : ''}`}
                        >
                          <div className="w-7 h-7 rounded-full bg-[#1a1a1a] border border-[#2a2a2a] flex items-center justify-center shrink-0">
                            <Camera size={12} className="text-[#555]" />
                          </div>
                          <span className="text-white text-sm flex-1 group-hover:underline underline-offset-2">{p.name}</span>
                          <span className="text-[#444] text-xs tabular-nums">{p.photoCount} photo{p.photoCount !== 1 ? 's' : ''}</span>
                          <span className="text-[#333] text-xs tabular-nums">{p.eventCount} event{p.eventCount !== 1 ? 's' : ''}</span>
                        </Link>
                      ))}
                    </Card>
                  )}
                </div>
              </section>

              {/* ╔══════════════════════════════════════════════════╗ */}
              {/* ║  TRASH                                           ║ */}
              {/* ╚══════════════════════════════════════════════════╝ */}
              <section>
                <SectionHead id="trash" icon={Trash2} title="Trash" subtitle="Items are permanently deleted after 30 days" />

                {tEvents.length === 0 && tPhotos.length === 0 ? (
                  <Card className="flex flex-col items-center justify-center py-16 text-center">
                    <Trash2 size={22} className="text-[#333] mb-3" />
                    <p className="text-[#555] text-sm">Trash is empty</p>
                  </Card>
                ) : (
                  <div className="space-y-8">
                    {tEvents.length > 0 && (
                      <div>
                        <p className="text-[#444] text-xs uppercase tracking-wider mb-3 flex items-center gap-1.5">
                          <Calendar size={11} />
                          Events ({tEvents.length})
                        </p>
                        <div className="space-y-2">
                          {tEvents.map((event) => (
                            <Card key={event.id} className="flex items-center gap-4 px-4 py-3">
                              <div className="flex-1 min-w-0">
                                <p className="text-white text-sm font-medium truncate">{event.name}</p>
                                <p className="text-[#555] text-xs mt-0.5">
                                  {formatDate(event.date)}
                                  {event.deleted_at && (
                                    <> · {daysUntilPurge(event.deleted_at)}d until auto-delete</>
                                  )}
                                </p>
                              </div>
                              <div className="flex items-center gap-2 shrink-0">
                                <button
                                  onClick={() => trashRestore('event', event.id)}
                                  disabled={trashBusy === event.id}
                                  className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 border border-[#1f1f1f] text-[#555] hover:text-white hover:border-[#333] rounded-lg transition-all disabled:opacity-40"
                                >
                                  <RotateCcw size={11} />
                                  {trashBusy === event.id ? '…' : 'Restore'}
                                </button>
                                <button
                                  onClick={() => trashDelete('event', event.id)}
                                  disabled={trashBusy === event.id}
                                  className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 border border-red-500/20 text-red-400/60 hover:text-red-400 hover:border-red-500/40 rounded-lg transition-all disabled:opacity-40"
                                >
                                  <Trash2 size={11} />
                                  Delete forever
                                </button>
                              </div>
                            </Card>
                          ))}
                        </div>
                      </div>
                    )}

                    {tPhotos.length > 0 && (
                      <div>
                        <p className="text-[#444] text-xs uppercase tracking-wider mb-3 flex items-center gap-1.5">
                          <ImageIcon size={11} />
                          Photos ({tPhotos.length})
                        </p>
                        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                          {tPhotos.map((photo) => (
                            <Card key={photo.id} className="overflow-hidden">
                              <div className="relative aspect-square bg-[#0d0d0d]">
                                {photo.public_url ? (
                                  <img
                                    src={photo.public_url}
                                    alt={photo.filename}
                                    className="w-full h-full object-cover"
                                  />
                                ) : (
                                  <div className="absolute inset-0 flex items-center justify-center">
                                    <ImageIcon size={18} className="text-[#333]" />
                                  </div>
                                )}
                                {photo.deleted_at && (
                                  <div className="absolute top-2 right-2 text-[10px] bg-black/70 text-[#888] px-1.5 py-0.5 rounded">
                                    {daysUntilPurge(photo.deleted_at)}d
                                  </div>
                                )}
                              </div>
                              <div className="p-3">
                                <p className="text-[#888] text-xs truncate mb-2">{photo.filename}</p>
                                <div className="flex gap-1.5">
                                  <button
                                    onClick={() => trashRestore('photo', photo.id)}
                                    disabled={trashBusy === photo.id}
                                    className="flex-1 inline-flex items-center justify-center gap-1 text-[10px] px-2 py-1.5 border border-[#1f1f1f] text-[#555] hover:text-white hover:border-[#333] rounded-lg transition-all disabled:opacity-40"
                                  >
                                    <RotateCcw size={9} />
                                    {trashBusy === photo.id ? '…' : 'Restore'}
                                  </button>
                                  <button
                                    onClick={() => trashDelete('photo', photo.id)}
                                    disabled={trashBusy === photo.id}
                                    className="flex-1 inline-flex items-center justify-center gap-1 text-[10px] px-2 py-1.5 border border-red-500/20 text-red-400/60 hover:text-red-400 hover:border-red-500/40 rounded-lg transition-all disabled:opacity-40"
                                  >
                                    <Trash2 size={9} />
                                    Delete
                                  </button>
                                </div>
                              </div>
                            </Card>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </section>

              {/* ╔══════════════════════════════════════════════════╗ */}
              {/* ║  AUDIT LOG                                       ║ */}
              {/* ╚══════════════════════════════════════════════════╝ */}
              <section>
                <SectionHead id="audit" icon={History} title="Audit log" subtitle={`${auditLogs.length} recent actions`} />

                {/* Filters */}
                <div className="flex flex-wrap gap-2 mb-4">
                  <div className="relative">
                    <Filter size={11} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[#444] pointer-events-none" />
                    <select
                      value={auditActionFilter}
                      onChange={(e) => setAuditActionFilter(e.target.value)}
                      className="bg-[#111] border border-[#1f1f1f] text-[#888] text-xs rounded-lg pl-7 pr-3 py-2 focus:outline-none focus:border-[#333] appearance-none cursor-pointer"
                    >
                      <option value="">All actions</option>
                      {uniqueActions.map((a) => (
                        <option key={a} value={a}>{ACTION_LABELS[a] ?? a}</option>
                      ))}
                    </select>
                  </div>
                  <input
                    type="date"
                    value={auditDateFrom}
                    onChange={(e) => setAuditDateFrom(e.target.value)}
                    placeholder="From"
                    className="bg-[#111] border border-[#1f1f1f] text-[#888] text-xs rounded-lg px-3 py-2 focus:outline-none focus:border-[#333] [color-scheme:dark]"
                  />
                  <input
                    type="date"
                    value={auditDateTo}
                    onChange={(e) => setAuditDateTo(e.target.value)}
                    placeholder="To"
                    className="bg-[#111] border border-[#1f1f1f] text-[#888] text-xs rounded-lg px-3 py-2 focus:outline-none focus:border-[#333] [color-scheme:dark]"
                  />
                  {(auditActionFilter || auditDateFrom || auditDateTo) && (
                    <button
                      onClick={() => { setAuditActionFilter(''); setAuditDateFrom(''); setAuditDateTo('') }}
                      className="text-xs text-[#555] hover:text-white px-2 py-1 border border-[#1f1f1f] hover:border-[#333] rounded-lg transition-colors"
                    >
                      Clear
                    </button>
                  )}
                  <span className="text-[#333] text-xs self-center ml-auto tabular-nums">
                    {filteredLogs.length} entr{filteredLogs.length !== 1 ? 'ies' : 'y'}
                  </span>
                </div>

                {filteredLogs.length === 0 ? (
                  <Card className="flex flex-col items-center justify-center py-12 text-center">
                    <History size={20} className="text-[#333] mb-2" />
                    <p className="text-[#555] text-sm">No audit entries{auditActionFilter || auditDateFrom || auditDateTo ? ' match your filters' : ' yet'}</p>
                  </Card>
                ) : (
                  <Card className="overflow-hidden">
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="border-b border-[#1a1a1a]">
                            <th className="text-left text-[#444] font-medium px-4 py-2.5 whitespace-nowrap">Time</th>
                            <th className="text-left text-[#444] font-medium px-4 py-2.5 whitespace-nowrap">User</th>
                            <th className="text-left text-[#444] font-medium px-4 py-2.5 whitespace-nowrap">Action</th>
                            <th className="text-left text-[#444] font-medium px-4 py-2.5 whitespace-nowrap">Entity</th>
                            <th className="text-left text-[#444] font-medium px-4 py-2.5 whitespace-nowrap">Details</th>
                          </tr>
                        </thead>
                        <tbody>
                          {filteredLogs.map((log, i) => {
                            const metaEntries = Object.entries(log.metadata ?? {}).filter(([k]) =>
                              !['ids', 'count', 'fields', 'token', 'code'].includes(k)
                            )
                            const detailStr = metaEntries
                              .slice(0, 2)
                              .map(([k, v]) => `${k}: ${String(v)}`)
                              .join(' · ')

                            return (
                              <tr key={log.id} className={`${i > 0 ? 'border-t border-[#111]' : ''} hover:bg-white/2 transition-colors`}>
                                <td className="px-4 py-2.5 text-[#444] whitespace-nowrap tabular-nums">
                                  {new Date(log.created_at).toLocaleString('en-GB', {
                                    day: '2-digit', month: 'short',
                                    hour: '2-digit', minute: '2-digit',
                                  })}
                                </td>
                                <td className="px-4 py-2.5 text-[#666] max-w-[120px] truncate">
                                  {log.profiles?.full_name ?? log.profiles?.email?.split('@')[0] ?? <span className="text-[#333] italic">system</span>}
                                </td>
                                <td className="px-4 py-2.5 text-white whitespace-nowrap">
                                  {ACTION_LABELS[log.action] ?? log.action}
                                </td>
                                <td className="px-4 py-2.5 text-[#444] whitespace-nowrap font-mono">
                                  {log.entity_type
                                    ? `${log.entity_type}:${log.entity_id?.slice(0, 8) ?? '?'}`
                                    : '—'
                                  }
                                </td>
                                <td className="px-4 py-2.5 text-[#444] max-w-[200px] truncate">
                                  {detailStr || '—'}
                                </td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>
                    {auditLogs.length === 500 && (
                      <div className="px-4 py-2.5 border-t border-[#111] text-[#2a2a2a] text-[11px]">
                        Showing the most recent 500 entries
                      </div>
                    )}
                  </Card>
                )}
              </section>

              {/* ╔══════════════════════════════════════════════════╗ */}
              {/* ║  DANGER ZONE                                     ║ */}
              {/* ╚══════════════════════════════════════════════════╝ */}
              <section className="pb-16">
                <SectionHead id="danger" icon={AlertTriangle} title="Danger zone" />

                <Card className="border-red-500/10">
                  <div className="flex items-center justify-between px-5 py-4 border-b border-[#1a1a1a]">
                    <div>
                      <p className="text-white text-sm font-medium">Export all data</p>
                      <p className="text-[#555] text-xs mt-0.5">Download a full archive of all events and media</p>
                    </div>
                    <button
                      disabled
                      title="Coming soon"
                      className="text-xs px-3 py-2 border border-[#222] text-[#444] rounded-lg cursor-not-allowed"
                    >
                      Coming soon
                    </button>
                  </div>
                  <div className="flex items-center justify-between px-5 py-4">
                    <div>
                      <p className="text-red-400/80 text-sm font-medium">Delete account</p>
                      <p className="text-[#555] text-xs mt-0.5">Permanently remove your account and all associated data</p>
                    </div>
                    <button
                      disabled
                      title="Contact support to delete your account"
                      className="text-xs px-3 py-2 border border-red-500/20 text-red-400/40 rounded-lg cursor-not-allowed"
                    >
                      Contact support
                    </button>
                  </div>
                </Card>
              </section>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
