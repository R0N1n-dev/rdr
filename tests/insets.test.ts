import { describe, expect, test } from 'bun:test'
import { isEdgeToEdge } from '../src/lib/insets'

describe('edge-to-edge detection', () => {
  test('portrait: full height means the WebView is behind the bars', () => {
    expect(isEdgeToEdge(390, 844, 390, 844)).toBe(true)
  })

  test('portrait: a status bar inset means the window already fits the system bars', () => {
    expect(isEdgeToEdge(390, 820, 390, 844)).toBe(false)
  })

  test('landscape: compares the short edge, not the long one', () => {
    expect(isEdgeToEdge(844, 390, 390, 844)).toBe(true)
    expect(isEdgeToEdge(844, 366, 390, 844)).toBe(false)
  })

  test('tablet landscape', () => {
    expect(isEdgeToEdge(1280, 800, 800, 1280)).toBe(true)
    expect(isEdgeToEdge(1280, 776, 800, 1280)).toBe(false)
  })
})
