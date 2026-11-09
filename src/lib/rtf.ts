import { textToHtml } from './text'

/** Rich Text Format: control words stripped, paragraphs and escapes preserved. */
export function rtfToText(source: string): string {
  const skipDestinations = new Set(['fonttbl', 'colortbl', 'stylesheet', 'info', 'pict', 'header', 'footer', 'object'])
  let out = ''
  let depth = 0
  let skipDepth = -1
  let i = 0
  const cp1252 = new TextDecoder('windows-1252')

  while (i < source.length) {
    const c = source[i]
    if (c === '{') {
      depth++
      i++
      continue
    }
    if (c === '}') {
      if (skipDepth === depth) skipDepth = -1
      depth = Math.max(0, depth - 1)
      i++
      continue
    }
    if (c === '\\') {
      const next = source[i + 1]
      if (next === "'") {
        const hex = source.slice(i + 2, i + 4)
        if (skipDepth < 0) out += cp1252.decode(new Uint8Array([parseInt(hex, 16) || 63]))
        i += 4
        continue
      }
      if (next === '\\' || next === '{' || next === '}') {
        if (skipDepth < 0) out += next
        i += 2
        continue
      }
      if (next === '*') {
        skipDepth = depth
        i += 2
        continue
      }
      const m = /^\\([a-zA-Z]+)(-?\d+)? ?/.exec(source.slice(i))
      if (!m) {
        i += 2
        continue
      }
      const word = m[1]
      if (skipDestinations.has(word)) skipDepth = depth
      if (skipDepth < 0) {
        if (word === 'par' || word === 'line') out += '\n'
        else if (word === 'tab') out += '\t'
        else if (word === 'u' && m[2]) out += String.fromCharCode(Number(m[2]) < 0 ? Number(m[2]) + 65536 : Number(m[2]))
        else if (word === 'emdash') out += '—'
        else if (word === 'endash') out += '–'
        else if (word === 'lquote') out += '‘'
        else if (word === 'rquote') out += '’'
        else if (word === 'ldblquote') out += '“'
        else if (word === 'rdblquote') out += '”'
      }
      i += m[0].length
      continue
    }
    if (c === '\r' || c === '\n') {
      i++
      continue
    }
    if (skipDepth < 0) out += c
    i++
  }
  return out
}

export function parseRtf(buffer: ArrayBuffer): { html: string } {
  const source = new TextDecoder('latin1').decode(buffer)
  const html = textToHtml(rtfToText(source).replace(/\t/g, '    '))
  if (!html.trim()) throw new Error('No readable text in this RTF file.')
  return { html }
}
