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
import Navbar from '@/components/layout/Navbar'
import Pill from '@/components/ui/Pill'
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
  currentProfile:   UserProfile
  users?:           UserProfile[]
  invites?:         Invite[]
  backupStats?:     BackupStats | null
  photographers?:   Photographer[]
  trashedEvents?:   Event[]
  trashedPhotos?:   MediaFile[]
  auditLogs?:       AuditLog[]
  expiringRights?:  MediaFile[]
  unlicensedPhotos?: MediaFile[]
}

type SectionId = 'account' | 'team' | 'storage' | 'trash' | 'rights' | 'audit' | 'ai' | 'danger'

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
  event_created:               'Project created',
  event_edited:                'Project edited',
  event_deleted:               'Project trashed',
  event_restored:              'Project restored',
  event_permanently_deleted:   'Project permanently deleted',
  project_created:             'Project created',
  project_edited:              'Project edited',
  project_deleted:             'Project trashed',
  project_restored:            'Project restored',
  project_permanently_deleted: 'Project permanently deleted',
  usage_rights_updated:        'Usage rights updated',
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

// ─── Section header ───────────────────────────────────────────────────────────

function SectionHead({ id, icon: Icon, title, subtitle }: { id: string; icon: React.ElementType; title: string; subtitle?: string }) {
  return (
    <div id={id} className="flex items-center gap-3 mb-6 scroll-mt-24">
      <div className="w-8 h-8 rounded flex items-center justify-center shrink-0" style={{ background: 'var(--surface-0)', border: 'var(--border-subtle)' }}>
        <Icon size={14} style={{ color: 'var(--text-muted)' }} />
      </div>
      <div>
        <h2 className="text-sm font-semibold track-heading" style={{ color: 'var(--text-primary)' }}>{title}</h2>
        {subtitle && <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>{subtitle}</p>}
      </div>
    </div>
  )
}

// ─── Card wrapper ─────────────────────────────────────────────────────────────

