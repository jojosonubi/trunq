'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Sparkles, CheckCircle2, RotateCcw, AlertTriangle } from 'lucide-react'
import type { MediaFileWithTags } from '@/types'

interface Props {
  /** Images that still need tagging or scoring */
  untaggedImages: MediaFileWithTags[]
  /** Called with the current set of IDs being actively processed */
  onProcessingChange?: (ids: Set<string>) => void
}

const BATCH_SIZE  = 3
const BATCH_DELAY = 500 // ms between batches

type BulkState =
  | { status: 'idle' }
  | { status: 'running'; current: number; total: number; failed: number }
  | { status: 'done'; total: number; failed: number }

export default function BulkRetag({ untaggedImages, onProcessingChange }: Props) {
  const router = useRouter()
  const [state, setState] = useState<BulkState>({ status: 'idle' })
  const [failedIds, setFailedIds] = useState<Set<string>>(new Set())

  // Keep parent in sync whenever processing IDs change
  const [processingIds, setProcessingIds] = useState<Set<string>>(new Set())
  useEffect(() => {
    onProcessingChange?.(processingIds)
  }, [processingIds, onProcessingChange])

  // Hide when idle and nothing left to process
  const failedImages = untaggedImages.filter(
    (f) => f.tagging_status === 'failed' || f.score_status === 'failed'
  )
  if (untaggedImages.length === 0 && state.status === 'idle') return null

  async function runBatch(files: MediaFileWithTags[]) {
    if (files.length === 0) return

    setState({ status: 'running', current: 0, total: files.length, failed: 0 })
    setFailedIds(new Set())

    let processed = 0
    let failed    = 0

    for (let i = 0; i < files.length; i += BATCH_SIZE) {
      const batch = files.slice(i, i + BATCH_SIZE)

      // Mark this batch as processing
      setProcessingIds(new Set(batch.map((f) => f.id)))

      await Promise.all(batch.map(async (file) => {
        try {
          const res = await fetch('/api/tag', {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify({ media_file_id: file.id }),
          })
          if (!res.ok) {
            failed++
            setFailedIds((prev) => new Set([...prev, file.id]))
          }
        } catch {
          failed++
          setFailedIds((prev) => new Set([...prev, file.id]))
        }
        processed++
        setState((s) =>
          s.status === 'running'
            ? { ...s, current: processed, failed }
            : s
        )
      }))

      // Refresh so trickle-in results appear in the grid
      router.refresh()

      // Clear processing IDs for this batch
      setProcessingIds(new Set())

      if (i + BATCH_SIZE < files.length) {
        await new Promise((res) => setTimeout(res, BATCH_DELAY))
      }
    }

    setState({ status: 'done', total: files.length, failed })
  }

  function handleStart() {
    runBatch(untaggedImages)
  }

  function handleRetryFailed() {
    const toRetry = untaggedImages.filter((f) => failedIds.has(f.id) || f.tagging_status === 'failed' || f.score_status === 'failed')
    if (toRetry.length === 0) return
    runBatch(toRetry)
  }

  if (state.status === 'done') {
    return (
      <div className="flex items-center gap-2">
        {state.failed === 0 ? (
          <span className="flex items-center gap-1.5 text-emerald-400 text-sm">
            <CheckCircle2 size={14} />
            {state.total} image{state.total !== 1 ? 's' : ''} tagged &amp; scored
          </span>
        ) : (
          <>
            <span className="flex items-center gap-1.5 text-[#888] text-sm">
              <AlertTriangle size={13} className="text-amber-400 shrink-0" />
              {state.failed} failed
            </span>
            <button
              onClick={handleRetryFailed}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white/5 hover:bg-white/10 border border-[#2a2a2a] hover:border-[#444] text-white text-xs rounded-lg transition-all"
            >
              <RotateCcw size={11} />
              Retry failed
            </button>
          </>
        )}
      </div>
    )
  }

  if (state.status === 'running') {
    return (
      <div className="flex items-center gap-2 text-purple-400 text-sm">
        <Sparkles size={14} className="animate-pulse shrink-0" />
        Tagging {state.current} of {state.total}
        {state.failed > 0 && (
          <span className="text-amber-400 text-xs">· {state.failed} failed</span>
        )}
      </div>
    )
  }

  // idle — show button if there are images to process
  const retryCount = failedImages.length
  const label = retryCount > 0 && retryCount === untaggedImages.length
    ? 'Retry failed'
    : 'Tag & Score'
  const icon  = retryCount > 0 && retryCount === untaggedImages.length
    ? <RotateCcw size={13} className="text-amber-400 shrink-0" />
    : <Sparkles  size={13} className="text-purple-400 shrink-0" />

  return (
    <button
      onClick={handleStart}
      className="inline-flex items-center gap-2 px-4 py-2 bg-white/5 hover:bg-white/10 border border-[#2a2a2a] hover:border-[#444] text-white text-sm rounded-lg transition-all"
    >
      {icon}
      {label}
      <span className="text-[#666] text-xs">
        {untaggedImages.length} image{untaggedImages.length !== 1 ? 's' : ''}
      </span>
    </button>
  )
}
