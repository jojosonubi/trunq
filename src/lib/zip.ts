/**
 * Pure-JS ZIP builder — no npm dependencies.
 *
 * Uses the STORE (no-compression) method throughout, which is correct for
 * already-compressed formats like JPEG, PNG, MP4, etc.
 *
 * Supports the UTF-8 filename flag (general purpose bit 11) so accented
 * characters and spaces in event/photographer names are handled correctly
 * by all modern unzip tools.
 */

// ─── CRC-32 ───────────────────────────────────────────────────────────────────

const CRC_TABLE = (() => {
  const t = new Uint32Array(256)
  for (let i = 0; i < 256; i++) {
    let c = i
    for (let j = 0; j < 8; j++) c = c & 1 ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1)
    t[i] = c >>> 0
  }
  return t
})()

function crc32(data: Uint8Array): number {
  let crc = 0xFFFFFFFF
  for (let i = 0; i < data.length; i++) {
    crc = (CRC_TABLE[(crc ^ data[i]) & 0xFF] ^ (crc >>> 8)) >>> 0
  }
  return (crc ^ 0xFFFFFFFF) >>> 0
}

// ─── Byte-level helpers ───────────────────────────────────────────────────────

/** Build a Uint8Array from individual byte values and Uint8Array chunks. */
function b(...args: (number | Uint8Array)[]): Uint8Array {
  let total = 0
  for (const a of args) total += typeof a === 'number' ? 1 : a.length
  const out = new Uint8Array(total)
  let i = 0
  for (const a of args) {
    if (typeof a === 'number') { out[i++] = a }
    else { out.set(a, i); i += a.length }
  }
  return out
}

/** 16-bit unsigned little-endian */
function u16(v: number): [number, number] {
  return [v & 0xFF, (v >>> 8) & 0xFF]
}

/** 32-bit unsigned little-endian */
function u32(v: number): [number, number, number, number] {
  return [v & 0xFF, (v >>> 8) & 0xFF, (v >>> 16) & 0xFF, (v >>> 24) & 0xFF]
}

function concat(arrays: Uint8Array[]): Uint8Array {
  const total = arrays.reduce((n, a) => n + a.length, 0)
  const out   = new Uint8Array(total)
  let pos = 0
  for (const a of arrays) { out.set(a, pos); pos += a.length }
  return out
}

// ─── Public API ───────────────────────────────────────────────────────────────

export interface ZipEntry {
  /** Filename as it will appear inside the zip archive */
  filename: string
  data: Uint8Array
}

/**
 * Build a ZIP Blob from an array of entries.
 *
 * All entries use STORE (compression method 0) since media files are
 * already compressed — deflating them again wastes CPU with no size benefit.
 */
export function buildZip(entries: ZipEntry[]): Blob {
  const enc        = new TextEncoder()
  const localParts: Uint8Array[] = []
  const cdParts:    Uint8Array[] = []
  let offset = 0

  for (const entry of entries) {
    const name = enc.encode(entry.filename)
    const data = entry.data
    const crc  = crc32(data)
    const size = data.length

    // ── Local file header (30 bytes + filename) ──────────────────────
    const localHeader = b(
      0x50, 0x4B, 0x03, 0x04,  // PK\x03\x04 signature
      ...u16(20),               // version needed to extract: 2.0
      ...u16(0x0800),           // general purpose bit flag: UTF-8 filename
      ...u16(0),                // compression method: STORE
      ...u16(0), ...u16(0),    // last mod time / date (zero — not tracked)
      ...u32(crc),              // CRC-32
      ...u32(size),             // compressed size (= uncompressed for STORE)
      ...u32(size),             // uncompressed size
      ...u16(name.length),      // filename length
      ...u16(0),                // extra field length
      name,                     // filename bytes (UTF-8)
    )

    // ── Central directory entry (46 bytes + filename) ────────────────
    const cdEntry = b(
      0x50, 0x4B, 0x01, 0x02,  // PK\x01\x02 signature
      ...u16(20),               // version made by: 2.0
      ...u16(20),               // version needed: 2.0
      ...u16(0x0800),           // bit flag: UTF-8
      ...u16(0),                // compression: STORE
      ...u16(0), ...u16(0),    // last mod time / date
      ...u32(crc),
      ...u32(size),             // compressed size
      ...u32(size),             // uncompressed size
      ...u16(name.length),      // filename length
      ...u16(0),                // extra field length
      ...u16(0),                // file comment length
      ...u16(0),                // disk number start
      ...u16(0),                // internal file attributes
      ...u32(0),                // external file attributes
      ...u32(offset),           // relative offset of local file header
      name,
    )

    localParts.push(localHeader, data)
    cdParts.push(cdEntry)
    offset += localHeader.length + data.length
  }

  // ── End of central directory record (22 bytes) ───────────────────────
  const cdStart = offset
  const cdBytes = concat(cdParts)
  const eocd    = b(
    0x50, 0x4B, 0x05, 0x06,  // PK\x05\x06 signature
    ...u16(0),                // disk number
    ...u16(0),                // disk with start of central directory
    ...u16(entries.length),   // number of entries on this disk
    ...u16(entries.length),   // total entries
    ...u32(cdBytes.length),   // size of central directory
    ...u32(cdStart),          // offset of central directory
    ...u16(0),                // ZIP comment length
  )

  // Cast needed because TS5 narrows Uint8Array<ArrayBufferLike> more strictly
  // than the Blob constructor requires at runtime.
  return new Blob([...localParts, cdBytes, eocd] as BlobPart[], { type: 'application/zip' })
}
