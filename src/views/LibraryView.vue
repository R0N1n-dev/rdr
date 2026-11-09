<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue'
import BookCover from '../components/BookCover.vue'
import RdrMark from '../components/RdrMark.vue'
import SheetPanel from '../components/SheetPanel.vue'
import { ACCEPT } from '../lib/detect'
import {
  clearShelf,
  createNote,
  findBook,
  importFiles,
  library,
  markOpened,
  patchBook,
  readFile,
  removeBook,
  shelfSize,
} from '../lib/library'
import { exportFile, haptic, pickFileInput } from '../lib/native'
import { saveSettings, settings } from '../lib/settings'
import { streak } from '../lib/streak'
import { FORMAT_LABEL, type Book } from '../lib/types'
import { formatBytes, relativeDay } from '../lib/util'
import { toast, ui } from '../state'

type Filter = 'all' | 'reading' | 'finished'

const query = ref('')
const filter = ref<Filter>('all')
const sortOpen = ref(false)
const optionsFor = ref<Book | null>(null)
const removeArmed = ref(false)
const wipeArmed = ref(false)
const renameValue = ref('')
const busy = ref(false)
const dropActive = ref(false)
let dragDepth = 0

const pct = (book: Book) => Math.min(100, Math.max(0, Math.round(book.progress * 100)))

const SORTS: { value: typeof settings.sort; label: string; hint: string }[] = [
  { value: 'recent', label: 'Recently read', hint: 'Most recent first' },
  { value: 'title', label: 'Title', hint: 'A to Z' },
  { value: 'author', label: 'Author', hint: 'A to Z, untitled last' },
  { value: 'size', label: 'Largest', hint: 'Biggest files first' },
]

const sorted = computed(() => {
  const list = [...library.books]
  switch (settings.sort) {
    case 'title':
      return list.sort((a, b) => a.title.localeCompare(b.title))
    case 'author':
      return list.sort((a, b) => (a.author || '\uffff').localeCompare(b.author || '\uffff') || a.title.localeCompare(b.title))
    case 'size':
      return list.sort((a, b) => b.size - a.size)
    default:
      return list.sort((a, b) => b.opened - a.opened)
  }
})

const sortLabel = computed(() => SORTS.find((s) => s.value === settings.sort)?.label ?? 'Recently read')

function pickSort(value: typeof settings.sort) {
  settings.sort = value
  saveSettings()
  sortOpen.value = false
  void haptic()
}

async function toggleFinished(book: Book) {
  if (book.finished) await patchBook(book.id, { finished: false, progress: 0, pos: 0, posLabel: '' })
  else await patchBook(book.id, { finished: true, progress: 1 })
  optionsFor.value = null
  await haptic()
  toast(book.finished ? 'Marked unread' : 'Marked finished', 'good')
}

const current = computed(() => sorted.value.find((b) => !b.finished && b.opened > b.added + 1000))

const filtered = computed(() => {
  const q = query.value.trim().toLowerCase()
  return sorted.value.filter((book) => {
    if (filter.value === 'reading' && (book.finished || book.progress === 0)) return false
    if (filter.value === 'finished' && !book.finished) return false
    if (!q) return true
    return (
      book.title.toLowerCase().includes(q) ||
      book.author.toLowerCase().includes(q) ||
      FORMAT_LABEL[book.format].toLowerCase().includes(q) ||
      book.sourceName.toLowerCase().includes(q)
    )
  })
})

const stats = computed(() => {
  const finished = library.books.filter((b) => b.finished).length
  return `${library.books.length} ${library.books.length === 1 ? 'document' : 'documents'}${
    finished ? `, ${finished} finished` : ''
  } · ${formatBytes(shelfSize.value)}`
})

const counts = computed(() => ({
  all: library.books.length,
  reading: library.books.filter((b) => !b.finished && b.progress > 0).length,
  finished: library.books.filter((b) => b.finished).length,
}))

async function open(book: Book) {
  await haptic()
  await markOpened(book.id)
  ui.bookId = book.id
  ui.view = 'reader'
}

