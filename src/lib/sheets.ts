export type Sheet = { name: string; rows: string[][] }

const MAX_ROWS = 5000
const MAX_COLS = 60

/** RFC 4180: quoted fields may hold commas, newlines and doubled quotes. */
function parseRows(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let quoted = false
  let i = 0

  const endField = () => {
    row.push(field)
    field = ''
  }
  const endRow = () => {
    endField()
    rows.push(row)
    row = []
  }

  while (i < text.length) {
    const ch = text[i]
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"'
          i += 2
          continue
        }
        quoted = false
        i++
        continue
      }
      field += ch
      i++
      continue
    }
    if (ch === '"' && field === '') {
      quoted = true
      i++
      continue
    }
    if (ch === ',') {
      endField()
      i++
      continue
    }
    if (ch === '\r') {
      i++
      continue
    }
    if (ch === '\n') {
      endRow()
      i++
      continue
    }
    field += ch
    i++
  }
  if (field || row.length) endRow()
  return rows
}

function normalize(rows: string[][]): string[][] {
  const clean = rows
    .slice(0, MAX_ROWS)
    .map((r) => r.slice(0, MAX_COLS))
    .filter((r) => r.some((cell) => cell.trim()))
  const width = Math.min(MAX_COLS, Math.max(0, ...clean.map((r) => r.length)))
  return clean.map((r) => {
    const out = r.slice(0, width)
    while (out.length < width) out.push('')
    return out
  })
}

export async function parseCsv(buffer: ArrayBuffer): Promise<{ sheets: Sheet[] }> {
  const text = new TextDecoder('utf-8').decode(buffer).replace(/^\uFEFF/, '')
  const rows = normalize(parseRows(text))
  if (!rows.length) throw new Error('This CSV file is empty.')
  return { sheets: [{ name: 'CSV', rows }] }
}
