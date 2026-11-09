<script setup lang="ts">
import { computed, ref } from 'vue'
import { clearShelf, library, shelfSize } from '../lib/library'
import { haptic } from '../lib/native'
import { PALETTES, previewOf, type PaletteId } from '../lib/palette'
import { saveSettings, settings, type ReaderFont, type ReaderTheme } from '../lib/settings'
import { FORMAT_LABEL, type Format } from '../lib/types'
import { formatBytes } from '../lib/util'
import { toast, ui } from '../state'

const clearArmed = ref(false)

const palettes = PALETTES.map((p) => ({ ...p, preview: previewOf(p) }))

const tints: { value: ReaderTheme; label: string }[] = [
  { value: 'paper', label: 'Theme' },
  { value: 'daylight', label: 'Daylight' },
  { value: 'sepia', label: 'Sepia' },
  { value: 'moss', label: 'Moss' },
  { value: 'night', label: 'Night' },
]

const fonts: { value: ReaderFont; label: string; className: string }[] = [
  { value: 'literata', label: 'Literata', className: 'literata' },
  { value: 'instrument', label: 'Instrument', className: 'instrument' },
  { value: 'mono', label: 'Mono', className: 'mono' },
]

const supported: Format[] = ['pdf', 'epub', 'mobi', 'azw3', 'md', 'txt', 'html', 'rtf', 'csv']

const usage = computed(() => `${library.books.length} documents · ${formatBytes(shelfSize.value)}`)

function pickTheme(value: PaletteId) {
  settings.palette = value
  saveSettings()
  void haptic()
}

function pickTint(value: ReaderTheme) {
  settings.readerTheme = value
  saveSettings()
  void haptic()
}

function pickFont(value: ReaderFont) {
  settings.font = value
  saveSettings()
  void haptic()
}

async function clearAll() {
  if (!clearArmed.value) {
    clearArmed.value = true
    return
  }
  await clearShelf()
  clearArmed.value = false
  toast('Shelf cleared', 'good')
}
</script>