async function handleFiles(files: File[]) {
  if (!files.length) return
  busy.value = true
  try {
    const { added, errors } = await importFiles(files)
    if (errors.length) toast(errors[0], 'warn')
    if (added.length) {
      await haptic()
      toast(added.length === 1 ? `Added ${added[0].title}` : `Added ${added.length} documents`, 'good')
      if (added.length === 1) await open(added[0])
    }
  } catch (err) {
    toast((err as Error).message, 'warn')
  } finally {
    busy.value = false
  }
}

function pick() {
  const input = pickFileInput()
  input.accept = ACCEPT
  input.onchange = () => {
    const files = Array.from(input.files ?? [])
    input.remove()
    void handleFiles(files)
  }
  input.click()
}

async function newNote() {
  const book = await createNote()
  await haptic()
  await open(book)
  ui.startEditing = true
}

/** Back button: close the document sheet before anything else. */
function handleBack(): boolean {
  if (sortOpen.value) {
    sortOpen.value = false
    return true
  }
  if (optionsFor.value) {
    optionsFor.value = null
    return true
  }
  return false
}

defineExpose({ handleBack })

function showOptions(book: Book) {
  optionsFor.value = book
  removeArmed.value = false
  wipeArmed.value = false
  renameValue.value = book.title
}

async function saveRename() {
  const book = optionsFor.value
  const title = renameValue.value.trim()
  if (!book) return
  if (!title || title === book.title) {
    optionsFor.value = null
    return
  }
  await patchBook(book.id, { title })
  toast('Title updated', 'good')
  optionsFor.value = null
}

async function remove(book: Book) {
  await removeBook(book.id)
  if (ui.bookId === book.id) ui.bookId = null
  optionsFor.value = null
  await haptic()
  toast('Removed from shelf', 'good')
}

async function exportCopy(book: Book) {
  try {
    const rec = await readFile(book.id)
    if (!rec) throw new Error('File data is missing.')
    const name = await exportFile(book, rec.blob, rec.text)
    toast(`Saved ${name}`, 'good')
  } catch (err) {
    toast((err as Error).message, 'warn')
  }
  optionsFor.value = null
}

function toggleGrid() {
  settings.shelfGrid = !settings.shelfGrid
  saveSettings()
  void haptic()
}

function onDragEnter(e: DragEvent) {
  e.preventDefault()
  dragDepth++
  dropActive.value = true
}

function onDragLeave() {
  dragDepth = Math.max(0, dragDepth - 1)
  if (!dragDepth) dropActive.value = false
}

async function onDrop(e: DragEvent) {
  e.preventDefault()
  dragDepth = 0
  dropActive.value = false
  await handleFiles(Array.from(e.dataTransfer?.files ?? []))
}

onBeforeUnmount(() => {
  optionsFor.value = null
})

async function wipeLibrary() {
  if (!wipeArmed.value) {
    wipeArmed.value = true
    return
  }
  await clearShelf()
  wipeArmed.value = false
  toast('Shelf cleared', 'good')
  optionsFor.value = null
}

const selected = computed(() => (optionsFor.value ? findBook(optionsFor.value.id) : null))
</script>

