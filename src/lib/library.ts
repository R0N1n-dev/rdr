import { computed, reactive } from 'vue'
import * as db from './db'
import { formatFromName, rejectionFor, sniff } from './detect'
import type { Book, Bookmark, Format, StoredFile } from './types'
import { touchStreak } from './streak'
import { makeTitle, uid } from './util'

const TINT_COUNT = 6
const MAX_BYTES = 200 * 1024 * 1024

export const library = reactive({ books: [] as Book[], ready: false })

export const shelfSize = computed(() => library.books.reduce((sum, b) => sum + b.size, 0))

const tintFor = (key: string) => {
  let hash = 0
  for (const ch of key) hash = (hash * 31 + ch.charCodeAt(0)) % 997
  return hash % TINT_COUNT
}

export function findBook(id: string | null): Book | undefined {
  return id ? library.books.find((b) => b.id === id) : undefined
}

export async function loadLibrary() {
  const rows = await db.getBooks()
  library.books = rows.sort((a, b) => b.opened - a.opened)
  library.ready = true
}

async function addStored(name: string, blob: Blob, format: Format, title: string): Promise<Book> {
  const now = Date.now()
  const book: Book = {
    id: uid(),
    title,
    author: '',
    format,
    size: blob.size,
    added: now,
    opened: now,
    progress: 0,
    pos: 0,
    posLabel: '',
    finished: false,
    tint: tintFor(name || title),
    bookmarks: [],
    sourceName: name,
    editable: format === 'md' || format === 'txt',
  }
  await db.putFile({ id: book.id, blob })
  await db.putBook(book)
  library.books.unshift(book)
  void decorate(book, blob)
  return book
}

/** Cover and metadata come from the file itself; the shelf never blocks on it. */
async function decorate(book: Book, blob: Blob) {
  if (!['epub', 'pdf', 'mobi', 'azw3'].includes(book.format)) return
  try {
    const { extractCover } = await import('./cover')
    const meta = await extractCover(book.format, await blob.arrayBuffer())
    if (!library.books.some((b) => b.id === book.id)) return
    const patch: Partial<Book> = {}
    if (meta.cover) patch.cover = meta.cover
    if (meta.title) patch.title = meta.title
    if (meta.author) patch.author = meta.author
    if (Object.keys(patch).length) await patchBook(book.id, patch)
  } catch {
    // Missing metadata is harmless; the generated cover stays.
  }
}

export async function importFiles(files: File[]): Promise<{ added: Book[]; errors: string[] }> {
  const added: Book[] = []
  const errors: string[] = []
  for (const file of files) {
    try {
      if (file.size > MAX_BYTES) throw new Error('File is larger than 200 MB.')
      let format = formatFromName(file.name)
      if (!format) {
        const head = new Uint8Array(await file.slice(0, 512).arrayBuffer())
        format = sniff(head)
      }
      if (!format) {
        throw new Error(rejectionFor(file.name) ?? 'Format not recognized.')
      }
      const duplicate = library.books.some((b) => b.sourceName === file.name && b.size === file.size)
      if (duplicate) {
        errors.push(`${file.name} is already on your shelf.`)
        continue
      }
      const book = await addStored(file.name, file, format, makeTitle(file.name))
      added.push(book)
    } catch (err) {
      errors.push(`${file.name}: ${(err as Error).message}`)
    }
  }
  return { added, errors }
}

export async function createNote(title = 'Untitled note'): Promise<Book> {
  const source = `# ${title}\n\n`
  const blob = new Blob([source], { type: 'text/markdown' })
  return addStored(`${title}.md`, blob, 'md', title)
}

export async function patchBook(id: string, patch: Partial<Book>) {
  const index = library.books.findIndex((b) => b.id === id)
  if (index < 0) return
  const next = { ...library.books[index], ...patch }
  library.books[index] = next
  await db.putBook(next)
}

export async function markOpened(id: string) {
  await patchBook(id, { opened: Date.now() })
}

export async function saveProgress(book: Book, pos: number, progress: number, label: string) {
  void touchStreak()
  await patchBook(book.id, {
    pos,
    progress,
    posLabel: label,
    finished: progress >= 0.98,
    opened: Date.now(),
  })
}

export async function removeBook(id: string) {
  library.books = library.books.filter((b) => b.id !== id)
  await db.deleteBookRow(id)
  await db.deleteFile(id)
}

export async function readFile(id: string): Promise<StoredFile | undefined> {
  return db.getFile(id)
}

export async function writeText(book: Book, text: string) {
  const blob = new Blob([text], { type: 'text/markdown;charset=utf-8' })
  await db.putFile({ id: book.id, blob, text })
  await patchBook(book.id, { size: blob.size })
}

export async function addBookmark(book: Book, label: string, pos: number): Promise<Bookmark> {
  const bookmark: Bookmark = { id: uid(), label, pos, at: Date.now() }
  await patchBook(book.id, { bookmarks: [...book.bookmarks, bookmark] })
  return bookmark
}

export async function removeBookmark(book: Book, bookmarkId: string) {
  await patchBook(book.id, { bookmarks: book.bookmarks.filter((b) => b.id !== bookmarkId) })
}

export async function clearShelf() {
  await db.clearLibrary()
  library.books = []
}

export { TINT_COUNT }
