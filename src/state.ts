import { reactive } from 'vue'

export type View = 'library' | 'reader' | 'settings'
export type ToastTone = 'info' | 'good' | 'warn'

export const ui = reactive({
  view: 'library' as View,
  bookId: null as string | null,
  startEditing: false,
  toast: { id: 0, message: '', tone: 'info' as ToastTone },
})

let toastTimer: ReturnType<typeof setTimeout> | undefined

export function toast(message: string, tone: ToastTone = 'info') {
  ui.toast = { id: ui.toast.id + 1, message, tone }
  clearTimeout(toastTimer)
  toastTimer = setTimeout(() => {
    ui.toast = { ...ui.toast, message: '' }
  }, 2800)
}