<template>
  <div class="library" @dragenter="onDragEnter" @dragover.prevent @dragleave="onDragLeave" @drop="onDrop">
    <header class="topbar shell">
      <div class="brand">
        <RdrMark :size="27" />
        <span>rdr</span>
      </div>
      <div class="top-actions">
        <button class="icon-btn" aria-label="New note" title="New note" @click="newNote">
          <i class="bx bx-edit-alt" aria-hidden="true" />
        </button>
        <button
          class="icon-btn"
          aria-label="Settings"
          title="Settings"
          @click="ui.view = 'settings'"
        >
          <i class="bx bx-slider-alt" aria-hidden="true" />
        </button>
      </div>
    </header>

    <main class="shell main">
      <div class="page-head">
        <h1>Your shelf</h1>
        <p class="stats">{{ stats }}</p>
        <span v-if="streak.count" class="streak" :title="`${streak.count}-day reading streak`">
          <i class="bx bx-flame" aria-hidden="true" />
          {{ streak.count }} {{ streak.count === 1 ? 'day' : 'days' }}
        </span>
      </div>

      <section v-if="current && filter === 'all' && !query" class="resume" :class="`tint-${current.tint % 6}`">
        <div class="resume-spine" />
        <div class="resume-cover">
          <BookCover :book="current" />
        </div>
        <div class="resume-text">
          <p class="resume-kicker">Continue reading</p>
          <h2>{{ current.title }}</h2>
          <p class="resume-meta">
            <span>{{ current.author || FORMAT_LABEL[current.format] }}</span>
            <span>{{ pct(current) }}% read</span>
          </p>
          <div class="resume-bar" role="img" :aria-label="`${pct(current)} percent read`">
            <span :style="{ width: `${Math.max(2, pct(current))}%` }" />
          </div>
        </div>
        <button class="btn btn-primary resume-cta" @click="open(current)">
          {{ pct(current) ? 'Resume' : 'Start reading' }}
        </button>
      </section>

      <div class="search-row">
        <label class="field">
          <i class="bx bx-search" aria-hidden="true" />
          <span class="sr-only">Search your shelf</span>
          <input v-model="query" type="search" placeholder="Search title, author, format" enterkeyhint="search" />
          <button v-if="query" class="clear" aria-label="Clear search" @click="query = ''">
            <i class="bx bx-x" aria-hidden="true" />
          </button>
        </label>
        <button
          class="icon-btn view-toggle"
          :aria-label="`Sort shelf, currently ${sortLabel}`"
          :title="`Sort: ${sortLabel}`"
          @click="sortOpen = true"
        >
          <i class="bx bx-sort-alt-2" aria-hidden="true" />
        </button>
        <button
          class="icon-btn view-toggle"
          :aria-label="settings.shelfGrid ? 'Show list view' : 'Show cover view'"
          :title="settings.shelfGrid ? 'List view' : 'Cover view'"
          @click="toggleGrid"
        >
          <i :class="['bx', settings.shelfGrid ? 'bx-list-ul' : 'bx-grid-alt']" aria-hidden="true" />
        </button>
      </div>

      <nav class="tabs" aria-label="Filter shelf">
        <button
          v-for="tab in (['all', 'reading', 'finished'] as Filter[])"
          :key="tab"
          class="tab"
          :class="{ active: filter === tab }"
          :aria-pressed="filter === tab"
          @click="filter = tab"
        >
          {{ tab === 'all' ? 'All' : tab === 'reading' ? 'Reading' : 'Finished' }}
          <span class="count">{{ counts[tab] }}</span>
        </button>
      </nav>

      <div v-if="!filtered.length" class="empty">
        <RdrMark :size="72" />
        <h2>{{ library.books.length ? 'Nothing matches' : 'Your shelf is empty' }}</h2>
        <p v-if="library.books.length">Try another title, author or format.</p>
        <p v-else>
          Import PDF, EPUB, MOBI, Markdown, HTML, RTF, CSV or plain text. rdr keeps the file on your
          device.
        </p>
        <div class="empty-actions">
          <button class="btn btn-primary" @click="pick">
            <i class="bx bx-folder-open" aria-hidden="true" /> Import documents
          </button>
          <button v-if="library.books.length" class="btn btn-ghost" @click="query = ''; filter = 'all'">
            Clear filters
          </button>
        </div>
      </div>

      <ul v-else-if="!settings.shelfGrid" class="rows">
        <li v-for="book in filtered" :key="book.id" class="row" :class="`tint-${book.tint % 6}`">
          <button class="row-main" @click="open(book)">
            <span class="row-bar" />
            <BookCover :book="book" variant="mini" />
            <span class="row-text">
              <span class="row-title">{{ book.title }}</span>
              <span class="row-meta">
                <span class="fmt">{{ FORMAT_LABEL[book.format] }}</span>
                <span>{{ formatBytes(book.size) }}</span>
                <span>{{ relativeDay(book.opened) }}</span>
              </span>
              <span v-if="pct(book)" class="row-progress">
                <span class="row-track"><span :style="{ width: `${Math.max(3, pct(book))}%` }" /></span>
                <span class="pct">{{ pct(book) }}%</span>
              </span>
            </span>
          </button>
          <button class="icon-btn row-more" :aria-label="`Options for ${book.title}`" @click="showOptions(book)">
            <i class="bx bx-dots-vertical-rounded" aria-hidden="true" />
          </button>
        </li>
      </ul>

      <div v-else class="covers">
        <button v-for="book in filtered" :key="book.id" class="cover-cell" @click="open(book)">
          <BookCover :book="book" />
          <span class="cover-title">{{ book.title }}</span>
          <span class="cover-meta">{{ pct(book) ? `${pct(book)}% read` : FORMAT_LABEL[book.format] }}</span>
          <span v-if="pct(book)" class="cover-progress" aria-hidden="true">
            <span :style="{ width: `${pct(book)}%` }" />
          </span>
        </button>
      </div>

      <p v-if="busy" class="loading-pane"><span class="spinner" /> Importing…</p>
    </main>

    <button class="fab" aria-label="Import documents" @click="pick">
      <i class="bx bx-plus" aria-hidden="true" />
    </button>

    <div v-if="dropActive" class="drop-veil">
      <div class="drop-card">
        <i class="bx bx-down-arrow-circle" aria-hidden="true" />
        <strong>Drop your documents</strong>
        <span>They stay on this device.</span>
      </div>
    </div>

    <SheetPanel v-if="selected" :title="'Document'" icon="bx-book" @close="optionsFor = null">
      <div class="opt-head">
        <BookCover :book="selected" variant="mini" />
        <div>
          <p class="opt-title">{{ selected.title }}</p>
          <p class="opt-meta">
            {{ FORMAT_LABEL[selected.format] }} · {{ formatBytes(selected.size) }} ·
            {{ selected.sourceName }}
          </p>
        </div>
      </div>

      <label class="field rename">
        <i class="bx bx-pencil" aria-hidden="true" />
        <span class="sr-only">Title</span>
        <input v-model="renameValue" type="text" enterkeyhint="done" @keydown.enter="saveRename" />
        <button class="btn btn-quiet" @click="saveRename">Save</button>
      </label>

      <div class="opt-actions">
        <button class="opt" @click="open(selected); optionsFor = null">
          <i class="bx bx-book-open" aria-hidden="true" /> Open
        </button>
        <button class="opt" @click="exportCopy(selected)">
          <i class="bx bx-share-alt" aria-hidden="true" /> Save a copy
        </button>
        <button class="opt" @click="toggleFinished(selected)">
          <i :class="['bx', selected.finished ? 'bx-revision' : 'bx-check-double']" aria-hidden="true" />
          {{ selected.finished ? 'Mark as unread' : 'Mark as finished' }}
        </button>
        <button class="opt danger" @click="removeArmed ? remove(selected) : (removeArmed = true)">
          <i class="bx bx-trash" aria-hidden="true" />
          {{ removeArmed ? 'Tap again to remove' : 'Remove from shelf' }}
        </button>
      </div>

      <p class="opt-foot">
        Removing deletes rdr's copy. The original file in your Downloads folder is untouched.
      </p>
      <button class="wipe" @click="wipeLibrary">
        {{ wipeArmed ? 'Tap again to delete every document' : 'Clear the whole shelf' }}
      </button>
    </SheetPanel>

    <SheetPanel v-if="sortOpen" title="Sort shelf" icon="bx-sort-alt-2" @close="sortOpen = false">
      <ul class="sort-list">
        <li v-for="option in SORTS" :key="option.value">
          <button :class="{ active: settings.sort === option.value }" @click="pickSort(option.value)">
            <span>
              {{ option.label }}
              <small>{{ option.hint }}</small>
            </span>
            <i v-if="settings.sort === option.value" class="bx bx-check" aria-hidden="true" />
          </button>
        </li>
      </ul>
    </SheetPanel>
  </div>
