import DOMPurify from 'dompurify'
import type { TocItem } from './types'

DOMPurify.addHook('afterSanitizeAttributes', (node) => {
  if (node.tagName === 'A' && node.getAttribute('href')) {
    node.setAttribute('target', '_blank')
    node.setAttribute('rel', 'noopener noreferrer nofollow')
  }
})

export function sanitize(html: string): string {
  return DOMPurify.sanitize(html, {
    FORBID_TAGS: ['script', 'style', 'iframe', 'object', 'embed', 'form', 'input', 'button', 'link', 'meta', 'base'],
    FORBID_ATTR: ['srcset', 'onerror', 'onload'],
    ADD_ATTR: ['target'],
    ALLOW_DATA_ATTR: false,
  })
}

const slug = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60)

/**
 * Assign stable ids to headings and derive a table of contents.
 * Runs once per open, so the reader can jump without re-parsing.
 */
export function withToc(html: string): { html: string; toc: TocItem[]; text: string } {
  const doc = new DOMParser().parseFromString(`<div id="rdr-root">${html}</div>`, 'text/html')
  const root = doc.getElementById('rdr-root')
  if (!root) return { html: sanitize(html), toc: [], text: '' }

  const toc: TocItem[] = []
  const seen = new Map<string, number>()
  for (const h of root.querySelectorAll<HTMLElement>('h1, h2, h3, h4')) {
    const label = h.textContent?.replace(/\s+/g, ' ').trim()
    if (!label) continue
    let id = slug(label) || 'section'
    const n = seen.get(id) ?? 0
    seen.set(id, n + 1)
    if (n) id = `${id}-${n + 1}`
    h.id = id
    toc.push({ label, depth: Number(h.tagName[1]), target: id })
  }

  return {
    html: sanitize(root.innerHTML),
    toc,
    text: root.textContent?.replace(/\s+/g, ' ').trim() ?? '',
  }
}
