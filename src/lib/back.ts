import type { View } from '../state'

/**
 * The Android back stack, outermost first. Kept as a pure function so the
 * order can be tested without a device.
 *
 * 1. An open confirmation prompt closes.
 * 2. The reader closes its own sheet/editor, otherwise returns to the shelf.
 * 3. Settings returns to the shelf.
 * 4. The shelf closes its document sheet, otherwise asks to leave rdr.
 * Quitting only happens after the user confirms in that prompt.
 */
export interface BackActions {
  promptOpen: boolean
  view: View
  closePrompt: () => void
  readerBack: () => boolean
  shelfBack: () => boolean
  goShelf: () => void
  askExit: () => void
}

export function runBack(a: BackActions) {
  if (a.promptOpen) return a.closePrompt()

  if (a.view === 'reader') {
    if (a.readerBack()) return
    return a.goShelf()
  }

  if (a.view === 'settings') return a.goShelf()

  if (a.shelfBack()) return
  a.askExit()
}
