/**
 * pdf.js 5 uses Uint8Array.toHex/toBase64/fromBase64 and Promise.withResolvers.
 * Those are recent additions; older Android WebViews throw before drawing a page.
 * This module is imported by both the app and the PDF worker.
 */

type Binary = Uint8Array & {
  toHex?: () => string
  toBase64?: (options?: { alphabet?: 'base64' | 'base64url'; omitPadding?: boolean }) => string
}

const proto = Uint8Array.prototype as Binary

if (typeof proto.toHex !== 'function') {
  Object.defineProperty(proto, 'toHex', {
    value(this: Uint8Array) {
      let out = ''
      for (const byte of this) out += byte.toString(16).padStart(2, '0')
      return out
    },
    writable: true,
    configurable: true,
  })
}

if (typeof proto.toBase64 !== 'function') {
  Object.defineProperty(proto, 'toBase64', {
    value(this: Uint8Array, options?: { alphabet?: string; omitPadding?: boolean }) {
      let binary = ''
      for (let i = 0; i < this.length; i += 0x8000) {
        binary += String.fromCharCode(...this.subarray(i, i + 0x8000))
      }
      let out = btoa(binary)
      if (options?.alphabet === 'base64url') out = out.replace(/\+/g, '-').replace(/\//g, '_')
      if (options?.omitPadding) out = out.replace(/=+$/, '')
      return out
    },
    writable: true,
    configurable: true,
  })
}

if (typeof (Uint8Array as unknown as { fromBase64?: unknown }).fromBase64 !== 'function') {
  Object.defineProperty(Uint8Array, 'fromBase64', {
    value(value: string, options?: { alphabet?: string }) {
      let clean = options?.alphabet === 'base64url' ? value.replace(/-/g, '+').replace(/_/g, '/') : value
      while (clean.length % 4) clean += '='
      const binary = atob(clean)
      const bytes = new Uint8Array(binary.length)
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
      return bytes
    },
    writable: true,
    configurable: true,
  })
}

const PromiseCtor = Promise as unknown as { withResolvers?: () => unknown }

if (typeof PromiseCtor.withResolvers !== 'function') {
  Object.defineProperty(Promise, 'withResolvers', {
    value<T>() {
      let resolve!: (value: T | PromiseLike<T>) => void
      let reject!: (reason?: unknown) => void
      const promise = new Promise<T>((res, rej) => {
        resolve = res
        reject = rej
      })
      return { promise, resolve, reject }
    },
    writable: true,
    configurable: true,
  })
}

export {}
