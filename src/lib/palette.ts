/**
 * Palette engine.
 *
 * Every theme is described by three brand colours and a mode. Tokens are
 * derived from them with contrast enforced, so a palette can flood the UI
 * with colour and still keep text readable (WCAG AA at the smallest sizes).
 */

export type PaletteId =
  | 'rdr'
  | 'corporate'
  | 'retail'
  | 'eco'
  | 'cyber'
  | 'editorial'
  | 'trio'
  | 'tech'
  | 'pastel'
  | 'earthy'

export interface Palette {
  id: PaletteId
  name: string
  hint: string
  primary: string
  secondary: string
  accent: string
  mode: 'light' | 'dark'
}

export const PALETTES: Palette[] = [
  {
    id: 'rdr',
    name: 'Reader Ink',
    hint: 'Violet on paper',
    primary: '#5b3db2',
    secondary: '#231d33',
    accent: '#8b6ad8',
    mode: 'light',
  },
  {
    id: 'corporate',
    name: 'Corporate',
    hint: 'Navy & electric blue',
    primary: '#1e2761',
    secondary: '#408ec6',
    accent: '#408ec6',
    mode: 'light',
  },
  {
    id: 'retail',
    name: 'Retail Rush',
    hint: 'Charcoal & tangerine',
    primary: '#2c3e50',
    secondary: '#e67e22',
    accent: '#e67e22',
    mode: 'light',
  },
  {
    id: 'eco',
    name: 'Eco Organic',
    hint: 'Forest & moss',
    primary: '#2c5f2d',
    secondary: '#97bc62',
    accent: '#97bc62',
    mode: 'dark',
  },
  {
    id: 'cyber',
    name: 'Cyber',
    hint: 'Ink black & neon lime',
    primary: '#1a1a1a',
    secondary: '#c1dd13',
    accent: '#c1dd13',
    mode: 'dark',
  },
  {
    id: 'editorial',
    name: 'Editorial',
    hint: 'Cherry red & blush',
    primary: '#cc313d',
    secondary: '#f7c5cc',
    accent: '#cc313d',
    mode: 'light',
  },
  {
    id: 'trio',
    name: 'Midnight Trio',
    hint: 'Navy, royal, burgundy',
    primary: '#1e2761',
    secondary: '#408ec6',
    accent: '#7a2048',
    mode: 'dark',
  },
  {
    id: 'tech',
    name: 'Bright Tech',
    hint: 'Slate, mint, coral',
    primary: '#2d3047',
    secondary: '#2ec4b6',
    accent: '#ff7a59',
    mode: 'dark',
  },
  {
    id: 'pastel',
    name: 'Pastel Play',
    hint: 'Lavender, sky, bubblegum',
    primary: '#b298e7',
    secondary: '#b8e3e9',
    accent: '#f5b8d5',
    mode: 'light',
  },
  {
    id: 'earthy',
    name: 'Earthy',
    hint: 'Sage, alabaster, terracotta',
    primary: '#4a5842',
    secondary: '#efebe4',
    accent: '#d98a6c',
    mode: 'light',
  },
]

export function paletteOf(id: string | undefined): Palette {
  return PALETTES.find((p) => p.id === id) ?? PALETTES[0]
}

type Rgb = [number, number, number]

function toRgb(hex: string): Rgb {
  const h = hex.replace('#', '').trim()
  const s = h.length === 3 ? h.replace(/./g, '$&$&') : h.padEnd(6, '0')
  return [parseInt(s.slice(0, 2), 16), parseInt(s.slice(2, 4), 16), parseInt(s.slice(4, 6), 16)]
}

const clamp = (n: number) => Math.max(0, Math.min(255, Math.round(n)))

function toHex([r, g, b]: Rgb): string {
  return `#${[r, g, b].map((v) => clamp(v).toString(16).padStart(2, '0')).join('')}`
}

/** t is how much of b ends up in the result. */
export function mix(a: string, b: string, t: number): string {
  const A = toRgb(a)
  const B = toRgb(b)
  return toHex([A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t, A[2] + (B[2] - A[2]) * t])
}

export function alpha(hex: string, a: number): string {
  const [r, g, b] = toRgb(hex)
  return `rgba(${r}, ${g}, ${b}, ${a})`
}

const channel = (v: number) => {
  const s = v / 255
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
}

export function luminance(hex: string): number {
  const [r, g, b] = toRgb(hex)
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)
}

export function contrast(a: string, b: string): number {
  const la = luminance(a)
  const lb = luminance(b)
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05)
}

/** Nudge a colour toward black or white until it clears `min` contrast. */
export function readable(color: string, against: string, min = 4.6): string {
  return readableAll(color, [against], min)
}

/** Same, but the colour must clear every background it can sit on. */
export function readableAll(color: string, against: string[], min = 4.6): string {
  if (against.every((bg) => contrast(color, bg) >= min)) return color
  const avg = against.reduce((sum, bg) => sum + luminance(bg), 0) / against.length
  const target = avg > 0.4 ? '#000000' : '#ffffff'
  let lo = 0
  let hi = 1
  for (let i = 0; i < 18; i++) {
    const mid = (lo + hi) / 2
    if (against.every((bg) => contrast(mix(color, target, mid), bg) >= min)) hi = mid
    else lo = mid
  }
  return mix(color, target, hi)
}

