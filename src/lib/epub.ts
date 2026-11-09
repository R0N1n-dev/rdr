import { strFromU8, unzipSync } from 'fflate'
import { IMAGE_MIME, bytesToBase64 } from './text'
import type { TocItem } from './types'

export interface ParsedReflow {
  title: string
  author: string
  html: string
  toc: TocItem[]
  warnings: string[]
}

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

const dirOf = (path: string) => path.slice(0, path.lastIndexOf('/') + 1)

/** OOXML/XHTML files are XML; the HTML parser would swallow their self-closing tags. */
function parseMarkup(source: string, mode: DOMParserSupportedType): Document {
  const doc = new DOMParser().parseFromString(source, mode)
  if (mode === 'text/xml' && doc.querySelector('parsererror')) {
    return new DOMParser().parseFromString(source, 'text/html')
  }
  return doc
}

const byName = (root: Document | Element, name: string) =>
  Array.from(root.getElementsByTagName('*')).filter((el) => el.localName === name)

export function parseEpub(buffer: ArrayBuffer, fallbackTitle: string): ParsedReflow {
  const files = unzipSync(new Uint8Array(buffer))
  const read = (path: string) => (path && files[path] ? strFromU8(files[path]) : '')
  const container = read('META-INF/container.xml')
  const opfPath = /full-path="([^"]+)"/.exec(container)?.[1]
  if (!opfPath) throw new Error('This EPUB is missing its package file.')

  const opf = parseMarkup(read(opfPath), 'text/xml')
  if (opf.documentElement.localName !== 'package') throw new Error('This EPUB package file is unreadable.')

  const title = byName(opf, 'title')[0]?.textContent?.trim() || fallbackTitle
  const author = byName(opf, 'creator')[0]?.textContent?.trim() || ''

  const base = dirOf(opfPath)
  const manifest = new Map<string, { href: string; type: string; properties: string }>()
  for (const item of byName(opf, 'item')) {
    const id = item.getAttribute('id')
    const href = item.getAttribute('href')
    if (!id || !href) continue
    manifest.set(id, {
      href: joinPath(base, href),
      type: item.getAttribute('media-type') ?? '',
      properties: item.getAttribute('properties') ?? '',
    })
  }

  const spine = byName(opf, 'itemref')
    .map((r) => r.getAttribute('idref'))
    .filter((id): id is string => {
      const item = id ? manifest.get(id) : undefined
      return !!item && (item.type.includes('xhtml') || /\.x?html?$/i.test(item.href))
    })

  const navPath = [...manifest.values()].find((m) => m.properties.includes('nav'))?.href
  const ncxId = byName(opf, 'spine')[0]?.getAttribute('toc')
  const ncxPath = ncxId ? manifest.get(ncxId)?.href : undefined

  const warnings: string[] = []
  const spineIndex = new Map<string, number>()
  spine.forEach((id, i) => spineIndex.set(manifest.get(id)!.href, i))

  let imageBudget = 12 * 1024 * 1024
  const resolveImages = (doc: Document, chapterDir: string) => {
    for (const img of Array.from(doc.querySelectorAll('img, image'))) {
      const attr = img.getAttribute('src') ?? img.getAttribute('xlink:href') ?? img.getAttribute('href')
      if (!attr || /^(https?:|data:)/.test(attr)) continue
      const path = joinPath(chapterDir, attr)
      const data = files[path]
      if (!data) continue
      const ext = path.split('.').pop()?.toLowerCase() ?? ''
      const mime = IMAGE_MIME[ext]
      if (!mime || data.length > imageBudget) continue
      imageBudget -= data.length
      const url = bytesToBase64(data, mime)
      if (img.tagName === 'image') {
        img.setAttribute('xlink:href', url)
        img.setAttribute('href', url)
      } else {
        img.setAttribute('src', url)
      }
    }
  }

  const chapters: string[] = []
  for (let i = 0; i < spine.length; i++) {
    const item = manifest.get(spine[i])!
    const source = read(item.href)
    if (!source) continue
    const doc = new DOMParser().parseFromString(source, 'text/html')
    const body = doc.body
    if (!body) continue
    const chapterDir = dirOf(item.href)

    for (const el of Array.from(body.querySelectorAll<HTMLElement>('[id]'))) {
      el.id = `c${i}-${el.id}`
    }
    resolveImages(doc, chapterDir)

    for (const a of Array.from(body.querySelectorAll('a[href]'))) {
      const href = a.getAttribute('href')!
      if (/^(https?:|mailto:|tel:)/i.test(href)) continue
      const [file, frag] = href.split('#')
      if (!file) {
        if (frag) a.setAttribute('href', `#c${i}-${frag}`)
        else a.removeAttribute('href')
        continue
      }
      const target = joinPath(chapterDir, file)
      const targetIndex = spineIndex.get(target)
      if (targetIndex === undefined) {
        a.replaceWith(...Array.from(a.childNodes))
        continue
      }
      a.setAttribute('href', frag ? `#c${targetIndex}-${frag}` : `#ch-${targetIndex}`)
    }

    chapters.push(`<section class="chapter" id="ch-${i}">${body.innerHTML}</section>`)
  }

  if (!chapters.length) throw new Error('This EPUB has no readable chapters.')

  // Table of contents: EPUB nav, then NCX, then heading scan.
  const toc: TocItem[] = []
  if (navPath) {
    const nav = parseMarkup(read(navPath), 'text/xml')
    const navDir = dirOf(navPath)
    const scope = byName(nav, 'nav')[0] ?? nav.documentElement
    for (const a of Array.from(scope.querySelectorAll('a[href]'))) {
      const href = a.getAttribute('href') ?? ''
      const label = a.textContent?.replace(/\s+/g, ' ').trim()
      if (!label) continue
      const [file, frag] = href.split('#')
      const targetPath = file ? joinPath(navDir, file) : navPath
      const idx = spineIndex.get(targetPath)
      if (idx === undefined) continue
      const target = frag ? `c${idx}-${frag}` : `ch-${idx}`
      toc.push({ label, depth: 2, target })
    }
  } else if (ncxPath) {
    const ncx = parseMarkup(read(ncxPath), 'text/xml')
    const ncxDir = dirOf(ncxPath)
    for (const point of byName(ncx, 'navPoint')) {
      const label = byName(point, 'text')[0]?.textContent?.trim()
      const href = byName(point, 'content')[0]?.getAttribute('src') ?? ''
      if (!label) continue
      const [file, frag] = href.split('#')
      const idx = spineIndex.get(joinPath(ncxDir, file))
      if (idx === undefined) continue
      toc.push({ label, depth: 2, target: frag ? `c${idx}-${frag}` : `ch-${idx}` })
    }
  }

  if (/pre-paginated/.test(opf.documentElement.outerHTML)) {
    warnings.push('This is a fixed-layout EPUB. Pages are reflowed to fit your screen.')
  }

  return { title, author, html: chapters.join('\n'), toc, warnings }
}
