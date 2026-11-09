import { Preferences } from '@capacitor/preferences'
import { reactive } from 'vue'

const KEY = 'rdr.streak'

export const streak = reactive({ count: 0, last: '' })

function dayKey(d = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export async function loadStreak() {
  try {
    const { value } = await Preferences.get({ key: KEY })
    if (value) Object.assign(streak, JSON.parse(value))
  } catch {
    // First run or unavailable storage: no streak yet.
  }
}

/** Call whenever the reader makes progress; cheap no-op after the first touch of the day. */
export async function touchStreak() {
  const today = dayKey()
  if (streak.last === today) return
  const yesterday = new Date()
  yesterday.setDate(yesterday.getDate() - 1)
  streak.count = streak.last === dayKey(yesterday) ? streak.count + 1 : 1
  streak.last = today
  try {
    await Preferences.set({ key: KEY, value: JSON.stringify({ count: streak.count, last: streak.last }) })
  } catch {
    // Cosmetic data; never break reading over it.
  }
}
