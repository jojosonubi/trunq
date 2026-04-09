'use client'

import { useState } from 'react'
import { Sparkles, RotateCcw, CheckCircle2 } from 'lucide-react'
import type { MediaFileWithTags } from '@/types'
import { saveTaggingJob } from './TaggingProgress'

interface Props {
  /** Images that still need tagging — determines button label/count */
  untaggedImages: MediaFileWithTags[]
  /** event_id to pass to the batch endpoint */
  eventId: string
}

type State = 'idle' | 'queuing' | 'queued'

export default function BulkRetag({ untaggedImages, eventId }: Props) {
  const [state, setState] = useState<State>('idle')

  // Hide when idle and nothing to process
  if (untaggedImages.length === 0 && state === 'idle') return null

  const failedCount = untaggedImages.filter(
    (f) => f.tagging_status === 'failed' || f.score_status === 'failed'
  ).length

  const isAllFailed = failedCount > 0 && failedCount === untaggedImages.length
  const label       = isAllFailed ? 'Retry failed' : 'Tag & Score'
  const icon        = isAllFailed
    ? <RotateCcw size={13} className="text-amber-400 shrink-0" />
    : <Sparkles  size={13} className="text-purple-400 shrink-0" />

  async function handleStart() {
    setState('queuing')
    try {
      const res = await fetch('/api/tag/batch', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ event_id: eventId }),
      })
      const json = await res.json() as { queued?: number }
      if ((json.queued ?? 0) > 0) {
        saveTaggingJob({ total: json.queued!, startedAt: Date.now(), eventId })
        setState('queued')
      } else {
        setState('idle')
      }
    } catch {
      setState('idle')
    }
  }

  if (state === 'queued') {
    return (
      <span className="flex items-center gap-1.5 text-purple-400 text-sm">
        <CheckCircle2 size={13} />
        Queued — running in background
      </span>
    )
  }

  return (
    <button
      onClick={handleStart}
      disabled={state === 'queuing'}
      className="inline-flex items-center gap-2 px-4 py-2 bg-white/5 hover:bg-white/10 border border-[#2a2a2a] hover:border-[#444] text-white text-sm rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed"
    >
      {icon}
      {state === 'queuing' ? 'Queuing…' : label}
      {state === 'idle' && (
        <span className="text-[#666] text-xs">
          {untaggedImages.length} image{untaggedImages.length !== 1 ? 's' : ''}
        </span>
      )}
    </button>
  )
}
