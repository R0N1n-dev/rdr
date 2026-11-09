/**
 * Cover extraction for imported books. Covers are rendered down to a small
 * JPEG data URL so the shelf can paint instantly from IndexedDB.
 */
import { strFromU8, unzipSync } from 'fflate'
import type { Format } from './types'

const COVER_WIDTH = 420

type Bitmap = { width: number; height: number; draw: (ctx: CanvasRenderingContext2D) => void }

async function decode(bytes: Uint8Array, mime: string): Promise<Bitmap | null> {
  const blob = new Blob([bytes as BlobPart], { type: mime })
  if (typeof createImageBitmap === 'function') {
    try {
      const bitmap = await createImageBitmap(blob)
      return {
        width: bitmap.width,
        height: bitmap.height,
        draw: (ctx) => ctx.drawImage(bitmap, 0, 0),
      }
    } catch {
      // SVG covers and some exotic encodings need the <img> path.
    }
  }
  const url = URL.createObjectURL(blob)
  try {
    const img = new Image()
    img.src = url
    await img.decode()
    return {
      width: img.naturalWidth,
      height: img.naturalHeight,
      draw: (ctx) => ctx.drawImage(img, 0, 0),
    }
  } catch {
    return null
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 5000)
  }
}

async function shrink(bytes: Uint8Array, mime: string): Promise<string | undefined> {
  const bitmap = await decode(bytes, mime)
  if (!bitmap?.width || !bitmap.height) return undefined
  const scale = Math.min(1, COVER_WIDTH / bitmap.width)
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(bitmap.width * scale))
  canvas.height = Math.max(1, Math.round(bitmap.height * scale))
  const ctx = canvas.getContext('2d')
  if (!ctx) return undefined
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.save()
  ctx.scale(scale, scale)
  bitmap.draw(ctx)
  ctx.restore()
  return canvas.toDataURL('image/jpeg', 0.74)
}

const IMAGE_MIME: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  gif: 'image/gif',
  webp: 'image/webp',
  svg: 'image/svg+xml',
  bmp: 'image/bmp',
}

const mimeOf = (path: string) => IMAGE_MIME[path.split('.').pop()?.toLowerCase() ?? ''] ?? ''

const dirOf = (path: string) => path.slice(0, path.lastIndexOf('/') + 1)

function joinPath(base: string, href: string): string {
  const clean = href.split('#')[0].split('?')[0]
  const parts = (clean.startsWith('/') ? clean.slice(1) : `${base}${clean}`).split('/')
  const out: string[] = []
  for (const p of parts) {
    if (!p || p === '.') continue
    if (p === '..') out.pop()
    else out.push(p)
  }
  return out.join('/')
}

export interface CoverMeta {
  cover?: string
  title?: string
  author?: string
}

function epubMeta(buffer: ArrayBuffer): CoverMeta & { coverPath?: string; files: Record<string, Uint8Array> } {
  const files = unzipSync(new Uint8Array(buffer))
  const read = (path: string) => (path && files[path] ? strFromU8(files[path]) : '')
  const opfPath = /full-path="([^"]+)"/.exec(read('META-INF/container.xml'))?.[1]
  if (!opfPath) return { files }
  const opf = new DOMParser().parseFromString(read(opfPath), 'text/xml')
  if (opf.querySelector('parsererror')) return { files }

  const all = Array.from(opf.getElementsByTagName('*'))
  const named = (name: string) => all.filter((el) => el.localName === name)
  const base = dirOf(opfPath)
  const items = named('item').map((item) => ({
    id: item.getAttribute('id') ?? '',
    href: joinPath(base, item.getAttribute('href') ?? ''),
    type: item.getAttribute('media-type') ?? '',
    properties: item.getAttribute('properties') ?? '',
  }))
  const metaCoverId = named('meta').find((m) => m.getAttribute('name') === 'cover')?.getAttribute('content')
  const coverItem =
    items.find((i) => i.properties.includes('cover-image')) ??
    items.find((i) => i.id === metaCoverId) ??
    items.find((i) => i.type.startsWith('image/') && /cover/i.test(i.href))

  return {
    files,
    coverPath: coverItem?.href,
    title: named('title')[0]?.textContent?.trim() || undefined,
    author: named('creator')[0]?.textContent?.trim() || undefined,
  }
}

