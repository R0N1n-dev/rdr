<script setup lang="ts">
import { App } from '@capacitor/app'
import { computed, defineAsyncComponent, nextTick, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue'
import MarkdownEditor from '../components/MarkdownEditor.vue'
import ReflowReader from '../components/ReflowReader.vue'
import SheetPanel from '../components/SheetPanel.vue'
import SheetsReader from '../components/SheetsReader.vue'
import { addBookmark, findBook, patchBook, readFile, removeBook, removeBookmark, saveProgress, writeText } from '../lib/library'
import { loadDocument } from '../lib/load'
import { exportFile, haptic } from '../lib/native'
import { saveSettings, settings } from '../lib/settings'
import { FORMAT_LABEL, type Bookmark, type Doc } from '../lib/types'
import { clamp, formatBytes, relativeDay } from '../lib/util'
import { toast, ui } from '../state'

const PdfReader = defineAsyncComponent(() => import('../components/PdfReader.vue'))

type Panel = null | 'toc' | 'find' | 'type' | 'marks' | 'actions'

const book = computed(() => findBook(ui.bookId))
const doc = shallowRef<Doc | null>(null)
const rev = ref(0)
const loading = ref(true)
const failure = ref('')
const editing = ref(false)
const chrome = ref(true)
const panel = ref<Panel>(null)

const pct = ref(0)
const pos = ref(0)
const label = ref('')
const pdfInfo = ref({ page: 1, pages: 0 })
const wordCount = ref(0)
const outline = ref<{ label: string; page: number }[]>([])

const reflowRef = ref<InstanceType<typeof ReflowReader> | null>(null)
const pdfRef = ref<{ jumpPage: (n: number, smooth?: boolean) => void } | null>(null)

const stage = ref<HTMLElement>()

const findQuery = ref('')
const findResults = ref<{ snippet: string; index: number }[]>([])
const findRan = ref(false)

const renameValue = ref('')
const removeArmed = ref(false)

const warnings = computed(() => doc.value?.warnings ?? [])

const toc = computed(() => {
  const d = doc.value
  if (!d) return []
  if (d.kind === 'reflow') return d.toc.map((t) => ({ label: t.label, depth: t.depth, target: t.target }))
  if (d.kind === 'pdf') return outline.value.map((o) => ({ label: o.label, depth: 2, target: `page:${o.page}` }))
  return []
})

const canBookmark = computed(() => doc.value?.kind === 'reflow' || doc.value?.kind === 'pdf')
const bookmarked = computed(
  () => book.value?.bookmarks.some((b) => Math.abs(b.pos - pos.value) < 0.004) ?? false,
)

const footLeft = computed(() => {
  const p = Math.round(pct.value * 100)
  if (doc.value?.kind === 'pdf') return label.value || 'Page 1'
  if (doc.value?.kind === 'sheets') return label.value
  return `${p}%${label.value ? ` · ${label.value}` : ''}`
})

const footRight = computed(() => {
  const d = doc.value
  if (!d) return ''
  if (d.kind === 'pdf') {
    const left = Math.max(0, pdfInfo.value.pages - pdfInfo.value.page)
    return left ? `${left} ${left === 1 ? 'page' : 'pages'} left` : 'Last page'
  }
  if (d.kind === 'sheets') return `${d.sheets.length} ${d.sheets.length === 1 ? 'sheet' : 'sheets'}`
  if (!wordCount.value) return ''
  // 230 wpm is a calm, adult reading pace; the estimate only needs to help.
  const minutes = Math.max(1, Math.round((wordCount.value * (1 - pct.value)) / 230))
  return minutes >= 60 ? `${Math.round(minutes / 60)} hr left` : `${minutes} min left`
})

let saveTimer: ReturnType<typeof setTimeout> | undefined

function scheduleSave() {
  clearTimeout(saveTimer)
  saveTimer = setTimeout(() => void persist(), 900)
}

async function persist() {
  const b = book.value
  if (!b || loading.value) return
  try {
    await saveProgress(b, pos.value, pct.value, label.value)
  } catch {
    // Saving progress is best-effort; reading must never break.
  }
}

function onReflowProgress(p: { pos: number; pct: number; label: string }) {
  pos.value = p.pos
  pct.value = p.pct
  label.value = p.label || label.value
  scheduleSave()
}

function onPdfProgress(p: { page: number; pages: number; pct: number }) {
  pdfInfo.value = { page: p.page, pages: p.pages }
  pos.value = p.page
  pct.value = p.pct
  label.value = `Page ${p.page} of ${p.pages}`
  scheduleSave()
}

function onSimpleProgress(p: { pos: number; pct: number; label: string }) {
  pos.value = p.pos
  pct.value = p.pct
  label.value = p.label
  scheduleSave()
}

async function load() {
  const b = book.value
  if (!b) {
    ui.view = 'library'
    return
  }
  loading.value = true
  failure.value = ''
  editing.value = false
  panel.value = null
  try {
    const rec = await readFile(b.id)
    if (!rec) throw new Error('rdr no longer has this file. Re-import it from your device.')
    const parsed = await loadDocument(b, rec.blob, rec.text)
    doc.value = parsed
    wordCount.value = parsed.kind === 'reflow' ? parsed.text.trim().split(/\s+/).filter(Boolean).length : 0
    pct.value = b.progress
    pos.value = b.pos
    if (!b.author && parsed.kind === 'reflow' && parsed.author) void patchBook(b.id, { author: parsed.author })
    if (parsed.warnings?.length) toast(parsed.warnings[0], 'info')
    if (ui.startEditing && parsed.kind === 'reflow' && parsed.editable) {
      editing.value = true
    }
    ui.startEditing = false
  } catch (err) {
    failure.value = (err as Error).message
  } finally {
    loading.value = false
  }
}

function goBack() {
  void persist()
  ui.bookId = null
  ui.view = 'library'
}

async function toggleBookmark() {
  const b = book.value
  if (!b) return
  await haptic()
  const at = b.bookmarks.find((mark) => Math.abs(mark.pos - pos.value) < 0.004)
  if (at) {
    await removeBookmark(b, at.id)
    toast('Bookmark removed')
    return
  }
  const text = label.value || (doc.value?.kind === 'pdf' ? `Page ${pdfInfo.value.page}` : `${Math.round(pct.value * 100)}%`)
  await addBookmark(b, text, pos.value)
  toast('Bookmarked', 'good')
}

async function removeMark(mark: Bookmark) {
  const b = book.value
  if (!b) return
  await removeBookmark(b, mark.id)
  toast('Bookmark removed')
}

function jump(mark: Bookmark) {
  if (doc.value?.kind === 'pdf') pdfRef.value?.jumpPage(Math.round(mark.pos))
  else reflowRef.value?.jump(mark.pos)
  panel.value = null
}

function openPanel(name: Panel) {
  panel.value = name
  if (name === 'actions' && book.value) {
    renameValue.value = book.value.title
    removeArmed.value = false
  }
  if (name === 'find') {
    findResults.value = []
    findRan.value = false
    findQuery.value = ''
  }
  void haptic()
}

/* The footer rail doubles as a scrubber: drag anywhere on it to seek. */
const seeking = ref(false)

function seekTo(clientX: number, target: HTMLElement) {
  const rect = target.getBoundingClientRect()
  if (!rect.width) return
  const ratio = clamp((clientX - rect.left) / rect.width)
  if (doc.value?.kind === 'pdf') {
    const pages = pdfInfo.value.pages || 1
    pdfRef.value?.jumpPage(Math.max(1, Math.round(ratio * pages)), false)
  } else if (doc.value?.kind === 'reflow') {
    reflowRef.value?.jump(ratio, false)
  }
}

function onSeekDown(e: PointerEvent) {
  seeking.value = true
  try {
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
  } catch {
    // Pointer already gone; the click still seeks below.
  }
  seekTo(e.clientX, e.currentTarget as HTMLElement)
}

function onSeekMove(e: PointerEvent) {
  if (!seeking.value) return
  seekTo(e.clientX, e.currentTarget as HTMLElement)
}

function onSeekKey(e: KeyboardEvent) {
  if (!['Home', 'End', 'ArrowLeft', 'ArrowRight'].includes(e.key)) return
  e.preventDefault()
  const next = e.key === 'Home' ? 0 : e.key === 'End' ? 1 : clamp(pct.value + (e.key === 'ArrowLeft' ? -0.02 : 0.02))
  if (doc.value?.kind === 'pdf') {
    pdfRef.value?.jumpPage(Math.max(1, Math.round(next * (pdfInfo.value.pages || 1))))
  } else {
    reflowRef.value?.jump(next)
  }
}

function onSeekUp(e: PointerEvent) {
  seeking.value = false
  if (e.currentTarget instanceof HTMLElement && e.currentTarget.hasPointerCapture(e.pointerId)) {
    e.currentTarget.releasePointerCapture(e.pointerId)
  }
  void persist()
}

function jumpTo(target: string) {
  panel.value = null
  if (target.startsWith('page:')) {
    pdfRef.value?.jumpPage(Number(target.slice(5)))
    return
  }
  void nextTick(() => reflowRef.value?.scrollToId(target))
}

let findTimer: ReturnType<typeof setTimeout> | undefined

function onFindInput() {
  clearTimeout(findTimer)
  findTimer = setTimeout(() => {
    const q = findQuery.value.trim()
    findResults.value = q ? (reflowRef.value?.search(q) ?? []) : []
    findRan.value = !!q
  }, 180)
}

function revealMatch(match: { index: number }) {
  panel.value = null
  reflowRef.value?.reveal(match.index)
}

function startEditing() {
  panel.value = null
  editing.value = true
  chrome.value = false
}

async function saveEdits(text: string) {
  const b = book.value
  if (!b) return
  await writeText(b, text)
  const blob = new Blob([text], { type: 'text/plain;charset=utf-8' })
  doc.value = await loadDocument(b, blob, text)
  wordCount.value = text.trim().split(/\s+/).filter(Boolean).length
  rev.value++
  editing.value = false
  chrome.value = true
  toast('Changes saved', 'good')
}

async function saveCopy() {
  const b = book.value
  if (!b) return
  try {
    const rec = await readFile(b.id)
    if (!rec) throw new Error('File data is missing.')
    const name = await exportFile(b, rec.blob, rec.text)
    toast(`Saved ${name}`, 'good')
  } catch (err) {
    toast((err as Error).message, 'warn')
  }
  panel.value = null
}

async function saveRename() {
  const b = book.value
  const title = renameValue.value.trim()
  if (!b || !title) return
  await patchBook(b.id, { title })
  toast('Title updated', 'good')
  panel.value = null
}

async function remove() {
  const b = book.value
  if (!b) return
  if (!removeArmed.value) {
    removeArmed.value = true
    return
  }
  await removeBook(b.id)
  toast('Removed from shelf', 'good')
  ui.bookId = null
  ui.view = 'library'
}

function setFont(font: typeof settings.font) {
  settings.font = font
  saveSettings()
}

function setSize(delta: number) {
  settings.fontSize = Math.min(27, Math.max(15, settings.fontSize + delta))
  saveSettings()
}

let backListenerCleanup: { remove: () => Promise<void> } | null = null
let lastScrollTop = 0

/* Screen Wake Lock: optional, silently skipped where the WebView lacks it. */
let wakeLock: WakeLockSentinel | null = null

async function releaseWakeLock() {
  const lock = wakeLock
  wakeLock = null
  try {
    await lock?.release()
  } catch {
    // Already released by the system.
  }
}

async function syncWakeLock() {
  if (!('wakeLock' in navigator)) return
  if (!settings.keepAwake || editing.value || document.hidden) {
    await releaseWakeLock()
    return
  }
  if (wakeLock) return
  try {
    wakeLock = await navigator.wakeLock.request('screen')
  } catch {
    // Battery saver or a background tab can refuse; reading still works.
  }
}

function onVisibility() {
  void syncWakeLock()
}

watch(() => [settings.keepAwake, editing.value], () => void syncWakeLock())

function onScrollCapture(e: Event) {
  const el = e.target as HTMLElement
  if (!el || el === stage.value) return
  const top = el.scrollTop
  if (top <= 4) {
    chrome.value = true
  } else if (top - lastScrollTop > 14) {
    chrome.value = false
  } else if (lastScrollTop - top > 14) {
    chrome.value = true
  }
  lastScrollTop = top
}

function onStageClick(e: MouseEvent) {
  if ((e.target as HTMLElement).closest('a, button')) return
  chrome.value = !chrome.value
}

function handleBack(): boolean {
  if (editing.value) {
    editing.value = false
    chrome.value = true
    return true
  }
  if (panel.value) {
    panel.value = null
    return true
  }
  return false
}

defineExpose({ handleBack })

watch(
  () => ui.bookId,
  (id, prev) => {
    // Split view keeps the reader mounted while another book is picked on the
    // shelf; reload instead of showing the previous document.
    if (id && id !== prev && ui.view === 'reader') void load()
  },
)

onMounted(async () => {
  await load()
  await nextTick()
  stage.value?.addEventListener('scroll', onScrollCapture, true)
  if (book.value) {
    renameValue.value = book.value.title
    pct.value = book.value.progress
  }
  backListenerCleanup = await App.addListener('appStateChange', ({ isActive }) => {
    if (!isActive) void persist()
  })
  document.addEventListener('visibilitychange', onVisibility)
  void syncWakeLock()
})

onBeforeUnmount(() => {
  clearTimeout(saveTimer)
  clearTimeout(findTimer)
  void persist()
  stage.value?.removeEventListener('scroll', onScrollCapture, true)
  document.removeEventListener('visibilitychange', onVisibility)
  void releaseWakeLock()
  void backListenerCleanup?.remove()
})
</script>

<template>
  <div class="reader" :data-read="settings.readerTheme" :class="{ 'is-editing': editing }">
    <!-- Editing mode -->
    <template v-if="editing && doc?.kind === 'reflow'">
      <header class="reader-top editing-top">
        <button class="icon-btn" aria-label="Cancel editing" @click="editing = false; chrome = true">
          <i class="bx bx-arrow-back" aria-hidden="true" />
        </button>
        <div class="rt-title">
          <span class="t">Editing</span>
          <span class="s">{{ book?.title }}</span>
        </div>
        <span class="edit-dot" />
      </header>
      <div class="reader-stage">
        <MarkdownEditor
          :text="doc.text"
          :markdown="book?.format === 'md'"
          @save="saveEdits"
          @cancel="editing = false; chrome = true"
        />
      </div>
    </template>

    <template v-else>
      <header class="reader-top" :class="{ tucked: !chrome }">
        <button class="icon-btn" aria-label="Back to shelf" @click="goBack">
          <i class="bx bx-arrow-back" aria-hidden="true" />
        </button>
        <div class="rt-title">
          <span class="t">{{ book?.title }}</span>
          <span class="s">
            <template v-if="book">
              {{ FORMAT_LABEL[book.format] }}<template v-if="book.author"> · {{ book.author }}</template>
            </template>
          </span>
        </div>
        <button
          v-if="canBookmark"
          class="icon-btn"
          :class="{ 'is-on': bookmarked }"
          :aria-label="bookmarked ? 'Remove bookmark' : 'Bookmark this spot'"
          @click="toggleBookmark"
        >
          <i :class="['bx', bookmarked ? 'bxs-bookmark' : 'bx-bookmark']" aria-hidden="true" />
        </button>
        <button class="icon-btn" aria-label="Document options" @click="openPanel('actions')">
          <i class="bx bx-dots-horizontal-rounded" aria-hidden="true" />
        </button>
      </header>

      <div ref="stage" class="reader-stage" @click="onStageClick">
        <div v-if="failure" class="failure">
          <i class="bx bx-error-circle" aria-hidden="true" />
          <h2>Can't open this document</h2>
          <p>{{ failure }}</p>
          <button class="btn btn-primary" @click="goBack">Back to shelf</button>
        </div>
        <div v-else-if="loading || !doc" class="loading-pane">
          <span class="spinner" /> Preparing the page…
        </div>
        <ReflowReader
          v-else-if="doc.kind === 'reflow'"
          :key="`${book?.id}:${rev}`"
          ref="reflowRef"
          :doc="doc"
          :start-pos="book?.pos ?? 0"
          @progress="onReflowProgress"
        />
        <PdfReader
          v-else-if="doc.kind === 'pdf'"
          :key="book?.id"
          ref="pdfRef"
          :data="doc.data"
          :start-page="book?.pos || 1"
          @progress="onPdfProgress"
          @outline="outline = $event"
        />
        <SheetsReader
          v-else-if="doc.kind === 'sheets'"
          :key="book?.id"
          :doc="doc"
          :start-sheet="book?.pos ?? 0"
          @progress="onSimpleProgress"
        />
      </div>

      <footer class="reader-foot" :class="{ tucked: !chrome }">
        <div
          v-if="doc?.kind === 'reflow' || doc?.kind === 'pdf'"
          class="progress-rail"
          role="slider"
          tabindex="0"
          aria-label="Reading position"
          aria-valuemin="0"
          aria-valuemax="100"
          :aria-valuenow="Math.round(pct * 100)"
          @pointerdown.prevent="onSeekDown"
          @pointermove="onSeekMove"
          @pointerup="onSeekUp"
          @pointercancel="onSeekUp"
          @keydown="onSeekKey"
        >
          <span :style="{ width: `${Math.min(100, Math.round(pct * 100))}%` }" />
          <i class="rail-thumb" :style="{ left: `${Math.min(100, Math.round(pct * 100))}%` }" aria-hidden="true" />
        </div>
        <div class="foot-row">
          <span class="foot-label">{{ footLeft }}</span>
          <span class="foot-count">{{ footRight }}</span>
          <div class="foot-actions">
            <button
              v-if="doc?.kind === 'reflow'"
              class="icon-btn small"
              aria-label="Text settings"
              @click.stop="openPanel('type')"
            >
              <i class="bx bx-font-size" aria-hidden="true" />
            </button>
            <button
              v-if="doc?.kind === 'reflow'"
              class="icon-btn small"
              aria-label="Find in document"
              @click.stop="openPanel('find')"
            >
              <i class="bx bx-search" aria-hidden="true" />
            </button>
            <button
              v-if="toc.length"
              class="icon-btn small"
              aria-label="Contents"
              @click.stop="openPanel('toc')"
            >
              <i class="bx bx-list-ul" aria-hidden="true" />
            </button>
            <button
              v-if="canBookmark"
              class="icon-btn small"
              aria-label="Bookmarks"
              @click.stop="openPanel('marks')"
            >
              <i class="bx bx-bookmarks" aria-hidden="true" />
            </button>
          </div>
        </div>
      </footer>
    </template>

    <!-- Contents -->
    <SheetPanel v-if="panel === 'toc'" title="Contents" icon="bx-list-ul" @close="panel = null">
      <ul class="toc">
        <li v-for="(item, i) in toc" :key="i" :style="{ paddingLeft: `${(item.depth - 1) * 14}px` }">
          <button @click="jumpTo(item.target)">{{ item.label }}</button>
        </li>
      </ul>
      <p v-if="!toc.length" class="sheet-empty">This document has no headings to list.</p>
    </SheetPanel>

    <!-- Find -->
    <SheetPanel v-if="panel === 'find'" title="Find in document" icon="bx-search" @close="panel = null">
      <label class="field find-field">
        <i class="bx bx-search" aria-hidden="true" />
        <span class="sr-only">Search text</span>
        <input v-model="findQuery" type="search" placeholder="Word or phrase" enterkeyhint="search" @input="onFindInput" />
      </label>
      <p v-if="findRan" class="find-count">
        {{ findResults.length }} {{ findResults.length === 1 ? 'match' : 'matches' }}
      </p>
      <ul class="find-list">
        <li v-for="match in findResults" :key="match.index">
          <button @click="revealMatch(match)">
            <i class="bx bx-right-arrow-alt" aria-hidden="true" />
            <span>{{ match.snippet }}</span>
          </button>
        </li>
      </ul>
      <p v-if="findRan && !findResults.length" class="sheet-empty">No matches in this document.</p>
    </SheetPanel>

    <!-- Typography -->
    <SheetPanel v-if="panel === 'type'" title="Reading comfort" icon="bx-font-size" @close="panel = null">
      <p class="section-label">Page tint</p>
      <div class="swatches">
        <button
          v-for="theme in (['paper', 'daylight', 'sepia', 'moss', 'night'] as const)"
          :key="theme"
          class="swatch"
          :class="[`sw-${theme}`, { active: settings.readerTheme === theme }]"
          :aria-pressed="settings.readerTheme === theme"
          @click="settings.readerTheme = theme; saveSettings(); haptic()"
        >
          <span class="dot" />
          {{ theme === 'paper' ? 'Theme' : theme.charAt(0).toUpperCase() + theme.slice(1) }}
        </button>
      </div>

      <p class="section-label">Typeface</p>
      <div class="font-row">
        <button
          v-for="font in (['literata', 'instrument', 'mono'] as const)"
          :key="font"
          class="font-choice"
          :class="[font, { active: settings.font === font }]"
          :aria-pressed="settings.font === font"
          @click="setFont(font)"
        >
          Aa
          <span>{{ font === 'literata' ? 'Serif' : font === 'instrument' ? 'Sans' : 'Mono' }}</span>
        </button>
      </div>

      <div class="slider-row">
        <label for="font-size">Text size</label>
        <div class="slider-control">
          <button class="size-btn" aria-label="Smaller text" @click="setSize(-1)">A−</button>
          <input id="font-size" v-model.number="settings.fontSize" type="range" min="15" max="27" step="1" @change="saveSettings" />
          <button class="size-btn" aria-label="Larger text" @click="setSize(1)">A+</button>
        </div>
        <output>{{ settings.fontSize }}px</output>
      </div>

      <div class="slider-row">
        <label for="line-height">Line spacing</label>
        <div class="slider-control">
          <input id="line-height" v-model.number="settings.lineHeight" type="range" min="1.35" max="2.05" step="0.05" @change="saveSettings" />
        </div>
        <output>{{ settings.lineHeight.toFixed(2) }}</output>
      </div>

      <label class="toggle-row">
        <span>
          Justify text
          <small>Even edges on both sides.</small>
        </span>
        <input v-model="settings.justify" type="checkbox" role="switch" @change="saveSettings" />
      </label>

      <div class="sample" :style="{ fontSize: `${settings.fontSize}px`, lineHeight: settings.lineHeight }">
        Every reader is different. Set the page until the words disappear and only the story is left.
      </div>
    </SheetPanel>

    <!-- Bookmarks -->
    <SheetPanel v-if="panel === 'marks'" title="Bookmarks" icon="bx-bookmarks" @close="panel = null">
      <button v-if="canBookmark" class="btn btn-soft mark-add" @click="toggleBookmark">
        <i :class="['bx', bookmarked ? 'bxs-bookmark' : 'bx-bookmark']" aria-hidden="true" />
        {{ bookmarked ? 'Remove bookmark here' : 'Bookmark this spot' }}
      </button>
      <ul class="marks">
        <li v-for="mark in book?.bookmarks" :key="mark.id">
          <button class="mark-main" @click="jump(mark)">
            <span class="mark-label">{{ mark.label }}</span>
            <span class="mark-meta">{{ relativeDay(mark.at) }}</span>
          </button>
          <button class="icon-btn" aria-label="Delete bookmark" @click="removeMark(mark)">
            <i class="bx bx-trash" aria-hidden="true" />
          </button>
        </li>
      </ul>
      <p v-if="!book?.bookmarks.length" class="sheet-empty">
        No bookmarks yet. Tap the bookmark icon while reading to mark a spot.
      </p>
    </SheetPanel>

    <!-- Document options -->
    <SheetPanel v-if="panel === 'actions'" title="Document" icon="bx-book" @close="panel = null">
      <div v-if="book" class="doc-info">
        <p class="doc-title">{{ book.title }}</p>
        <p class="doc-meta">
          {{ FORMAT_LABEL[book.format] }} · {{ formatBytes(book.size) }} ·
          added {{ relativeDay(book.added) }}
        </p>
        <p class="doc-file">{{ book.sourceName }}</p>
      </div>

      <label class="field rename">
        <i class="bx bx-pencil" aria-hidden="true" />
        <span class="sr-only">Rename</span>
        <input v-model="renameValue" type="text" enterkeyhint="done" @keydown.enter="saveRename" />
        <button class="btn btn-quiet" @click="saveRename">Rename</button>
      </label>

      <div class="opt-actions">
        <button v-if="doc?.kind === 'reflow' && doc.editable" class="opt" @click="startEditing">
          <i class="bx bx-pencil" aria-hidden="true" /> Edit document
        </button>
        <button class="opt" @click="saveCopy">
          <i class="bx bx-share-alt" aria-hidden="true" /> Save a copy
        </button>
        <button v-if="canBookmark" class="opt" @click="openPanel('marks')">
          <i class="bx bx-bookmarks" aria-hidden="true" /> Bookmarks ({{ book?.bookmarks.length ?? 0 }})
        </button>
        <button class="opt danger" @click="remove">
          <i class="bx bx-trash" aria-hidden="true" />
          {{ removeArmed ? 'Tap again to remove' : 'Remove from shelf' }}
        </button>
      </div>

      <div v-if="warnings.length" class="doc-notes">
        <p class="section-label">Reader notes</p>
        <p v-for="(w, i) in warnings" :key="i">{{ w }}</p>
      </div>
    </SheetPanel>
  </div>
</template>

<style scoped>
.reader {
  position: relative;
  height: 100%;
  display: flex;
  flex-direction: column;
  background: var(--read-bg);
  color: var(--read-ink);
  overflow: hidden;
}

.reader-stage {
  position: relative;
  flex: 1;
  min-height: 0;
}

.reader-stage > * {
  height: 100%;
}

.reader-top {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  z-index: 20;
  display: flex;
  align-items: center;
  gap: 2px;
  padding: 6px 8px;
  background: color-mix(in srgb, var(--read-bg) 86%, transparent);
  backdrop-filter: blur(14px) saturate(1.1);
  -webkit-backdrop-filter: blur(14px) saturate(1.1);
  border-bottom: 1px solid color-mix(in srgb, var(--read-rule) 70%, transparent);
  transition: transform 0.25s var(--ease), opacity 0.2s var(--ease);
}

.reader-top.tucked {
  transform: translateY(-104%);
  opacity: 0;
  pointer-events: none;
}

.reader-top .icon-btn {
  color: var(--read-ink);
}

.reader-top .icon-btn.is-on {
  color: var(--read-accent);
  background: var(--read-code);
}

.rt-title {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  padding: 0 6px;
  line-height: 1.25;
}

.rt-title .t {
  font-family: var(--font-display);
  font-size: 16px;
  font-weight: 550;
  letter-spacing: -0.012em;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.rt-title .s {
  font-size: 11px;
  color: var(--read-muted);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.editing-top {
  position: static;
  background: var(--read-bg);
  border-bottom-color: var(--read-rule);
}

.edit-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--pastel-peach);
  margin-right: 14px;
}

.reader-foot {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  z-index: 20;
  padding-bottom: env(safe-area-inset-bottom);
  background: color-mix(in srgb, var(--read-bg) 88%, transparent);
  backdrop-filter: blur(14px) saturate(1.1);
  -webkit-backdrop-filter: blur(14px) saturate(1.1);
  border-top: 1px solid color-mix(in srgb, var(--read-rule) 70%, transparent);
  transition: transform 0.25s var(--ease), opacity 0.2s var(--ease);
}

.reader-foot.tucked {
  transform: translateY(104%);
  opacity: 0;
  pointer-events: none;
}

.progress-rail {
  position: relative;
  height: 3px;
  margin: 6px 12px 0;
  cursor: pointer;
  touch-action: none;
  background: color-mix(in srgb, var(--read-rule) 65%, transparent);
}

.progress-rail span {
  display: block;
  height: 100%;
  background: var(--read-accent);
  transition: width 0.25s var(--ease);
}

.rail-thumb {
  position: absolute;
  top: 50%;
  width: 13px;
  height: 13px;
  margin-left: -6.5px;
  border-radius: 50%;
  background: var(--read-bg);
  border: 2px solid var(--read-accent);
  transform: translateY(-50%);
  transition: left 0.25s var(--ease);
}

.progress-rail:focus-visible {
  outline: 2px solid var(--read-accent);
  outline-offset: 6px;
}

.foot-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 2px 8px 4px 16px;
  min-height: 48px;
}