<template>
  <div class="settings">
    <header class="topbar shell">
      <button class="icon-btn" aria-label="Back to shelf" @click="ui.view = 'library'">
        <i class="bx bx-arrow-back" aria-hidden="true" />
      </button>
      <h1>Settings</h1>
      <span class="spacer" />
    </header>

    <main class="shell main">
      <section class="block">
        <h2>Colour</h2>
        <p class="desc">Ten palettes, each one repaints the whole app — shelf, chrome and page.</p>
        <div class="palettes" role="radiogroup" aria-label="Colour theme">
          <button
            v-for="p in palettes"
            :key="p.id"
            class="palette"
            :class="{ active: !settings.autoTheme && settings.palette === p.id }"
            role="radio"
            :aria-checked="!settings.autoTheme && settings.palette === p.id"
            :style="{
              '--p-bg': p.preview.bg,
              '--p-surface': p.preview.surface,
              '--p-ink': p.preview.ink,
              '--p-accent': p.preview.accent,
            }"
            @click="pickTheme(p.id)"
          >
            <span class="chips" aria-hidden="true">
              <span class="dot" />
              <span class="bar" />
              <span class="card" />
            </span>
            <span class="p-name">{{ p.name }}</span>
            <span class="p-hint">{{ p.hint }}</span>
          </button>
        </div>
        <label class="toggle-row">
          <span>
            Match system day/night
            <small>Switches between a light and dark palette with your device.</small>
          </span>
          <input v-model="settings.autoTheme" type="checkbox" role="switch" @change="saveSettings" />
        </label>
      </section>

      <section class="block">
        <h2>Reading</h2>
        <p class="desc">Defaults for every document you open.</p>

        <p class="label">Page tint</p>
        <div class="tints">
          <button
            v-for="t in tints"
            :key="t.value"
            class="tint"
            :class="[`sw-${t.value}`, { active: settings.readerTheme === t.value }]"
            :aria-pressed="settings.readerTheme === t.value"
            @click="pickTint(t.value)"
          >
            <span class="chip" />
            {{ t.label }}
          </button>
        </div>

        <p class="label">Typeface</p>
        <div class="font-row">
          <button
            v-for="f in fonts"
            :key="f.value"
            class="font-choice"
            :class="[f.className, { active: settings.font === f.value }]"
            :aria-pressed="settings.font === f.value"
            @click="pickFont(f.value)"
          >
            <span class="aa">Aa</span>
            {{ f.label }}
          </button>
        </div>

        <div class="slider-row">
          <label for="set-size">Text size</label>
          <input id="set-size" v-model.number="settings.fontSize" type="range" min="15" max="27" step="1" @change="saveSettings" />
          <output>{{ settings.fontSize }}px</output>
        </div>

        <div class="slider-row">
          <label for="set-leading">Line spacing</label>
          <input id="set-leading" v-model.number="settings.lineHeight" type="range" min="1.35" max="2.05" step="0.05" @change="saveSettings" />
          <output>{{ settings.lineHeight.toFixed(2) }}</output>
        </div>

        <label class="toggle-row">
          <span>
            Justified text
            <small>Align both edges of the page.</small>
          </span>
          <input v-model="settings.justify" type="checkbox" role="switch" @change="saveSettings" />
        </label>

        <label class="toggle-row">
          <span>
            Keep the screen awake
            <small>Only while a document is open.</small>
          </span>
          <input v-model="settings.keepAwake" type="checkbox" role="switch" @change="saveSettings" />
        </label>
      </section>

      <section class="block">
        <h2>Feedback</h2>
        <p class="desc">rdr taps back lightly when you open a book, bookmark a page or switch themes.</p>
        <label class="toggle-row no-rule">
          <span>
            Haptic feedback
            <small>Vibration on taps and actions.</small>
          </span>
          <input v-model="settings.haptics" type="checkbox" role="switch" @change="saveSettings" />
        </label>
      </section>

      <section class="block">
        <h2>Storage</h2>
        <p class="desc">{{ usage }}. Everything is stored on this device only.</p>
        <div class="row-actions">
          <button class="btn btn-ghost danger" @click="clearAll">
            {{ clearArmed ? 'Tap again to delete all' : 'Clear shelf' }}
          </button>
        </div>
      </section>

      <section class="block">
        <h2>Formats</h2>
        <p class="desc">Open these directly, with no conversion step.</p>
        <ul class="formats">
          <li v-for="f in supported" :key="f">{{ FORMAT_LABEL[f] }}</li>
        </ul>
        <p class="fineprint">
          Editing is built in for Markdown and plain text. Word, Excel and PowerPoint files are not opened;
          export them to PDF first. DRM-protected books cannot be opened.
        </p>
      </section>

      <section class="block about">
        <h2>About</h2>
        <p class="desc">
          rdr 1.0.0 · a reading room for every document. Built with Vue, Vite and Capacitor. No accounts, no
          tracking, no uploads.
        </p>
      </section>
    </main>
  </div>
</template>

<style scoped>
.settings {
  height: 100%;
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
  padding-bottom: calc(40px + env(safe-area-inset-bottom));
}

.topbar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding-top: 8px;
  padding-bottom: 6px;
}

.topbar h1 {
  font-size: 25px;
  flex: 1;
}

.spacer {
  width: 44px;
}

.main {
  padding-top: 10px;
}

.block {
  padding: 22px 0;
  border-bottom: 1px solid var(--line);
}

.block h2 {
  font-size: 21px;
  margin-bottom: 4px;
}

.desc {
  margin: 0 0 16px;
  font-size: 13px;
  color: var(--muted);
  line-height: 1.5;
  max-width: 52ch;
}

.label {
  font-size: 12px;
  font-weight: 600;
  color: var(--muted);
  margin: 16px 0 8px;
}

.palettes {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 9px;
}