</template>

<style scoped>
.library {
  height: 100%;
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
  padding-bottom: calc(110px + env(safe-area-inset-bottom));
}

.topbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-top: 10px;
  padding-bottom: 10px;
}

.brand {
  display: flex;
  align-items: center;
  gap: 10px;
  font-family: var(--font-display);
  font-variation-settings: 'SOFT' 30, 'WONK' 1;
  font-size: 23px;
  font-weight: 600;
  letter-spacing: -0.02em;
}

.top-actions {
  display: flex;
  gap: 2px;
}

.main {
  padding-top: 6px;
}

.page-head {
  display: flex;
  align-items: baseline;
  gap: 14px;
  flex-wrap: wrap;
  margin-bottom: 16px;
}

.page-head h1 {
  font-size: clamp(30px, 8vw, 38px);
  line-height: 1;
}

.stats {
  margin: 0;
  font-size: 12.5px;
  color: var(--muted);
}

.streak {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  margin-left: auto;
  padding: 5px 11px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--pastel-peach) 55%, var(--surface));
  border: 1px solid color-mix(in srgb, var(--pastel-peach) 80%, var(--line));
  font-size: 12px;
  font-weight: 600;
  color: var(--ink-soft);
  white-space: nowrap;
}

.streak i {
  color: #d96f32;
  font-size: 15px;
}

