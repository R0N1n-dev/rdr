import type { Book, Doc, ReflowDoc, SheetsDoc, TocItem } from './types'

/**
 * Parsers are imported on demand. Opening the shelf must not pay for pdf.js,
 * fflate or markdown-it; each is fetched the first time a document of that
 * kind is opened, then cached by the browser.
 */

async function reflow(
  book: Book,
  html: string,
  options: { author?: string; toc?: TocItem[]; editable?: boolean; text?: string; warnings?: string[] } = {},
): Promise<ReflowDoc> {
  const { withToc } = await import('./html')
  const built = withToc(html)
  const toc = (options.toc ?? []).filter((t) => built.toc.some((h) => h.target === t.target))
  return {
    kind: 'reflow',
    title: book.title,
    author: options.author || book.author,
    html: built.html,
    toc: toc.length ? toc : built.toc,
    editable: options.editable ?? false,
    text: options.text ?? built.text,
    warnings: options.warnings ?? [],
  }
}

export async function loadDocument(book: Book, blob: Blob, storedText?: string): Promise<Doc> {
  const format = book.format

  if (format === 'pdf') {
    return { kind: 'pdf', title: book.title, data: await blob.arrayBuffer(), warnings: [] }
  }

  if (format === 'epub') {
    const { parseEpub } = await import('./epub')
    const parsed = parseEpub(await blob.arrayBuffer(), book.title)
    return reflow(book, parsed.html, { author: parsed.author, toc: parsed.toc, warnings: parsed.warnings })
  }

  if (format === 'mobi' || format === 'azw3') {
    const { parseMobi } = await import('./mobi')
    const parsed = parseMobi(await blob.arrayBuffer())
    return reflow(book, parsed.html, { author: parsed.author, warnings: parsed.warnings })
  }

  if (format === 'rtf') {
    const { parseRtf } = await import('./rtf')
    return reflow(book, parseRtf(await blob.arrayBuffer()).html)
  }

  if (format === 'csv') {
    const { parseCsv } = await import('./sheets')
    const parsed = await parseCsv(await blob.arrayBuffer())
    const doc: SheetsDoc = { kind: 'sheets', title: book.title, sheets: parsed.sheets, warnings: [] }
    return doc
  }

  if (format === 'md') {
    const [{ renderMarkdown }, source] = await Promise.all([
      import('./markdown'),
      storedText !== undefined ? Promise.resolve(storedText) : blob.text(),
    ])
    return reflow(book, renderMarkdown(source), { editable: true, text: source })
  }

  if (format === 'txt') {
    const [{ textToHtml }, source] = await Promise.all([
      import('./text'),
      storedText !== undefined ? Promise.resolve(storedText) : blob.text(),
    ])
    return reflow(book, textToHtml(source), { editable: true, text: source })
  }

  if (format === 'html') {
    const source = storedText ?? (await blob.text())
    const parsed = new DOMParser().parseFromString(source, 'text/html')
    return reflow(book, parsed.body?.innerHTML ?? source, { text: parsed.body?.textContent ?? '' })
  }

  const { escapeHtml } = await import('./text')
  return reflow(book, `<p>${escapeHtml(book.title)}</p>`, { warnings: ['This format is not supported yet.'] })
}
