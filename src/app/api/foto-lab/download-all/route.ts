/**
 * POST /api/foto-lab/download-all
 *
 * Public endpoint (no auth). Accepts a list of signed URLs from the match
 * response and streams them back as a ZIP archive.
 *
 * Compression level 0 (ZipPassThrough) — JPEGs are already compressed;
 * recompressing wastes CPU.
 * Per-file errors are non-fatal: a .txt note is appended and the ZIP continues.
 */

import { NextRequest, NextResponse } from 'next/server'
import { Zip, ZipPassThrough } from 'fflate'
import { Readable } from 'stream'

// ─── Constants ────────────────────────────────────────────────────────────────

const CORS_HEADERS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Max-Age':       '86400',
}

const MAX_FILES        = 500
const FETCH_TIMEOUT_MS = 30_000

// ─── Helpers ──────────────────────────────────────────────────────────────────

function slugify(name: string | null | undefined): string {
  if (!name) return 'unknown'
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40) || 'unknown'
}

function pad(n: number, digits = 3): string {
  return String(n).padStart(digits, '0')
}

async function fetchWithTimeout(url: string): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
  try {
    return await fetch(url, { signal: controller.signal })
  } finally {
    clearTimeout(timer)
  }
}

// ─── Handler ──────────────────────────────────────────────────────────────────

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS })
}

export async function POST(request: NextRequest): Promise<Response> {
  let body: { urls?: unknown; photographers?: unknown; event_label?: unknown }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400, headers: CORS_HEADERS })
  }

  const urls          = Array.isArray(body.urls)
    ? (body.urls as unknown[]).filter((u): u is string => typeof u === 'string')
    : []
  const photographers = Array.isArray(body.photographers)
    ? (body.photographers as unknown[]).map((p) => (typeof p === 'string' ? p : null))
    : []
  const eventLabel    = typeof body.event_label === 'string' && body.event_label
    ? body.event_label
    : 'photos'

  if (urls.length === 0) {
    return NextResponse.json({ error: 'No URLs provided' }, { status: 400, headers: CORS_HEADERS })
  }

  const safeUrls = urls.slice(0, MAX_FILES)
  const zipName  = eventLabel.replace(/[^\w\s-]/g, '').replace(/\s+/g, '-').slice(0, 80) + '.zip'

  // ── Stream setup ──────────────────────────────────────────────────────────
  // fflate's Zip is push-based and works natively with Uint8Array, so we
  // wire its ondata callback directly into a Web TransformStream writer —
  // no Node PassThrough bridge needed.
  const { readable, writable } = new TransformStream<Uint8Array, Uint8Array>()
  const writer = writable.getWriter()

  const zip = new Zip()
  zip.ondata = (err, chunk, final) => {
    if (err) {
      writer.abort(err).catch(() => {})
      return
    }
    writer.write(chunk).catch(() => {})
    if (final) writer.close().catch(() => {})
  }

  // ── Build archive in background ───────────────────────────────────────────
  ;(async () => {
    for (let i = 0; i < safeUrls.length; i++) {
      const url          = safeUrls[i]
      const photographer = photographers[i] ?? null
      const filename     = `${slugify(photographer)}-${pad(i + 1)}.jpg`

      try {
        const res = await fetchWithTimeout(url)
        if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`)

        const entry = new ZipPassThrough(filename)
        zip.add(entry)

        const nodeStream = Readable.fromWeb(res.body as import('stream/web').ReadableStream)
        await new Promise<void>((resolve, reject) => {
          nodeStream.on('data', (chunk: Buffer) => {
            entry.push(new Uint8Array(chunk), false)
          })
          nodeStream.once('end', () => {
            entry.push(new Uint8Array(0), true)
            resolve()
          })
          nodeStream.once('error', reject)
        })
      } catch (err) {
        const msg      = err instanceof Error ? err.message : String(err)
        const errName  = filename.replace('.jpg', '-error.txt')
        console.warn(`[foto-lab/download-all] failed ${filename}:`, msg)

        const errEntry = new ZipPassThrough(errName)
        zip.add(errEntry)
        const encoded  = new TextEncoder().encode(`Could not download ${filename}: ${msg}\n`)
        errEntry.push(encoded, true)
      }
    }

    zip.end()
  })()

  return new Response(readable, {
    status: 200,
    headers: {
      ...CORS_HEADERS,
      'Content-Type':        'application/zip',
      'Content-Disposition': `attachment; filename="${zipName}"`,
      'Cache-Control':       'no-store',
    },
  })
}
