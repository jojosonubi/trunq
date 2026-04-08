'use client'

import type { CSSProperties } from 'react'
import Pill from '@/components/ui/Pill'
import type { MediaFileWithTags } from '@/types'

// ─── Types ────────────────────────────────────────────────────────────────────

interface Props {
  file:    MediaFileWithTags
  onClick?: (file: MediaFileWithTags) => void
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const card: CSSProperties = {
  borderRadius: 3,
  background:   'var(--surface-1)',
  border:       'var(--border-subtle)',
  overflow:     'hidden',
  cursor:       'pointer',
  display:      'flex',
  flexDirection:'column',
  transition:   'border-color 0.15s',
}

const thumb: CSSProperties = {
  position:   'relative',
  aspectRatio: '4 / 3',
  background: 'var(--surface-2)',
  overflow:   'hidden',
}

const img: CSSProperties = {
  width:      '100%',
  height:     '100%',
  objectFit:  'cover',
  display:    'block',
}

const scoreWrap: CSSProperties = {
  position: 'absolute',
  top:      6,
  right:    6,
}

const starWrap: CSSProperties = {
  position: 'absolute',
  top:      6,
  left:     6,
}

const meta: CSSProperties = {
  padding:    '9px 10px',
  borderTop:  'var(--border-rule)',
}

const filename: CSSProperties = {
  fontSize:     10,
  color:        'var(--text-muted)',
  overflow:     'hidden',
  whiteSpace:   'nowrap' as const,
  textOverflow: 'ellipsis',
  marginBottom: 7,
}

const tags: CSSProperties = {
  display:   'flex',
  flexWrap:  'wrap' as const,
  gap:       4,
}

// ─── Star SVG ─────────────────────────────────────────────────────────────────

function StarIcon() {
  return (
    <svg
      width={12}
      height={12}
      viewBox="0 0 24 24"
      fill="var(--accent)"
      stroke="none"
      aria-hidden="true"
    >
      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
    </svg>
  )
}

// ─── PhotoCard ────────────────────────────────────────────────────────────────

export default function PhotoCard({ file, onClick }: Props) {
  const src = file.signed_url ?? file.public_url

  const displayTags = file.tags
    .filter((t) => t.tag_type !== 'ai_generated' || t.confidence == null || t.confidence >= 0.7)
    .slice(0, 6)

  return (
    <>
      <div
        style={card}
        onClick={() => onClick?.(file)}
        onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.borderColor = 'var(--text-dim)' }}
        onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.borderColor = '' }}
      >
        {/* Thumbnail */}
        <div style={thumb}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={src} alt={file.original_filename ?? file.filename} style={img} loading="lazy" />

          {/* AI score — always visible */}
          {file.quality_score != null && (
            <div style={scoreWrap}>
              <Pill variant="score">{file.quality_score}</Pill>
            </div>
          )}

          {/* Star — only if starred */}
          {file.starred && (
            <div style={starWrap}>
              <StarIcon />
            </div>
          )}
        </div>

        {/* Metadata */}
        <div style={meta}>
          <p style={filename} title={file.original_filename ?? file.filename}>
            {file.original_filename ?? file.filename}
          </p>

          <div style={tags}>
            {file.review_status === 'approved' && (
              <Pill variant="approved">approved</Pill>
            )}
            {file.review_status === 'rejected' && (
              <Pill variant="flagged">flagged</Pill>
            )}
            {displayTags.map((tag) => (
              <Pill key={tag.id} variant="ghost">{tag.value}</Pill>
            ))}
          </div>
        </div>
      </div>

      {/* ── Responsive grid class definition ──────────────────────────────── */}
      <style>{`
        .photo-grid {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 6px;
        }
        @media (max-width: 1023px) {
          .photo-grid { grid-template-columns: repeat(3, 1fr); }
        }
        @media (max-width: 767px) {
          .photo-grid { grid-template-columns: repeat(2, 1fr); }
        }
        @media (max-width: 479px) {
          .photo-grid { grid-template-columns: 1fr; }
        }
      `}</style>
    </>
  )
}

// ─── PhotoGrid ────────────────────────────────────────────────────────────────

interface GridProps {
  files:    MediaFileWithTags[]
  onSelect?: (file: MediaFileWithTags) => void
}

export function PhotoGrid({ files, onSelect }: GridProps) {
  return (
    <div className="photo-grid">
      {files.map((file) => (
        <PhotoCard key={file.id} file={file} onClick={onSelect} />
      ))}
    </div>
  )
}
