'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Sparkles, CheckCircle2 } from 'lucide-react'
import type { MediaFileWithTags } from '@/types'

interface Props {
  untaggedImages: MediaFileWithTags[]
}

type BulkState =
  | { status: 'idle' }
  | { status: 'running'; current: number; total: number }
  | { status: 'done'; total: number }

export default function BulkRetag({ untaggedImages }: Props) {
  const router = useRouter()
  const [state, setState] = useState<BulkState>({ status: 'idle' })

  // Hide entirely once idle and nothing left to tag
  if (untaggedImages.length === 0 && state.status === 'idle') return null

  async function handleStart() {
    // Snapshot the list at click time so the loop is stable even as props refresh
    const files = untaggedImages
    if (files.length === 0) return

    setState({ status: 'running', current: 0, total: files.length })

    for (let i = 0; i < files.length; i++) {
      setState({ status: 'running', current: i + 1, total: files.length })
      try {
        await fetch('/api/tag', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            media_file_id: files[i].id,
          }),
        })
      } catch {
        // swallow per-image errors and keep going
      }
      // Refresh the gallery so this image's badge/tags appear immediately
      router.refresh()
    }

    setState({ status: 'done', total: files.length })
  }

  if (state.status === 'done') {
    return (
      <div className="flex items-center gap-2 text-emerald-400 text-sm">
        <CheckCircle2 size={15} />
        All {state.total} image{state.total !== 1 ? 's' : ''} tagged
      </div>
    )
  }

  if (state.status === 'running') {
    return (
      <div className="flex items-center gap-2 text-purple-400 text-sm">
        <Sparkles size={15} className="animate-pulse shrink-0" />
        Tagging {state.current} of {state.total}…
      </div>
    )
  }

  return (
    <button
      onClick={handleStart}
      className="inline-flex items-center gap-2 px-4 py-2 bg-white/5 hover:bg-white/10 border border-[#2a2a2a] hover:border-[#444] text-white text-sm rounded-lg transition-all"
    >
      <Sparkles size={14} className="text-purple-400 shrink-0" />
      Re-tag all
      <span className="text-[#666] text-xs">
        {untaggedImages.length} untagged
      </span>
    </button>
  )
}