export interface PaletteTheme {
  dark: boolean
  vars: Record<string, string>
}

export function buildTheme(p: Palette): PaletteTheme {
  const dark = p.mode === 'dark'
  const bg = dark ? mix(p.primary, '#07060a', 0.46) : mix('#ffffff', mix(p.primary, p.secondary, 0.26), 0.24)
  const surface = dark ? mix(bg, '#ffffff', 0.055) : mix(bg, '#ffffff', 0.64)
  const surface2 = dark ? mix(bg, '#ffffff', 0.095) : mix(bg, '#ffffff', 0.42)
  const surface3 = dark ? mix(bg, '#ffffff', 0.15) : mix(bg, '#ffffff', 0.24)
  const ink = dark ? mix('#ffffff', p.primary, 0.06) : mix('#17131c', p.primary, 0.3)
  const inkSoft = dark ? mix('#ffffff', p.primary, 0.24) : mix(ink, bg, 0.32)
  const surfaceInk = readableAll(inkSoft, [surface, bg], 4.6)
  const muted = readableAll(dark ? mix(bg, ink, 0.62) : mix(ink, bg, 0.55), [surface, bg], 4.6)
  const line = dark ? mix(bg, '#ffffff', 0.16) : mix(bg, ink, 0.15)
  const lineStrong = dark ? mix(bg, '#ffffff', 0.27) : mix(bg, ink, 0.28)

  // Fills and rules need 3:1, so the accent keeps its identity.
  const accent = readable(p.accent, surface, 3)
  const accentSoft = dark ? mix(bg, accent, 0.22) : mix('#ffffff', accent, 0.16)
  const accentInk = readableAll(accent, [accentSoft, surface, bg], 4.6)
  const onAccent =
    contrast('#0d0a12', accent) >= contrast('#ffffff', accent) ? '#0d0a12' : '#ffffff'

  // Reading paper keeps the hue of the theme, gently.
  const paper = dark ? mix('#0b0910', p.primary, 0.2) : mix('#fffcf6', p.primary, 0.085)
  const paperSurface = dark ? mix(paper, '#ffffff', 0.055) : mix(paper, '#ffffff', 0.5)
  const paperInk = dark ? mix('#f1ece2', p.primary, 0.05) : mix('#171219', p.primary, 0.16)
  const paperInkSoft = dark ? mix(paperInk, paper, 0.2) : mix(paperInk, paper, 0.26)
  const paperMuted = readableAll(mix(paper, paperInk, 0.55), [paper, paperSurface], 4.6)
  const paperRule = dark ? mix(paper, paperInk, 0.17) : mix(paper, paperInk, 0.15)
  const paperAccent = readableAll(accent, [paper, paperSurface], 4.6)
  const paperCode = dark ? mix(paper, paperInk, 0.07) : mix(paper, paperInk, 0.05)

  const shadowInk = dark ? '#000000' : ink
  const wash = dark ? mix(bg, p.secondary, 0.42) : mix(bg, accent, 0.38)

  return {
    dark,
    vars: {
      '--bg': bg,
      '--bg-deep': dark ? mix(bg, '#000000', 0.25) : mix(bg, ink, 0.07),
      '--wash': alpha(wash, dark ? 0.45 : 0.38),
      '--surface': surface,
      '--surface-2': surface2,
      '--surface-3': surface3,
      '--ink': ink,
      '--ink-soft': surfaceInk,
      '--muted': muted,
      '--line': line,
      '--line-strong': lineStrong,
      '--accent': accent,
      '--accent-ink': accentInk,
      '--accent-soft': accentSoft,
      '--on-accent': onAccent,
      '--danger': readableAll(dark ? '#ff9caf' : '#b3263c', [surface, bg], 4.6),
      '--shadow-sheet': `0 -18px 60px ${alpha(shadowInk, dark ? 0.6 : 0.22)}`,
      '--shadow-float': `0 10px 24px ${alpha(shadowInk, dark ? 0.5 : 0.16)}`,
      '--speck': dark ? 'rgba(255, 255, 255, 0.04)' : alpha(ink, 0.045),
      '--paper': paper,
      '--paper-surface': paperSurface,
      '--paper-ink': paperInk,
      '--paper-ink-soft': paperInkSoft,
      '--paper-muted': paperMuted,
      '--paper-rule': paperRule,
      '--paper-accent': paperAccent,
      '--paper-code': paperCode,
    },
  }
}

export function applyPalette(id: PaletteId) {
  const palette = paletteOf(id)
  const theme = buildTheme(palette)
  const root = document.documentElement
  for (const [key, value] of Object.entries(theme.vars)) root.style.setProperty(key, value)
  root.dataset.theme = theme.dark ? 'dark' : 'light'
  root.dataset.palette = palette.id
  root.style.colorScheme = theme.dark ? 'dark' : 'light'
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme.vars['--bg'])
}

/** Preview colours for the theme picker. */
export function previewOf(p: Palette) {
  const theme = buildTheme(p)
  return {
    bg: theme.vars['--bg'],
    surface: theme.vars['--surface'],
    ink: theme.vars['--ink'],
    accent: theme.vars['--accent'],
    dark: theme.dark,
  }
}