.foot-label {
  font-size: 12px;
  color: var(--read-ink);
  font-weight: 500;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.foot-count {
  font-size: 11.5px;
  color: var(--read-muted);
  font-variant-numeric: tabular-nums;
  margin-left: auto;
  flex: none;
}

.foot-actions {
  display: flex;
  gap: 0;
  flex: none;
}

.icon-btn.small {
  width: 40px;
  height: 40px;
  font-size: 20px;
  color: var(--read-ink);
}

.icon-btn.small:hover {
  background: var(--read-code);
}

.failure {
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  gap: 12px;
  padding: 30px;
}

.failure i {
  font-size: 34px;
  color: var(--read-muted);
}

.failure h2 {
  font-size: 24px;
}

.failure p {
  margin: 0;
  color: var(--read-muted);
  max-width: 38ch;
  font-size: 14px;
  line-height: 1.55;
}

/* Sheet content ---------------------------------------------- */

.toc {
  list-style: none;
  margin: 0;
  padding: 0;
}

.toc button {
  width: 100%;
  text-align: left;
  padding: 12px 4px;
  border-bottom: 1px solid var(--line);
  font-size: 14.5px;
  line-height: 1.4;
}

.toc button:active {
  color: var(--accent-ink);
}

.find-field {
  margin: 4px 0 10px;
}

.find-count {
  font-size: 12px;
  color: var(--muted);
  margin: 0 0 6px;
}

.find-list {
  list-style: none;
  margin: 0;
  padding: 0;
}

.find-list button {
  width: 100%;
  display: flex;
  gap: 10px;
  align-items: flex-start;
  text-align: left;
  padding: 11px 2px;
  border-bottom: 1px solid var(--line);
  font-size: 13.5px;
  line-height: 1.45;
  color: var(--ink-soft);
}

.find-list i {
  color: var(--accent);
  margin-top: 2px;
}

.sheet-empty {
  color: var(--muted);
  font-size: 13.5px;
  line-height: 1.5;
  padding: 18px 2px;
  margin: 0;
}

.swatches {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  gap: 6px;
  margin-bottom: 18px;
}

.swatch {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 7px;
  padding: 10px 4px;
  border-radius: 12px;
  border: 1px solid var(--line);
  font-size: 11px;
  color: var(--ink-soft);
}

.swatch .dot {
  width: 26px;
  height: 26px;
  border-radius: 50%;
  border: 1px solid rgba(35, 29, 51, 0.12);
}

.sw-paper .dot {
  background: var(--paper);
  border-color: color-mix(in srgb, var(--paper-ink) 22%, transparent);
}
.sw-daylight .dot {
  background: #fbf9ff;
}
.sw-sepia .dot {
  background: #f5ead8;
}
.sw-moss .dot {
  background: #eaf2ea;
}
.sw-night .dot {
  background: #121017;
}

.swatch.active {
  border-color: var(--accent);
  color: var(--ink);
  font-weight: 600;
}

.font-row {
  display: flex;
  gap: 8px;
  margin-bottom: 18px;
}

.font-choice {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  padding: 9px 4px;
  border-radius: 12px;
  border: 1px solid var(--line);
  font-size: 24px;
  line-height: 1.1;
}

.font-choice span {
  font-size: 10.5px;
  color: var(--muted);
}

.font-choice.literata {
  font-family: var(--font-read);
}
.font-choice.instrument {
  font-family: var(--font-ui);
}
.font-choice.mono {
  font-family: var(--font-mono);
}

.font-choice.active {
  border-color: var(--accent);
  color: var(--accent-ink);
}

.slider-row {
  display: grid;
  grid-template-columns: 96px 1fr 48px;
  align-items: center;
  gap: 10px;
  padding: 10px 0;
  font-size: 13px;
  color: var(--ink-soft);
}

.slider-control {
  display: flex;
  align-items: center;
  gap: 6px;
}

input[type='range'] {
  width: 100%;
  accent-color: var(--accent);
  min-height: 32px;
}

.size-btn {
  border: 1px solid var(--line);
  border-radius: 8px;
  min-width: 34px;
  height: 32px;
  font-size: 12px;
  color: var(--ink-soft);
}

.slider-row output {
  text-align: right;
  font-size: 11.5px;
  color: var(--muted);
  font-variant-numeric: tabular-nums;
}

.toggle-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 14px 0;
  border-top: 1px solid var(--line);
  font-size: 14px;
}