/* Continue reading ------------------------------------------ */

.resume {
  position: relative;
  display: grid;
  grid-template-columns: 62px 1fr;
  grid-template-areas:
    'cover text'
    'cta cta';
  gap: 14px 16px;
  padding: 18px 18px 16px 26px;
  border-radius: 18px;
  background: var(--surface);
  border: 1px solid var(--line);
  overflow: hidden;
  margin-bottom: 22px;
}

.resume-spine {
  position: absolute;
  inset: 0 auto 0 0;
  width: 8px;
  background: var(--tint);
}

.tint-0 {
  --tint: var(--pastel-mint);
}
.tint-1 {
  --tint: var(--pastel-lilac);
}
.tint-2 {
  --tint: var(--pastel-peach);
}
.tint-3 {
  --tint: var(--pastel-sky);
}
.tint-4 {
  --tint: var(--pastel-butter);
}
.tint-5 {
  --tint: var(--pastel-rose);
}

.resume-cover {
  grid-area: cover;
}

.resume-text {
  grid-area: text;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
  justify-content: center;
}

.resume-kicker {
  margin: 0;
  font-size: 12px;
  font-weight: 600;
  color: var(--accent-ink);
}

.resume-text h2 {
  font-size: clamp(21px, 5.6vw, 26px);
  line-height: 1.1;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.resume-meta {
  margin: 0;
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  font-size: 12.5px;
  color: var(--muted);
}

.resume-bar {
  height: 3px;
  border-radius: 3px;
  background: var(--surface-3);
  overflow: hidden;
  margin-top: 6px;
}

.resume-bar span {
  display: block;
  height: 100%;
  background: var(--accent);
  border-radius: 3px;
}

.resume-cta {
  grid-area: cta;
  width: 100%;
}

@media (min-width: 640px) {
  .resume {
    grid-template-columns: 72px 1fr auto;
    grid-template-areas: 'cover text cta';
    align-items: center;
    padding: 20px 22px 20px 30px;
  }

  .resume-cta {
    width: auto;
    padding: 0 26px;
  }

  .resume-cover :deep(.cover) {
    width: 72px;
  }
}

/* Search + tabs --------------------------------------------- */

.search-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 14px;
}

.search-row .field {
  flex: 1;
  min-width: 0;
}

.clear {
  color: var(--muted);
  font-size: 19px;
  display: grid;
  place-items: center;
  width: 28px;
  height: 28px;
}

.view-toggle {
  border: 1px solid var(--line);
  background: var(--surface);
}

.tabs {
  display: flex;
  gap: 22px;
  border-bottom: 1px solid var(--line);
  margin-bottom: 12px;
}

.tab {
  min-height: 42px;
  display: inline-flex;
  align-items: baseline;
  gap: 6px;
  font-size: 14px;
  font-weight: 500;
  color: var(--muted);
  border-bottom: 2px solid transparent;
  margin-bottom: -1px;
  transition: color 0.16s, border-color 0.16s;
}

.tab.active {
  color: var(--ink);
  border-bottom-color: var(--accent);
}

.tab .count {
  font-size: 11.5px;
  font-weight: 600;
  color: var(--muted);
}

/* Rows ------------------------------------------------------- */

.rows {
  list-style: none;
  margin: 0;
  padding: 0;
}

.row {
  display: flex;
  align-items: center;
  gap: 4px;
  border-bottom: 1px solid var(--line);
}

.row-main {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 13px;
  padding: 13px 4px 13px 2px;
  text-align: left;
  border-radius: 10px;
}

.row-main:active {
  background: var(--surface-2);
}

