'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { CheckCircle2, AlertCircle, RefreshCw, HardDrive } from 'lucide-react'
import type { BackupStats } from '@/app/api/backup/route'

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', {
    day: 'numeric', month: 'short', year: 'numeric',
  })
}

export default function BackupClient({ stats }: { stats: BackupStats }) {
  const router = useRouter()
  const [retrying, setRetrying] = useState<Set<string>>(new Set())
  const [retryingAll, setRetryingAll] = useState(false)

  const coverage = stats.total === 0 ? 100 : Math.round((stats.backed_up / stats.total) * 100)
  const allGood  = stats.missing === 0

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
      setRetrying((prev) => {
        const next = new Set(prev)
        next.delete(id)
        return next
      })
    }
  }

  async function retryAll() {
    if (retryingAll || stats.missing_files.length === 0) return
    setRetryingAll(true)
    try {
      for (const file of stats.missing_files) {
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

  return (
    <div className="space-y-8">
      {/* ── Stats cards ─────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'Total files',  value: stats.total,     sub: 'in main bucket'   },
          { label: 'Backed up',    value: stats.backed_up, sub: 'in media-backup'  },
          { label: 'Missing',      value: stats.missing,   sub: 'not yet copied'   },
        ].map(({ label, value, sub }) => (
          <div key={label} className="bg-surface-0 border border-[#1f1f1f] rounded-xl px-5 py-4">
            <p className="text-white text-2xl font-semibold tabular-nums">{value.toLocaleString()}</p>
            <p className="text-white text-xs font-medium mt-1">{label}</p>
            <p className="text-[#444] text-[11px] mt-0.5">{sub}</p>
          </div>
        ))}
      </div>

      {/* ── Coverage bar ────────────────────────────────────────────────────── */}
      <div className="bg-surface-0 border border-[#1f1f1f] rounded-xl px-5 py-4">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            {allGood
              ? <CheckCircle2 size={14} className="text-emerald-400" />
              : <AlertCircle  size={14} className="text-amber-400"   />}
            <span className="text-white text-sm font-medium">
              {allGood ? 'All files backed up' : `${coverage}% coverage`}
            </span>
          </div>
          <span className="text-[#555] text-xs tabular-nums">{stats.backed_up} / {stats.total}</span>
        </div>
        <div className="h-1.5 bg-surface-0 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-500 ${
              allGood ? 'bg-emerald-500' : coverage >= 80 ? 'bg-blue-500' : 'bg-amber-400'
            }`}
            style={{ width: `${coverage}%` }}
          />
        </div>
      </div>

      {/* ── Missing files list ──────────────────────────────────────────────── */}
      {stats.missing > 0 && (
        <section>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-white text-sm font-semibold flex items-center gap-2">
              <HardDrive size={14} className="text-[#555]" />
              Missing backups
              {stats.missing > stats.missing_files.length && (
                <span className="text-[#555] text-xs font-normal">
                  (showing {stats.missing_files.length} of {stats.missing})
                </span>
              )}
            </h2>
            <button
              onClick={retryAll}
              disabled={retryingAll}
              className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 border border-[#1f1f1f] text-[#555] hover:text-white hover:border-[#333] rounded-lg transition-all disabled:opacity-40"
            >
              <RefreshCw size={11} className={retryingAll ? 'animate-spin' : ''} />
              {retryingAll ? 'Retrying all…' : `Retry all (${stats.missing_files.length})`}
            </button>
          </div>

          <div className="space-y-2">
            {stats.missing_files.map((file) => (
              <div
                key={file.id}
                className="flex items-center gap-4 bg-surface-0 border border-[#1f1f1f] rounded-xl px-4 py-3"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-[#888] text-sm truncate">{file.filename}</p>
                  <p className="text-[#444] text-xs mt-0.5 font-mono truncate">{file.storage_path}</p>
                  <p className="text-[#333] text-xs mt-0.5">Uploaded {formatDate(file.created_at)}</p>
                </div>
                <button
                  onClick={() => retryOne(file.id)}
                  disabled={retrying.has(file.id) || retryingAll}
                  className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 border border-[#1f1f1f] text-[#555] hover:text-white hover:border-[#333] rounded-lg transition-all disabled:opacity-40 shrink-0"
                >
                  <RefreshCw size={11} className={retrying.has(file.id) ? 'animate-spin' : ''} />
                  {retrying.has(file.id) ? 'Copying…' : 'Retry backup'}
                </button>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}