@media (min-width: 620px) {
  .palettes {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
}

.palette {
  display: grid;
  gap: 2px;
  padding: 9px;
  text-align: left;
  border: 1px solid var(--line);
  border-radius: 14px;
  background: var(--surface);
  transition: border-color 0.16s, transform 0.14s var(--ease), box-shadow 0.16s;
}

.palette:active {
  transform: scale(0.985);
}

.palette.active {
  border-color: var(--accent);
  box-shadow: 0 0 0 2px var(--accent-soft);
}

.chips {
  display: flex;
  align-items: center;
  gap: 5px;
  height: 30px;
  padding: 0 7px;
  margin-bottom: 6px;
  border-radius: 9px;
  background: var(--p-bg);
  border: 1px solid var(--p-ink);
  border-color: color-mix(in srgb, var(--p-ink) 16%, transparent);
}

.chips .dot {
  width: 14px;
  height: 14px;
  border-radius: 50%;
  background: var(--p-ink);
  flex: none;
}

.chips .bar {
  flex: 1;
  height: 5px;
  border-radius: 3px;
  background: var(--p-accent);
}

.chips .card {
  width: 12px;
  height: 16px;
  border-radius: 3px;
  background: var(--p-surface);
  flex: none;
}

.p-name {
  font-size: 12.5px;
  font-weight: 600;
  color: var(--ink);
  letter-spacing: -0.005em;
}

.p-hint {
  font-size: 10.5px;
  line-height: 1.3;
  color: var(--muted);
}

.tints {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  gap: 6px;
}

.tint {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 7px;
  padding: 10px 2px;
  border: 1px solid var(--line);
  border-radius: 12px;
  font-size: 10.5px;
  color: var(--ink-soft);
}

.tint .chip {
  width: 26px;
  height: 26px;
  border-radius: 50%;
  border: 1px solid rgba(35, 29, 51, 0.12);
}

.sw-paper .chip {
  background: var(--paper);
  border-color: color-mix(in srgb, var(--paper-ink) 22%, transparent);
}
.sw-daylight .chip {
  background: #fbf9ff;
}
.sw-sepia .chip {
  background: #f5ead8;
}
.sw-moss .chip {
  background: #eaf2ea;
}
.sw-night .chip {
  background: #121017;
}

.tint.active {
  border-color: var(--accent);
  color: var(--ink);
  font-weight: 600;
}

.font-row {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
}

.font-choice {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 3px;
  padding: 10px 4px;
  border: 1px solid var(--line);
  border-radius: 12px;
  font-size: 11px;
  color: var(--muted);
}

.font-choice .aa {
  font-size: 24px;
  line-height: 1.1;
  color: var(--ink);
}

.font-choice.literata .aa {
  font-family: var(--font-read);
}
.font-choice.instrument .aa {
  font-family: var(--font-ui);
}
.font-choice.mono .aa {
  font-family: var(--font-mono);
}

.font-choice.active {
  border-color: var(--accent);
  color: var(--accent-ink);
}

.slider-row {
  display: grid;
  grid-template-columns: 100px 1fr 46px;
  gap: 10px;
  align-items: center;
  padding: 12px 0;
  font-size: 13px;
  color: var(--ink-soft);
}

input[type='range'] {
  width: 100%;
  accent-color: var(--accent);
  min-height: 32px;
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
  padding-top: 12px;
  font-size: 14px;
}

.toggle-row small {
  display: block;
  color: var(--muted);
  font-size: 11.5px;
}

.toggle-row.no-rule {
  padding-top: 0;
}

.toggle-row input {
  appearance: none;
  width: 46px;
  height: 27px;
  border-radius: 20px;
  background: var(--line-strong);
  position: relative;
  cursor: pointer;
  flex: none;
  transition: background 0.18s;
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

.row-actions {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
}

.row-actions .btn {
  font-size: 13px;
  min-height: 42px;
}

.danger {
  color: var(--danger);
}

.formats {
  list-style: none;
  display: flex;
  flex-wrap: wrap;
  gap: 7px;
  padding: 0;
  margin: 0 0 14px;
}

.formats li {
  padding: 6px 11px;
  border-radius: 8px;
  background: var(--surface-2);
  border: 1px solid var(--line);
  font-size: 12px;
  color: var(--ink-soft);
}

.fineprint {
  font-size: 12px;
  color: var(--muted);
  line-height: 1.55;
  margin: 0;
  max-width: 56ch;
}

.about {
  border-bottom: 0;
}
</style>