function Card({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`rounded ${className}`} style={{ background: 'var(--surface-0)', border: 'var(--border-rule)' }}>
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
  expiringRights = [],
  unlicensedPhotos = [],
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
      { id: 'rights'  as SectionId, label: 'Rights',         icon: ShieldCheck  },
      { id: 'audit'   as SectionId, label: 'Audit log',      icon: History      },
      { id: 'ai'      as SectionId, label: 'AI & Tagging',   icon: RefreshCw    },
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
  const [retrying,        setRetrying]        = useState<Set<string>>(new Set())
  const [retryingAll,     setRetryingAll]     = useState(false)
  const [localStats,      setLocalStats]      = useState(backupStats ?? null)
  const [backupsExpanded, setBackupsExpanded] = useState(false)

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

  // ── AI: Tag all untagged (cross-project) ─────────────────────────────────
  const [tagAllState, setTagAllState] = useState<'idle' | 'queuing' | 'queued'>('idle')
  const [tagAllCount, setTagAllCount] = useState<number | null>(null)

  async function tagAllUntagged() {
    setTagAllState('queuing')
    try {
      const res  = await fetch('/api/tag/batch', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}) })
      const json = await res.json() as { queued?: number }
      const count = json.queued ?? 0
      setTagAllCount(count)
      if (count > 0) {
        const { saveTaggingJob } = await import('@/components/TaggingProgress')
        saveTaggingJob({ total: count, startedAt: Date.now(), eventId: null })
      }
      setTagAllState('queued')
    } catch {
      setTagAllState('idle')
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
  const [auditExpanded,     setAuditExpanded]     = useState(false)

  const uniqueActions = Array.from(new Set(auditLogs.map((l) => l.action))).sort()

  const filteredLogs = auditLogs.filter((log) => {
    if (auditActionFilter && log.action !== auditActionFilter) return false
    if (auditDateFrom && log.created_at < auditDateFrom) return false
    if (auditDateTo   && log.created_at > auditDateTo + 'T23:59:59') return false
    return true
  })

  // ─────────────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-surface-0">

      <Navbar profile={currentProfile} />

      <div className="max-w-5xl mx-auto px-4 md:px-6 py-6 md:py-10 flex flex-col md:flex-row gap-6 md:gap-10">

        {/* ── Sidebar ───────────────────────────────────────────────────── */}
        <aside className="w-40 shrink-0 hidden md:block">
          <div className="sticky top-24 flex flex-col">
            {SECTIONS.map((s) => {
              const active = activeSection === s.id
              return (
                <button
                  key={s.id}
                  onClick={() => scrollTo(s.id)}
                  style={{
                    display:        'flex',
                    alignItems:     'center',
                    gap:            8,
                    fontSize:       11,
                    color:          active ? 'var(--accent-dark)' : 'var(--text-secondary)',
                    padding:        '7px 12px',
                    border:         'none',
                    borderLeft:     active ? '1.5px solid var(--accent)' : '1.5px solid transparent',
                    background:     active ? 'var(--accent-bg)' : 'transparent',
                    textAlign:      'left' as const,
                    whiteSpace:     'nowrap' as const,
                    cursor:         'pointer',
                    transition:     'color 0.15s, background 0.15s',
                    fontFamily:     'inherit',
                  }}
                >
                  <s.icon size={13} style={{ flexShrink: 0 }} />
                  {s.label}
                </button>
              )
            })}
          </div>
        </aside>

        {/* ── Mobile section nav ────────────────────────────────────────── */}
        <div className="block md:hidden">
          <select
            value={activeSection}
            onChange={(e) => scrollTo(e.target.value as SectionId)}
            style={{
              width:        '100%',
              background:   'var(--surface-1)',
              border:       'var(--border-rule)',
              borderRadius: 4,
              padding:      '10px 12px',
              fontSize:     14,
              color:        'var(--text-primary)',
              fontFamily:   'inherit',
              outline:      'none',
              cursor:       'pointer',
            }}
          >
            {SECTIONS.map((s) => (
              <option key={s.id} value={s.id}>{s.label}</option>
            ))}
          </select>
        </div>

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
                <div className="min-w-0">
                  <p style={{ color: 'var(--text-primary)', fontSize: 14, fontWeight: 500, margin: 0, overflowWrap: 'break-word', wordBreak: 'break-all' }}>{currentProfile.full_name ?? currentProfile.email.split('@')[0]}</p>
                  <p className="text-[#555] text-xs mt-0.5" style={{ overflowWrap: 'break-word', wordBreak: 'break-all' }}>{currentProfile.email}</p>
                  <span className="inline-block mt-1.5">
                    <Pill variant="ghost">{currentProfile.role}</Pill>
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
                    className="flex-1 bg-surface-0 border border-[#222] rounded-lg px-3 py-2 text-white text-sm placeholder:text-[#333] focus:outline-none focus:border-[#333] transition-colors"
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
                        className="w-full bg-surface-0 border border-[#222] rounded-lg px-3 py-2 pr-9 text-white text-sm placeholder:text-[#333] focus:outline-none focus:border-[#333] transition-colors"
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
                        className="w-full bg-surface-0 border border-[#222] rounded-lg px-3 py-2 pr-9 text-white text-sm placeholder:text-[#333] focus:outline-none focus:border-[#333] transition-colors"
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
                <div className="mb-6">
                  {users.map((u, i) => (
                    <div
                      key={u.id}
                      style={{
                        display:     'flex',
                        alignItems:  'center',
                        gap:         12,
                        padding:     '10px 16px',
                        background:  'var(--surface-1)',
                        border:      'var(--border-rule)',
                        borderRadius: 2,
                        marginBottom: i < users.length - 1 ? 4 : 0,
                      }}
                    >
                      <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold shrink-0 select-none"
                        style={{ background: 'var(--surface-3)', color: 'var(--text-primary)' }}>
                        {initials(u)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm truncate" style={{ color: 'var(--text-primary)' }}>
                          {u.full_name ?? <span style={{ color: 'var(--text-secondary)' }}>No name</span>}
                          {u.id === currentProfile.id && (
                            <span className="text-xs ml-2" style={{ color: 'var(--text-dim)' }}>(you)</span>
                          )}
                        </p>
                        <p className="text-xs truncate" style={{ color: 'var(--text-secondary)' }}>{u.email}</p>
                      </div>
                      <Pill variant="ghost">{u.role}</Pill>
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
                </div>

                {/* Invite section */}
                <div>
                  <p style={{ fontSize: 9, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--text-muted)', borderBottom: 'var(--border-rule)', paddingBottom: 8, marginBottom: 12 }}>Invite new member</p>
                  <div className="flex gap-2 mb-5">
                    <select
                      value={newRole}
                      onChange={(e) => setNewRole(e.target.value as typeof newRole)}
                      className="bg-surface-0 border border-[#1f1f1f] text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-[#333] transition-colors appearance-none cursor-pointer"
                    >
                      <option value="photographer">Photographer</option>
                      <option value="producer">Producer</option>
                      <option value="admin">Admin</option>
                    </select>
                    <button
                      onClick={generateInvite}
                      disabled={generating}
                      className="inline-flex items-center gap-1.5 disabled:opacity-50 transition-colors"
                      style={{ border: 'var(--border-rule)', background: 'transparent', color: 'var(--text-secondary)', borderRadius: 2, fontSize: 11, padding: '6px 12px', cursor: 'pointer', fontFamily: 'inherit' }}
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
                          <Pill variant="ghost">{inv.role}</Pill>
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
                      <p style={{ fontSize: 9, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--text-muted)', borderBottom: 'var(--border-rule)', paddingBottom: 8, marginBottom: 12 }}>Backup</p>

                      {/* Stat cards */}
                      <div className="grid grid-cols-3 gap-3 mb-4">
                        {[
                          { label: 'Total files',  value: localStats.total,     sub: 'in main bucket'  },
                          { label: 'Backed up',    value: localStats.backed_up, sub: 'in media-backup' },
                          { label: 'Missing',      value: localStats.missing,   sub: 'not yet copied'  },
                        ].map(({ label, value, sub }) => (
                          <div key={label} style={{ background: 'var(--surface-2)', border: 'var(--border-rule)', borderRadius: 4, padding: '12px 16px' }}>
                            <p style={{ fontSize: 24, fontWeight: 500, color: 'var(--text-primary)', fontVariantNumeric: 'tabular-nums', lineHeight: 1, marginBottom: 4 }}>{value.toLocaleString()}</p>
                            <p style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 2 }}>{label}</p>
                            <p style={{ fontSize: 10, color: 'var(--text-muted)' }}>{sub}</p>
                          </div>
                        ))}
                      </div>

                      {/* Coverage bar */}
                      <Card className="px-4 py-3.5 mb-4">
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2">
                            {allGood
                              ? <CheckCircle2 size={13} className="text-emerald-400" />
                              : <AlertCircle  size={13} style={{ color: 'var(--accent)' }} />}
                            <span style={{ fontSize: 13, fontWeight: 500, color: allGood ? undefined : 'var(--accent)' }} className={allGood ? 'text-sm font-medium' : ''}>
                              {allGood ? 'All files backed up' : `${coverage}% coverage`}
                            </span>
                          </div>
                          <span className="text-xs tabular-nums" style={{ color: 'var(--text-muted)' }}>{localStats.backed_up} / {localStats.total}</span>
                        </div>
                        <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--surface-2)' }}>
                          <div
                            className="h-full rounded-full transition-all duration-500"
                            style={{ width: `${coverage}%`, background: allGood ? '#1D9E75' : 'var(--accent)' }}
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
                              className="inline-flex items-center gap-1.5 disabled:opacity-40 transition-colors"
                              style={{ border: 'var(--border-rule)', background: 'transparent', color: 'var(--text-secondary)', borderRadius: 2, fontSize: 11, padding: '6px 12px', cursor: 'pointer', fontFamily: 'inherit' }}
                            >
                              <RefreshCw size={11} className={retryingAll ? 'animate-spin' : ''} />
                              {retryingAll ? 'Retrying…' : 'Retry all'}
                            </button>
                          </div>
                          <div className="space-y-2">
                            {(backupsExpanded ? localStats.missing_files : localStats.missing_files.slice(0, 3)).map((file) => (
                              <Card key={file.id} className="flex items-center gap-4 px-4 py-3">
                                <div className="flex-1 min-w-0">
                                  <p className="text-[#888] text-sm truncate">{file.filename}</p>
                                  <p className="text-[#333] text-xs mt-0.5 font-mono truncate">
                                    {file.storage_path.length > 20 ? `…${file.storage_path.slice(-17)}` : file.storage_path}
                                  </p>
                                </div>
                                <button
                                  onClick={() => retryOne(file.id)}
                                  disabled={retrying.has(file.id) || retryingAll}
                                  className="inline-flex items-center gap-1.5 disabled:opacity-40 shrink-0 transition-colors"
                                  style={{ border: 'var(--border-rule)', background: 'transparent', color: 'var(--text-secondary)', borderRadius: 2, fontSize: 11, padding: '6px 12px', cursor: 'pointer', fontFamily: 'inherit' }}
                                >
                                  <RefreshCw size={11} className={retrying.has(file.id) ? 'animate-spin' : ''} />
                                  {retrying.has(file.id) ? 'Copying…' : 'Retry'}
                                </button>
                              </Card>
                            ))}
                            {localStats.missing_files.length > 3 && (
                              <button
                                onClick={() => setBackupsExpanded((p) => !p)}
                                className="w-full text-center text-xs py-2 transition-colors"
                                style={{ color: 'var(--text-muted)' }}
                              >
                                {backupsExpanded
                                  ? 'Show less'
                                  : `Show all ${localStats.missing_files.length}`}
                              </button>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })()}

                {/* Integrity verification */}
                <div className="mb-10">
                  <div className="flex items-center justify-between gap-4 mb-3">
                    <div>
                      <p style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-primary)' }}>File integrity</p>
                      <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>Verify stored checksums match the files in your backup bucket</p>
                    </div>
                    <button
                      onClick={runVerify}
                      disabled={verifying}
                      className="inline-flex items-center gap-1.5 shrink-0 disabled:opacity-40 transition-colors"
                      style={{ background: 'var(--surface-2)', border: 'var(--border-rule)', color: 'var(--text-primary)', borderRadius: 6, fontSize: 12, padding: '7px 14px', cursor: 'pointer', fontFamily: 'inherit' }}
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
                          <div className="w-7 h-7 rounded-full bg-surface-0 border border-[#2a2a2a] flex items-center justify-center shrink-0">
                            <Camera size={12} className="text-[#555]" />
                          </div>
                          <span className="text-white text-sm flex-1 group-hover:underline underline-offset-2">{p.name}</span>
                          <span className="text-[#444] text-xs tabular-nums">{p.photoCount} photo{p.photoCount !== 1 ? 's' : ''}</span>
                          <span className="text-[#333] text-xs tabular-nums">{p.eventCount} project{p.eventCount !== 1 ? 's' : ''}</span>
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
                          Projects ({tEvents.length})
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
                              <div className="relative aspect-square bg-surface-0">
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
              {/* ║  RIGHTS & LICENSING                              ║ */}
              {/* ╚══════════════════════════════════════════════════╝ */}
              <section>
                <SectionHead id="rights" icon={ShieldCheck} title="Rights & Licensing" subtitle="Usage rights status across all media" />

                <div className="space-y-4">
                  {/* Summary pills */}
                  <div className="flex flex-wrap gap-3">
                    <div className="flex items-center gap-2 px-3 py-2 rounded-lg" style={{ background: 'var(--flagged-bg)', border: '0.5px solid var(--flagged-border)' }}>
                      <span className="text-xs" style={{ color: 'var(--flagged-fg)' }}>Unlicensed</span>
                      <span className="text-sm font-semibold tabular-nums" style={{ color: 'var(--flagged-fg)' }}>{unlicensedPhotos.length}</span>
                    </div>
                    <div className="flex items-center gap-2 px-3 py-2 rounded-lg" style={{ background: '#fef9e6', border: '0.5px solid #f0dca0' }}>
                      <span className="text-xs" style={{ color: '#b8860b' }}>Expiring soon</span>
                      <span className="text-sm font-semibold tabular-nums" style={{ color: '#b8860b' }}>{expiringRights.length}</span>
                    </div>
                  </div>

                  {/* Expiring rights */}
                  {expiringRights.length > 0 && (
                    <Card>
                      <div className="px-5 py-3 border-b border-[#1a1a1a]">
                        <p className="text-[#888] text-xs font-medium uppercase tracking-wider">Expiring within 30 days</p>
                      </div>
                      <div className="divide-y divide-[#111]">
                        {expiringRights.map((f) => (
                          <div key={f.id} className="px-5 py-3 flex items-center justify-between gap-4">
                            <div className="min-w-0">
                              <p className="text-white text-xs truncate font-mono">{f.filename}</p>
                              <p className="text-[#555] text-[11px] mt-0.5">
                                Expires {f.usage_expires_at ? new Date(f.usage_expires_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'}
                              </p>
                            </div>
                            <Pill variant={f.usage_type === 'restricted' ? 'flagged' : 'ghost'}>
                              {f.usage_type?.replace(/_/g, ' ') ?? '—'}
                            </Pill>
                          </div>
                        ))}
                      </div>
                    </Card>
                  )}

                  {/* Unlicensed notice */}
                  {unlicensedPhotos.length > 0 && (
                    <Card>
                      <div className="px-5 py-3 border-b border-[#1a1a1a]">
                        <p className="text-[#888] text-xs font-medium uppercase tracking-wider">Photos without usage rights set</p>
                      </div>
                      <div className="px-5 py-4">
                        <p className="text-[#555] text-xs leading-relaxed">
                          {unlicensedPhotos.length} photo{unlicensedPhotos.length !== 1 ? 's' : ''} have no usage rights assigned. Open each photo in its project to set rights.
                        </p>
                      </div>
                    </Card>
                  )}

                  {expiringRights.length === 0 && unlicensedPhotos.length === 0 && (
                    <Card>
                      <div className="px-5 py-8 flex flex-col items-center text-center">
                        <ShieldCheck size={20} className="text-emerald-400 mb-2" />
                        <p className="text-white text-sm font-medium">All rights accounted for</p>
                        <p className="text-[#555] text-xs mt-1">No expiring or unlicensed media found.</p>
                      </div>
                    </Card>
                  )}
                </div>
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
                      className="bg-surface-0 border border-[#1f1f1f] text-[#888] text-xs rounded-lg pl-7 pr-3 py-2 focus:outline-none focus:border-[#333] appearance-none cursor-pointer"
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
                    className="bg-surface-0 border border-[#1f1f1f] text-[#888] text-xs rounded-lg px-3 py-2 focus:outline-none focus:border-[#333] [color-scheme:dark]"
                  />
                  <input
                    type="date"
                    value={auditDateTo}
                    onChange={(e) => setAuditDateTo(e.target.value)}
                    placeholder="To"
                    className="bg-surface-0 border border-[#1f1f1f] text-[#888] text-xs rounded-lg px-3 py-2 focus:outline-none focus:border-[#333] [color-scheme:dark]"
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
                          {(auditExpanded ? filteredLogs : filteredLogs.slice(0, 5)).map((log, i) => {
                            const metaEntries = Object.entries(log.metadata ?? {}).filter(([k]) =>
                              !['ids', 'count', 'fields', 'token', 'code'].includes(k)
                            )
                            const detailStr = metaEntries
                              .slice(0, 2)
                              .map(([k, v]) => `${k}: ${String(v)}`)
                              .join(' · ')

                            const actionColor = log.action.includes('approved')
                              ? 'var(--approved-fg)'
                              : log.action.includes('rejected')
                              ? 'var(--flagged-fg)'
                              : 'var(--text-primary)'

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
                                <td className="px-4 py-2.5 whitespace-nowrap" style={{ color: actionColor }}>
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
                    {filteredLogs.length > 5 && (
                      <div className="px-4 py-2.5 border-t border-[#111]">
                        <button
                          onClick={() => setAuditExpanded((p) => !p)}
                          className="text-[11px] transition-colors"
                          style={{ color: 'var(--text-muted)', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', padding: 0 }}
                        >
                          {auditExpanded ? 'Show less' : `Show all ${filteredLogs.length}`}
                        </button>
                      </div>
                    )}
                    {auditLogs.length === 500 && (
                      <div className="px-4 py-2.5 border-t border-[#111] text-[#2a2a2a] text-[11px]">
                        Showing the most recent 500 entries
                      </div>
                    )}
                  </Card>
                )}
              </section>

              {/* ╔══════════════════════════════════════════════════╗ */}
              {/* ║  AI & TAGGING                                    ║ */}
              {/* ╚══════════════════════════════════════════════════╝ */}
              <section className="pb-12">
                <SectionHead id="ai" icon={RefreshCw} title="AI & Tagging" subtitle="Batch-tag all unprocessed images across every project" />
                <Card>
                  <div className="flex items-center justify-between px-5 py-4">
                    <div>
                      <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>Tag all untagged images</p>
                      <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
                        Queues every untagged image across all projects for AI tagging &amp; scoring. Runs server-side — you can close this page.
                      </p>
                      {tagAllState === 'queued' && (
                        <p className="text-xs mt-1.5 text-purple-400">
                          {tagAllCount && tagAllCount > 0
                            ? `${tagAllCount} image${tagAllCount !== 1 ? 's' : ''} queued — progress shown bottom-right`
                            : 'Nothing to tag — all images are already processed.'}
                        </p>
                      )}
                    </div>
                    <button
                      onClick={tagAllUntagged}
                      disabled={tagAllState !== 'idle'}
                      className="inline-flex items-center gap-1.5 text-xs px-3 py-2 rounded shrink-0 ml-4 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                      style={{ background: 'var(--surface-2)', border: 'var(--border-rule)', color: 'var(--text-primary)', fontFamily: 'inherit', cursor: tagAllState !== 'idle' ? 'not-allowed' : 'pointer' }}
                    >
                      <RefreshCw size={11} className={tagAllState === 'queuing' ? 'animate-spin' : ''} />
                      {tagAllState === 'queuing' ? 'Queuing…' : tagAllState === 'queued' ? 'Queued' : 'Tag all untagged'}
                    </button>
                  </div>
                </Card>
              </section>

              {/* ╔══════════════════════════════════════════════════╗ */}
              {/* ║  DANGER ZONE                                     ║ */}
              {/* ╚══════════════════════════════════════════════════╝ */}
              <section className="pb-16">
                <SectionHead id="danger" icon={AlertTriangle} title="Danger zone" />

                <Card>
                  <div className="flex items-center justify-between px-5 py-4 border-b border-[#1a1a1a]">
                    <div>
                      <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>Export all data</p>
                      <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>Download a full archive of all events and media</p>
                    </div>
                    <button
                      disabled
                      title="Coming soon"
                      className="inline-flex items-center gap-1.5 text-xs px-3 py-2 rounded cursor-not-allowed opacity-40"
                      style={{ background: 'var(--surface-2)', border: 'var(--border-rule)', color: 'var(--text-primary)', fontFamily: 'inherit' }}
                    >
                      Coming soon
                    </button>
                  </div>
                  <div className="flex items-center justify-between px-5 py-4">
                    <div>
                      <p className="text-sm font-medium" style={{ color: 'var(--flagged-fg)' }}>Delete account</p>
                      <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>Permanently remove your account and all associated data</p>
                    </div>
                    <button
                      disabled
                      title="Contact support to delete your account"
                      className="inline-flex items-center gap-1.5 text-xs px-3 py-2 rounded cursor-not-allowed opacity-50"
                      style={{ background: 'var(--flagged-bg)', border: '0.5px solid var(--flagged-border)', color: 'var(--flagged-fg)', fontFamily: 'inherit' }}
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
