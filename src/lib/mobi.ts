/**
 * MOBI / AZW3 reader.
 * Handles uncompressed and PalmDOC-compressed text records. DRM and
 * Huffman-compressed books are impossible to open without the vendor key, so
 * they fail with a readable message instead of empty pages.
 */

const utf8 = new TextDecoder('utf-8')
const cp1252 = new TextDecoder('windows-1252')

export function palmdocDecompress(input: Uint8Array, size = input.length * 4 + 32): Uint8Array {
  let out = new Uint8Array(Math.max(size, 32))
  let o = 0
  const ensure = (need: number) => {
    if (o + need <= out.length) return
    const next = new Uint8Array(Math.max(out.length * 2, o + need))
    next.set(out.subarray(0, o))
    out = next
  }
  let i = 0
  while (i < input.length) {
    const c = input[i++]
    if (c === 0) {
      ensure(1)
      out[o++] = 0
    } else if (c <= 8) {
      ensure(c)
      out.set(input.subarray(i, i + c), o)
      o += c
      i += c
    } else if (c <= 0x7f) {
      ensure(1)
      out[o++] = c
    } else if (c <= 0xbf) {
      if (i >= input.length) break
      const pair = (c << 8) | input[i++]
      const distance = pair & 0x3fff
      const length = (pair >> 3 & 0x07) + 3
      if (distance === 0 || distance > o) continue
      ensure(length)
      for (let k = 0; k < length; k++) {
        out[o] = out[o - distance]
        o++
      }
    } else {
      ensure(2)
      out[o++] = 0x20
      out[o++] = c ^ 0x80
    }
  }
  return out.slice(0, o)
}

function u16(b: DataView, at: number) {
  return b.getUint16(at, false)
}
function u32(b: DataView, at: number) {
  return b.getUint32(at, false)
}

function decodeText(bytes: Uint8Array, codepage: number): string {
  return codepage === 65001 ? utf8.decode(bytes) : cp1252.decode(bytes)
}

export interface MobiResult {
  title: string
  author: string
  html: string
  warnings: string[]
}

export function parseMobi(buffer: ArrayBuffer): MobiResult {
  const view = new DataView(buffer)
  const bytes = new Uint8Array(buffer)
  const warnings: string[] = []

  if (view.byteLength < 100) throw new Error('File is too small to be a MOBI book.')
  const recordCount = u16(view, 76)
  if (!recordCount || recordCount > 100000) throw new Error('Not a valid MOBI/Palm database.')

  const offsets: number[] = []
  for (let i = 0; i < recordCount; i++) {
    const at = 78 + i * 8
    if (at + 4 > view.byteLength) break
    offsets.push(u32(view, at))
  }
  const record = (i: number) => {
    const start = offsets[i]
    const end = i + 1 < offsets.length ? offsets[i + 1] : bytes.length
    return bytes.subarray(start, end)
  }

  const first = record(0)
  if (!first || first.length < 16) throw new Error('Missing MOBI header.')
  const fv = new DataView(first.buffer, first.byteOffset, first.byteLength)
  const compression = u16(fv, 0)
  const textLength = u32(fv, 4)
  const textRecords = u16(fv, 8)
  const encryption = u16(fv, 12)

  if (encryption !== 0) throw new Error('This book is DRM-protected. rdr cannot open encrypted books.')
  if (compression === 17480) {
    throw new Error('This book uses Huffman compression, which rdr does not unpack yet. Try an EPUB edition.')
  }

  const mobiAt = 16
  const hasMobi = first.length > 40 && String.fromCharCode(...first.subarray(16, 20)) === 'MOBI'
  let codepage = 1252
  let version = 0
  let title = ''
  let exthTitle = ''
  let author = ''

  if (hasMobi) {
    const mobiLength = u32(fv, mobiAt + 4)
    codepage = u32(fv, mobiAt + 12) || 1252
    version = u32(fv, mobiAt + 20)
    const titleOffset = first.length >= 84 ? u32(fv, 84) : 0
    const titleLength = first.length >= 88 ? u32(fv, 88) : 0
    if (titleOffset && titleLength && titleOffset + titleLength <= first.length) {
      title = decodeText(first.subarray(titleOffset, titleOffset + titleLength), codepage).trim()
    }

    const exthAt = mobiAt + mobiLength
    if (exthAt + 12 < first.length && String.fromCharCode(...first.subarray(exthAt, exthAt + 4)) === 'EXTH') {
      const count = u32(fv, exthAt + 8)
      let p = exthAt + 12
      for (let i = 0; i < count && p + 8 <= first.length; i++) {
        const type = u32(fv, p)
        const size = u32(fv, p + 4)
        if (size < 8 || p + size > first.length) break
        const data = first.subarray(p + 8, p + size)
        if (type === 503) exthTitle = decodeText(data, codepage).trim()
        if (type === 100) author = decodeText(data, codepage).trim()
        p += size
      }
    }
  }

  const parts: Uint8Array[] = []
  for (let i = 1; i <= textRecords && i < offsets.length; i++) {
    const raw = record(i)
    parts.push(compression === 2 ? palmdocDecompress(raw) : raw)
  }
  let total = 0
  for (const p of parts) total += p.length
  const merged = new Uint8Array(total)
  let at = 0
  for (const p of parts) {
    merged.set(p, at)
    at += p.length
  }

  let html = decodeText(textLength ? merged.subarray(0, Math.min(textLength, merged.length)) : merged, codepage)
  html = html.replace(/\u0000/g, '')

  const bodyStart = html.search(/<body[^>]*>/i)
  const bodyEnd = html.toLowerCase().lastIndexOf('</body>')
  if (bodyStart >= 0 && bodyEnd > bodyStart) {
    html = html.slice(html.indexOf('>', bodyStart) + 1, bodyEnd)
  } else {
    html = html.replace(/<\?xml[^>]*>/gi, '').replace(/<head[\s\S]*?<\/head>/gi, '')
  }
  html = html
    .replace(/<mbp:pagebreak[^>]*>/gi, '<hr>')
    .replace(/<\/?mbp:[^>]*>/gi, '')
    .replace(/<img[^>]*recindex[^>]*>/gi, '<p class="note">[image]</p>')

  if (version >= 8 || /kindle:embed/.test(html)) {
    warnings.push('AZW3/KF8 layout flattened to reflowable text. Fixed layouts and some images are simplified.')
  }
  if (!html.trim()) throw new Error('No readable text found in this book.')

  return { title: exthTitle || title, author, html, warnings }
}