async function epubCover(buffer: ArrayBuffer): Promise<CoverMeta> {
  const { files, coverPath, title, author } = epubMeta(buffer)
  const bytes = coverPath ? files[coverPath] : undefined
  const mime = coverPath ? mimeOf(coverPath) : ''
  return { title, author, cover: bytes && mime ? await shrink(bytes, mime) : undefined }
}

async function pdfCover(buffer: ArrayBuffer): Promise<CoverMeta> {
  const pdfjs = await import('pdfjs-dist')
  const worker = await import('./pdf-worker.ts?worker&url')
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default
  const task = pdfjs.getDocument({ data: buffer.slice(0) })
  try {
    const doc = await task.promise
    const page = await doc.getPage(1)
    const base = page.getViewport({ scale: 1 })
    const viewport = page.getViewport({ scale: Math.min(2, COVER_WIDTH / base.width) })
    const canvas = document.createElement('canvas')
    canvas.width = Math.floor(viewport.width)
    canvas.height = Math.floor(viewport.height)
    const context = canvas.getContext('2d')
    if (!context) return {}
    context.fillStyle = '#ffffff'
    context.fillRect(0, 0, canvas.width, canvas.height)
    await page.render({ canvasContext: context, viewport }).promise
    return { cover: canvas.toDataURL('image/jpeg', 0.74) }
  } finally {
    void task.destroy()
  }
}

/** MOBI stores the cover as a normal image record; EXTH 201 holds its offset. */
async function mobiCover(buffer: ArrayBuffer): Promise<CoverMeta> {
  const view = new DataView(buffer)
  const bytes = new Uint8Array(buffer)
  if (bytes.length < 200) return {}
  const recordCount = view.getUint16(76, false)
  if (!recordCount || recordCount > 100000 || 78 + recordCount * 8 > bytes.length) return {}
  const offsets: number[] = []
  for (let i = 0; i < recordCount; i++) offsets.push(view.getUint32(78 + i * 8, false))

  const first = offsets[0]
  const fv = new DataView(buffer, first)
  if (String.fromCharCode(...bytes.subarray(first + 16, first + 20)) !== 'MOBI') return {}
  const mobiLength = fv.getUint32(20, false)
  const firstImage = fv.getUint32(108, false)
  const exthAt = 16 + mobiLength
  if (String.fromCharCode(...bytes.subarray(first + exthAt, first + exthAt + 4)) !== 'EXTH') return {}

  const count = fv.getUint32(exthAt + 8, false)
  let coverOffset = -1
  for (let i = 0, p = exthAt + 12; i < count && p + 8 <= fv.byteLength; i++) {
    const type = fv.getUint32(p, false)
    const size = fv.getUint32(p + 4, false)
    if (size < 8 || p + size > fv.byteLength) break
    if (type === 201) coverOffset = fv.getUint32(p + 8, false)
    p += size
  }
  if (coverOffset < 0 || !firstImage) return {}

  const index = firstImage + coverOffset
  const start = offsets[index]
  if (start === undefined) return {}
  const end = offsets[index + 1] ?? bytes.length
  const image = bytes.subarray(start, end)
  const mime = image[0] === 0xff && image[1] === 0xd8 ? 'image/jpeg'
    : image[0] === 0x89 && image[1] === 0x50 ? 'image/png'
      : image[0] === 0x47 && image[1] === 0x49 ? 'image/gif'
        : ''
  return mime ? { cover: await shrink(image, mime) } : {}
}

/** Best effort: any failure just leaves the generated cover art in place. */
export async function extractCover(format: Format, buffer: ArrayBuffer): Promise<CoverMeta> {
  try {
    if (format === 'epub') return await epubCover(buffer)
    if (format === 'pdf') return await pdfCover(buffer)
    if (format === 'mobi' || format === 'azw3') return await mobiCover(buffer)
  } catch {
    // A broken cover must never block the import.
  }
  return {}
}
