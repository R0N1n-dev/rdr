import { describe, expect, test } from 'bun:test'
import { formatFromName, rejectionFor, sniff } from '../src/lib/detect'
import { palmdocDecompress, parseMobi } from '../src/lib/mobi'
import { rtfToText } from '../src/lib/rtf'
import { textToHtml, escapeHtml } from '../src/lib/text'
import { makeTitle } from '../src/lib/util'

const enc = new TextEncoder()

describe('format detection', () => {
  test('maps extensions and odd casing', () => {
    expect(formatFromName('Book.EPUB')).toBe('epub')
    expect(formatFromName('notes.markdown')).toBe('md')
    expect(formatFromName('report.docx')).toBeNull()
    expect(rejectionFor('report.docx')).toContain('Word')
    expect(formatFromName('unknown.bin')).toBeNull()
  })

  test('sniffs PDF, RTF and HTML', () => {
    expect(sniff(enc.encode('%PDF-1.7'))).toBe('pdf')
    expect(sniff(enc.encode('{\\rtf1\\ansi'))).toBe('rtf')
    expect(sniff(enc.encode('<!DOCTYPE html><html>'))).toBe('html')
    expect(sniff(enc.encode('PK\u0003\u0004'))).toBeNull()
  })

  test('builds a readable title from a filename', () => {
    expect(makeTitle('the_great-gatsby.pdf')).toBe('The Great Gatsby')
    expect(makeTitle('annual_report_2025.md')).toBe('Annual Report 2025')
  })
})

describe('palmdoc decompression', () => {
  test('copies literals and back-references', () => {
    const input = new Uint8Array([0x01, 0x41, 0x42, 0x43, 0x80, 0x03])
    expect(new TextDecoder().decode(palmdocDecompress(input))).toBe('ABCABC')
  })

  test('expands the space pair', () => {
    const input = new Uint8Array([0xc1, 0xc2])
    expect(new TextDecoder().decode(palmdocDecompress(input))).toBe(' A B')
  })
})

describe('mobi container', () => {
  function makeMobi(text: string, author: string, title: string): ArrayBuffer {
    const body = new TextEncoder().encode(text)
    const headerLength = 232
    const authorBytes = enc.encode(author)
    const titleBytes = enc.encode(title)
    const exthLength = 12 + 8 + authorBytes.length
    const titleAt = 16 + headerLength + exthLength
    const rec0 = new Uint8Array(titleAt + titleBytes.length)
    const dv = new DataView(rec0.buffer)
    dv.setUint16(0, 1, false) // no compression
    dv.setUint32(4, body.length, false)
    dv.setUint16(8, 1, false) // one text record
    dv.setUint16(12, 0, false) // not encrypted
    rec0.set(enc.encode('MOBI'), 16)
    dv.setUint32(20, headerLength, false)
    dv.setUint32(28, 65001, false) // utf-8
    dv.setUint32(36, 6, false) // version
    dv.setUint32(84, titleAt, false)
    dv.setUint32(88, titleBytes.length, false)
    rec0.set(enc.encode('EXTH'), 16 + headerLength)
    dv.setUint32(16 + headerLength + 4, 12 + 8 + authorBytes.length, false)
    dv.setUint32(16 + headerLength + 8, 1, false)
    dv.setUint32(16 + headerLength + 12, 100, false)
    dv.setUint32(16 + headerLength + 16, 8 + authorBytes.length, false)
    rec0.set(authorBytes, 16 + headerLength + 20)
    rec0.set(titleBytes, titleAt)

    const records = [rec0, body]
    const headerSize = 78 + records.length * 8 + 2
    const total = headerSize + records.reduce((n, r) => n + r.length, 0)
    const buf = new Uint8Array(total)
    const out = new DataView(buf.buffer)
    buf.set(enc.encode('test'), 0)
    out.setUint16(76, records.length, false)
    let offset = headerSize
    records.forEach((record, i) => {
      out.setUint32(78 + i * 8, offset, false)
      offset += record.length
    })
    records.forEach((record, i) => buf.set(record, out.getUint32(78 + i * 8, false)))
    return buf.buffer
  }

  test('reads title, author and body text', () => {
    const book = parseMobi(
      makeMobi('<html><body><h1>Hello</h1><p>World</p></body></html>', 'Ada Lovelace', 'Notes'),
    )
    expect(book.title).toBe('Notes')
    expect(book.author).toBe('Ada Lovelace')
    expect(book.html).toContain('<h1>Hello</h1>')
    expect(book.html).not.toContain('<body')
  })
})

describe('rtf', () => {
  test('keeps text, drops font tables, honours escapes and paragraphs', () => {
    const rtf =
      '{\\rtf1\\ansi{\\fonttbl\\f0 Helvetica;}\\f0 Hello\\par World\\tab again \\u8212? done}'
    const text = rtfToText(rtf)
    expect(text).toContain('Hello')
    expect(text).toContain('World')
    expect(text).toContain('again')
    expect(text).not.toContain('Helvetica')
    expect(text).toContain('\n')
    expect(text).toContain('—')
  })
})

describe('plain text conversion', () => {
  test('escapes markup and detects headings', () => {
    const html = textToHtml('Chapter One\n\nIt was <b>late</b>.\n\nSecond paragraph.')
    expect(html).toContain('<h2>Chapter One</h2>')
    expect(html).toContain('&lt;b&gt;late&lt;/b&gt;')
    expect(html).toContain('<p>Second paragraph.</p>')
  })

  test('escapes all five entities', () => {
    expect(escapeHtml(`<&>"'`)).toBe('&lt;&amp;&gt;&quot;&#39;')
  })
})
