import type { Format } from './types'

const EXT_MAP: Record<string, Format> = {
  pdf: 'pdf',
  epub: 'epub',
  mobi: 'mobi',
  azw: 'mobi',
  prc: 'mobi',
  azw3: 'azw3',
  csv: 'csv',
  md: 'md',
  markdown: 'md',
  txt: 'txt',
  text: 'txt',
  log: 'txt',
  html: 'html',
  htm: 'html',
  xhtml: 'html',
  rtf: 'rtf',
}

export const ACCEPT =
  '.pdf,.epub,.mobi,.azw,.azw3,.csv,.md,.markdown,.txt,.html,.htm,.rtf'

/** Formats rdr deliberately does not read, with a reason for the import error. */
const REJECTED: [RegExp, string][] = [
  [/^docx?$/i, 'Word documents are not supported. Export to PDF first.'],
  [/^xlsx?$/i, 'Excel workbooks are not supported. Export to PDF first.'],
  [/^pptx?$/i, 'PowerPoint decks are not supported. Export to PDF first.'],
  [/^(odt|ods|odp)$/i, 'OpenDocument files are not supported. Export to PDF first.'],
  [/^(pages|key|numbers)$/i, 'iWork documents are not supported. Export to PDF first.'],
]

/** Message for a rejected extension, or null when the format is simply unknown. */
export function rejectionFor(name: string): string | null {
  return REJECTED.find(([pattern]) => pattern.test(extOf(name)))?.[1] ?? null
}

export function extOf(name: string): string {
  return name.split('.').pop()?.toLowerCase() ?? ''
}

export function formatFromName(name: string): Format | null {
  return EXT_MAP[extOf(name)] ?? null
}

/** Magic-byte check, used when the extension lies or is missing. */
export function sniff(bytes: Uint8Array): Format | null {
  const head = new TextDecoder('latin1').decode(bytes.subarray(0, 64))
  if (head.startsWith('%PDF')) return 'pdf'
  if (head.startsWith('{\\rtf')) return 'rtf'
  if (head.startsWith('PK')) return null // zip container: extension decides
  if (head.startsWith('BOOKMOBI') || bytes[60] === 0x42) return 'mobi'
  if (head.includes('<html') || head.includes('<!DOCTYPE html')) return 'html'
  if (bytes[0] === 0xd0 && bytes[1] === 0xcf && bytes[2] === 0x11) return null // legacy Office
  return null
}