.toggle-row small {
  display: block;
  color: var(--muted);
  font-size: 11.5px;
  margin-top: 1px;
}

.toggle-row input {
  appearance: none;
  width: 46px;
  height: 27px;
  border-radius: 20px;
  background: var(--line-strong);
  position: relative;
  cursor: pointer;
  transition: background 0.18s;
  flex: none;
}

.toggle-row input::after {
  content: '';
  position: absolute;
  top: 3px;
  left: 3px;
  width: 21px;
  height: 21px;
  border-radius: 50%;
  background: #fff;
  transition: transform 0.18s var(--ease);
}

.toggle-row input:checked {
  background: var(--accent);
}

.toggle-row input:checked::after {
  transform: translateX(19px);
}

.sample {
  margin-top: 16px;
  padding: 16px;
  border-radius: 12px;
  background: var(--read-bg);
  color: var(--read-ink);
  font-family: var(--read-font);
  font-size: 17px;
}

.mark-add {
  width: 100%;
  margin-bottom: 8px;
}

.marks {
  list-style: none;
  margin: 0;
  padding: 0;
}

.marks li {
  display: flex;
  align-items: center;
  border-bottom: 1px solid var(--line);
}

.mark-main {
  flex: 1;
  text-align: left;
  padding: 12px 2px;
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.mark-label {
  font-size: 14px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.mark-meta {
  font-size: 11.5px;
  color: var(--muted);
}

.doc-info {
  padding: 4px 0 12px;
}

.doc-title {
  margin: 0 0 3px;
  font-family: var(--font-display);
  font-size: 21px;
  line-height: 1.2;
}

.doc-meta {
  margin: 0;
  font-size: 12px;
  color: var(--muted);
}

.doc-file {
  margin: 4px 0 0;
  font-size: 11px;
  color: var(--muted);
  overflow-wrap: anywhere;
}

.opt-actions {
  display: flex;
  flex-direction: column;
}

.opt {
  display: flex;
  align-items: center;
  gap: 12px;
  min-height: 50px;
  border-bottom: 1px solid var(--line);
  font-size: 15px;
  text-align: left;
  width: 100%;
}

.opt i {
  font-size: 20px;
  color: var(--muted);
  width: 22px;
}

.opt.danger {
  color: #a9384f;
}

[data-theme='dark'] .opt.danger {
  color: #ff9caf;
}

.opt.danger i {
  color: inherit;
}

.doc-notes {
  padding-top: 14px;
}

.doc-notes p {
  font-size: 12.5px;
  line-height: 1.5;
  color: var(--muted);
  margin: 0 0 6px;
}

.rename {
  margin: 4px 0 8px;
}
</style>