.row-bar {
  width: 3px;
  height: 58px;
  border-radius: 3px;
  background: var(--tint);
  flex: none;
}

.row-text {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.row-title {
  font-size: 15.5px;
  font-weight: 550;
  letter-spacing: -0.008em;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.row-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  font-size: 12px;
  color: var(--muted);
}

.row-meta .fmt {
  color: var(--ink-soft);
  font-weight: 550;
}

.row-progress {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 2px;
}

.row-track {
  flex: 1;
  max-width: 150px;
  height: 2px;
  border-radius: 2px;
  background: var(--surface-3);
  overflow: hidden;
}

.row-track span {
  display: block;
  height: 100%;
  background: var(--accent);
}

.pct {
  font-size: 11px;
  color: var(--muted);
  font-variant-numeric: tabular-nums;
}

.row-more {
  font-size: 19px;
  color: var(--muted);
  width: 40px;
  height: 40px;
}

/* Grid ------------------------------------------------------- */

.covers {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(128px, 1fr));
  gap: 22px 14px;
  padding-top: 4px;
}

.cover-cell {
  text-align: left;
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-width: 0;
}

.cover-cell :deep(.cover) {
  width: 100%;
  transition: transform 0.18s var(--ease);
}

.cover-cell:active :deep(.cover) {
  transform: scale(0.975);
}

.cover-title {
  font-size: 13px;
  font-weight: 550;
  line-height: 1.3;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.cover-meta {
  font-size: 11px;
  color: var(--muted);
  margin-top: -4px;
}

.cover-progress {
  display: block;
  height: 2px;
  border-radius: 2px;
  background: var(--surface-3);
  overflow: hidden;
}

.cover-progress span {
  display: block;
  height: 100%;
  background: var(--accent);
}

/* Misc ------------------------------------------------------- */

.empty-actions {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-top: 6px;
}

.fab {
  position: fixed;
  right: max(18px, env(safe-area-inset-right));
  bottom: calc(22px + env(safe-area-inset-bottom));
  width: 58px;
  height: 58px;
  border-radius: 20px;
  display: grid;
  place-items: center;
  background: var(--ink);
  color: var(--bg);
  font-size: 28px;
  box-shadow: var(--shadow-float);
  transition: transform 0.16s var(--ease);
  z-index: 30;
}

[data-theme='dark'] .fab {
  background: var(--accent);
  color: #16111f;
}

.fab:active {
  transform: scale(0.94);
}

.drop-veil {
  position: fixed;
  inset: 0;
  z-index: 70;
  background: color-mix(in srgb, var(--bg) 82%, transparent);
  backdrop-filter: blur(2px);
  display: grid;
  place-items: center;
  padding: 24px;
}

.drop-card {
  border: 2px dashed var(--line-strong);
  border-radius: 22px;
  padding: 40px 32px;
  text-align: center;
  display: flex;
  flex-direction: column;
  gap: 8px;
  color: var(--ink-soft);
}

.drop-card i {
  font-size: 40px;
  color: var(--accent);
}

/* Options sheet --------------------------------------------- */

.opt-head {
  display: flex;
  gap: 13px;
  align-items: center;
  padding: 6px 0 14px;
}

.opt-title {
  margin: 0 0 3px;
  font-family: var(--font-display);
  font-size: 19px;
  font-weight: 500;
}

.opt-meta {
  margin: 0;
  font-size: 12px;
  color: var(--muted);
  overflow-wrap: anywhere;
}

.rename {
  margin-bottom: 8px;
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

.opt-foot {
  font-size: 12px;
  color: var(--muted);
  line-height: 1.5;
  padding: 12px 0 4px;
}

.wipe {
  width: 100%;
  min-height: 44px;
  font-size: 13px;
  color: var(--muted);
}

.sort-list {
  list-style: none;
  margin: 0;
  padding: 0;
}

.sort-list button {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  min-height: 52px;
  padding: 8px 2px;
  border-bottom: 1px solid var(--line);
  text-align: left;
  font-size: 15px;
}

.sort-list button small {
  display: block;
  font-size: 11.5px;
  color: var(--muted);
}

.sort-list button.active {
  color: var(--accent-ink);
  font-weight: 600;
}

.sort-list i {
  font-size: 20px;
  color: var(--accent);
}
</style>
