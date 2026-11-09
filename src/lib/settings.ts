import { Preferences } from '@capacitor/preferences'
import { reactive } from 'vue'
import { applyPalette, paletteOf, type PaletteId } from './palette'

export type AppTheme = PaletteId
export type ReaderTheme = 'paper' | 'daylight' | 'sepia' | 'moss' | 'night'
export type ReaderFont = 'literata' | 'instrument' | 'mono'

export interface Settings {
  palette: AppTheme
  autoTheme: boolean
  readerTheme: ReaderTheme
  font: ReaderFont
  fontSize: number
  lineHeight: number
  justify: boolean
  shelfGrid: boolean
  haptics: boolean
  sort: 'recent' | 'title' | 'author' | 'size'
  keepAwake: boolean
}

const KEY = 'rdr.settings'

export const settings = reactive<Settings>({
  palette: 'rdr',
  autoTheme: false,
  readerTheme: 'paper',
  font: 'literata',
  fontSize: 19,
  lineHeight: 1.7,
  justify: false,
  shelfGrid: true,
  haptics: true,
  sort: 'recent',
  keepAwake: false,
})

let saveTimer: ReturnType<typeof setTimeout> | undefined

export function saveSettings() {
  clearTimeout(saveTimer)
  saveTimer = setTimeout(() => {
    void Preferences.set({ key: KEY, value: JSON.stringify(settings) })
  }, 250)
}

export async function loadSettings() {
  try {
    const { value } = await Preferences.get({ key: KEY })
    if (!value) return
    const saved = JSON.parse(value) as Partial<Settings> & { theme?: 'system' | 'light' | 'dark' }
    // Migrate the pre-palette settings shape.
    if (!saved.palette) {
      saved.palette = saved.theme === 'dark' ? 'tech' : 'rdr'
      saved.readerTheme = 'paper'
    }
    if (!saved.readerTheme) saved.readerTheme = 'paper'
    delete saved.theme
    Object.assign(settings, saved)
  } catch {
    // First run or unavailable storage: defaults are fine.
  }
}

/* Auto mode swaps between a light and a dark palette as the system theme flips. */
const SYSTEM_DARK: PaletteId = 'tech'
const SYSTEM_LIGHT: PaletteId = 'rdr'

export function effectivePalette(): PaletteId {
  if (!settings.autoTheme || typeof window === 'undefined' || !window.matchMedia) {
    return settings.palette
  }
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? SYSTEM_DARK : SYSTEM_LIGHT
}

export function isDarkNow(): boolean {
  return paletteOf(effectivePalette()).mode === 'dark'
}

export function applyAppTheme() {
  applyPalette(effectivePalette())
}
