import { describe, expect, test } from 'bun:test'
import { statusBarStyle } from '../src/lib/native'
import { PALETTES, buildTheme } from '../src/lib/palette'

describe('status bar icons', () => {
  test('dark icons on light surfaces', () => {
    expect(statusBarStyle('#f1ecf0')).toBe('LIGHT')
    expect(statusBarStyle('#ffffff')).toBe('LIGHT')
  })

  test('light icons on dark surfaces', () => {
    expect(statusBarStyle('#131839')).toBe('DARK')
    expect(statusBarStyle('#0b0910')).toBe('DARK')
  })

  test('every palette gets the opposite of its own brightness', () => {
    for (const palette of PALETTES) {
      const theme = buildTheme(palette)
      const shelf = statusBarStyle(theme.vars['--bg'])
      const paper = statusBarStyle(theme.vars['--paper'])
      expect(shelf).toBe(theme.dark ? 'DARK' : 'LIGHT')
      expect(paper).toBe(theme.dark ? 'DARK' : 'LIGHT')
    }
  })

  test('fixed page tints stay readable in either theme', () => {
    // Daylight paper is light even inside a dark palette, so icons flip there.
    expect(statusBarStyle('#fbf9ff')).toBe('LIGHT')
    expect(statusBarStyle('#121017')).toBe('DARK')
  })
})
