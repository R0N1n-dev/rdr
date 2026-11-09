/** Minimal promise wrapper over IndexedDB: metadata in one store, bytes in another. */
import type { Book, StoredFile } from './types'

const DB_NAME = 'rdr'
const VERSION = 1
let dbp: Promise<IDBDatabase> | null = null

function db(): Promise<IDBDatabase> {
  dbp ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, VERSION)
    req.onupgradeneeded = () => {
      const d = req.result
      if (!d.objectStoreNames.contains('books')) d.createObjectStore('books', { keyPath: 'id' })
      if (!d.objectStoreNames.contains('files')) d.createObjectStore('files', { keyPath: 'id' })
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
  return dbp
}

function run<T>(store: string, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return db().then(
    (d) =>
      new Promise<T>((resolve, reject) => {
        const tx = d.transaction(store, mode)
        const req = fn(tx.objectStore(store))
        req.onsuccess = () => resolve(req.result)
        req.onerror = () => reject(req.error)
      }),
  )
}

/** Vue's reactive proxies cannot be stored in IndexedDB, so store a plain copy. */
export const putBook = (book: Book) =>
  run('books', 'readwrite', (s) => s.put(JSON.parse(JSON.stringify(book)) as Book))
export const getBooks = () => run<Book[]>('books', 'readonly', (s) => s.getAll())
export const deleteBookRow = (id: string) => run('books', 'readwrite', (s) => s.delete(id))

export async function putFile(file: StoredFile) {
  await run('files', 'readwrite', (s) => s.put(file))
}

export function getFile(id: string) {
  return run<StoredFile | undefined>('files', 'readonly', (s) => s.get(id))
}

export async function deleteFile(id: string) {
  await run('files', 'readwrite', (s) => s.delete(id))
}

export async function clearLibrary() {
  await run('books', 'readwrite', (s) => s.clear())
  await run('files', 'readwrite', (s) => s.clear())
}

export async function estimateUsage() {
  if (!navigator.storage?.estimate) return 0
  const { usage } = await navigator.storage.estimate()
  return usage ?? 0
}
