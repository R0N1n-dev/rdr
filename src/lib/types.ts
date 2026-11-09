export type Format =
  | 'pdf'
  | 'epub'
  | 'mobi'
  | 'azw3'
  | 'csv'
  | 'md'
  | 'txt'
  | 'html'
  | 'rtf'

export interface TocItem {
  label: string
  depth: number
  target: string
}

export interface ReflowDoc {
  kind: 'reflow'
  title: string
  author?: string
  html: string
  toc: TocItem[]
  editable: boolean
  text: string
  warnings: string[]
}

export interface PdfDoc {
  kind: 'pdf'
  title: string
  data: ArrayBuffer
  warnings: string[]
}

export interface SheetsDoc {
  kind: 'sheets'
  title: string
  sheets: { name: string; rows: string[][] }[]
  warnings: string[]
}

export type Doc = ReflowDoc | PdfDoc | SheetsDoc

export interface Bookmark {
  id: string
  label: string
  pos: number
  at: number
}

export interface Book {
  id: string
  title: string
  author: string
  format: Format
  size: number
  added: number
  opened: number
  progress: number
  pos: number
  posLabel: string
  finished: boolean
  tint: number
  bookmarks: Bookmark[]
  sourceName: string
  editable: boolean
  pageCount?: number
  /** Extracted book cover as a small JPEG data URL. */
  cover?: string
}

export interface StoredFile {
  id: string
  blob: Blob
  text?: string
}

export const FORMAT_LABEL: Record<Format, string> = {
  pdf: 'PDF',
  epub: 'EPUB',
  mobi: 'MOBI',
  azw3: 'AZW3',
  csv: 'CSV',
  md: 'Markdown',
  txt: 'Text',
  html: 'HTML',
  rtf: 'RTF',
}

export const FORMAT_EXT: Record<Format, string> = {
  pdf: 'pdf',
  epub: 'epub',
  mobi: 'mobi',
  azw3: 'azw3',
  csv: 'csv',
  md: 'md',
  txt: 'txt',
  html: 'html',
  rtf: 'rtf',
}
