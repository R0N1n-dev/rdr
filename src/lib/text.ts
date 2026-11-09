export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)
}

/** Plain text to paragraphs, with heading detection for chaptered text files. */
export function textToHtml(text: string): string {
  const lines = text.replace(/\r\n?/g, '\n').split('\n')
  const out: string[] = []
  let para: string[] = []
  const flush = () => {
    if (para.length) {
      out.push(`<p>${escapeHtml(para.join(' ')).replace(/ {2,}/g, ' ')}</p>`)
      para = []
    }
  }
  for (const raw of lines) {
    const line = raw.trimEnd()
    if (!line.trim()) {
      flush()
      continue
    }
    const heading =
      /^(chapter|part|book|section)\b[^.!?]{0,80}$/i.test(line) ||
      (/^\d{1,3}[.)]\s+\S/.test(line) && line.length < 80) ||
      (/^[A-Z0-9][^.!?]{2,70}$/.test(line) && line.length < 70 && !/[.,;]$/.test(line))
    if (heading) {
      flush()
      out.push(`<h2>${escapeHtml(line.trim())}</h2>`)
    } else {
      para.push(line)
    }
  }
  flush()
  return out.join('\n')
}

export function bytesToBase64(bytes: Uint8Array, mime: string): string {
  let binary = ''
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk))
  }
  return `data:${mime};base64,${btoa(binary)}`
}

export const IMAGE_MIME: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  gif: 'image/gif',
  webp: 'image/webp',
  svg: 'image/svg+xml',
  bmp: 'image/bmp',
}
