import { App } from '@capacitor/app'
import { Capacitor } from '@capacitor/core'
import { Directory, Encoding, Filesystem } from '@capacitor/filesystem'
import { Haptics, ImpactStyle } from '@capacitor/haptics'
import { Share } from '@capacitor/share'
import { SplashScreen } from '@capacitor/splash-screen'
import { StatusBar, Style } from '@capacitor/status-bar'
import { isEdgeToEdge } from './insets'
import { luminance } from './palette'
import { settings } from './settings'
import { FORMAT_EXT, type Book } from './types'

export const isNative = Capacitor.isNativePlatform()

export async function openExternal(url: string) {
  if (isNative) {
    try {
      const { Browser } = await import('@capacitor/browser')
      await Browser.open({ url })
      return
    } catch {
      // Fall through to the web behaviour.
    }
  }
  window.open(url, '_blank', 'noopener')
}

export async function haptic(style: ImpactStyle = ImpactStyle.Light) {
  if (!isNative || !settings.haptics) return
  try {
    await Haptics.impact({ style })
  } catch {
    // Haptics are a bonus; never break an action over them.
  }
}

/**
 * Icon contrast follows the colour actually behind the bar: light page → dark
 * icons, dark page → light icons. Capacitor's `Style.Dark` means light content,
 * hence the naming, so keep this mapping and its tests together.
 */
export function statusBarStyle(color: string): 'DARK' | 'LIGHT' {
  const hex = /^#[0-9a-f]{6}$/i.test(color) ? color : '#ffffff'
  return luminance(hex) < 0.42 ? 'DARK' : 'LIGHT'
}

export async function syncSystemBars(color: string) {
  if (!isNative) return
  const hex = /^#[0-9a-f]{6}$/i.test(color) ? color : '#ffffff'
  try {
    await StatusBar.setStyle({ style: statusBarStyle(hex) === 'DARK' ? Style.Dark : Style.Light })
    // No-op from Android 16 on (edge-to-edge), still correct for older devices.
    await StatusBar.setBackgroundColor({ color: hex })
  } catch {
    // Older Android versions may refuse; the web UI still looks right.
  }
  await syncSafeArea()
}

/**
 * Android 15+ paints the WebView behind the status bar no matter what the
 * config says, and WebView does not expose that inset to CSS. Measure it from
 * the status-bar plugin and publish it, but only when the WebView really is
 * edge-to-edge: an inset WebView would otherwise be padded twice.
 */
export async function syncSafeArea() {
  if (!isNative) return
  const edgeToEdge = isEdgeToEdge(window.innerWidth, window.innerHeight, screen.width, screen.height)
  if (!edgeToEdge) {
    document.documentElement.style.removeProperty('--safe-top')
    return
  }
  try {
    // StatusBarInfo.height is in dp, and one CSS pixel is one dp in this WebView.
    const info = await StatusBar.getInfo()
    const top = Math.round(info.height)
    if (top > 0) document.documentElement.style.setProperty('--safe-top', `${top}px`)
  } catch {
    // No measurement: the shell keeps the CSS env() fallback.
  }
}

export async function initNative() {
  if (!isNative) return
  try {
    await SplashScreen.hide()
  } catch {
    // Splash may already be hidden.
  }
}

export async function onBack(handler: () => boolean | void): Promise<() => void> {
  // Registered on every platform: the event only fires where a system back
  // button exists, so web builds simply never call it.
  const listener = await App.addListener('backButton', () => handler())
  return () => void listener.remove()
}

export async function exitApp() {
  if (isNative) await App.exitApp()
}

function safeName(title: string, ext: string) {
  const base = title.replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80) || 'document'
  return `${base}.${ext}`
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result).split(',')[1] ?? '')
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(blob)
  })
}

/** Saves a copy into Documents (Android) or asks the browser to download it. */
export async function exportFile(book: Book, blob: Blob, text?: string, extOverride?: string): Promise<string> {
  const ext = extOverride ?? FORMAT_EXT[book.format] ?? 'txt'
  const name = safeName(book.title, ext)
  const payload = text != null ? new Blob([text], { type: 'text/plain;charset=utf-8' }) : blob

  if (isNative) {
    const data = text != null ? text : await blobToBase64(payload)
    const written = await Filesystem.writeFile({
      path: `rdr/${name}`,
      data,
      directory: Directory.Documents,
      encoding: text != null ? Encoding.UTF8 : undefined,
      recursive: true,
    })
    await Share.share({ title: book.title, url: written.uri, dialogTitle: 'Share document' })
    return name
  }

  const url = URL.createObjectURL(payload)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 4000)
  return name
}

export function pickFileInput(): HTMLInputElement {
  const input = document.createElement('input')
  input.type = 'file'
  input.multiple = true
  input.style.display = 'none'
  document.body.append(input)
  return input
}
