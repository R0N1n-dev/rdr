<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import RdrMark from './components/RdrMark.vue'
import SheetPanel from './components/SheetPanel.vue'
import { runBack } from './lib/back'
import { loadLibrary } from './lib/library'
import { exitApp, haptic, initNative, onBack, syncSafeArea, syncSystemBars } from './lib/native'
import { applyAppTheme, loadSettings, settings } from './lib/settings'
import { loadStreak } from './lib/streak'
import { ui } from './state'
import LibraryView from './views/LibraryView.vue'
import ReaderView from './views/ReaderView.vue'
import SettingsView from './views/SettingsView.vue'

const reader = ref<InstanceType<typeof ReaderView> | null>(null)
const shelf = ref<InstanceType<typeof LibraryView> | null>(null)
const booting = ref(true)
const exitPrompt = ref(false)
let cleanupBack: (() => void) | null = null

const icons = { info: 'bx-info-circle', good: 'bx-check-circle', warn: 'bx-error-circle' }

function handleBack() {
  runBack({
    promptOpen: exitPrompt.value,
    view: ui.view,
    closePrompt: () => {
      exitPrompt.value = false
    },
    readerBack: () => reader.value?.handleBack() ?? false,
    shelfBack: () => shelf.value?.handleBack() ?? false,
    goShelf: () => {
      exitPrompt.value = false
      ui.bookId = null
      ui.view = 'library'
    },
    askExit: () => {
      void haptic()
      exitPrompt.value = true
    },
  })
}

async function leaveApp() {
  exitPrompt.value = false
  await exitApp()
}

/**
 * The bar sits over whatever page is showing, so its icon style is derived from
 * that surface: light shelf/paper → dark icons, dark shelf/paper → light icons.
 */
function barBackdrop(): string {
  const reader = document.querySelector<HTMLElement>('.reader')
  const onReader = ui.view === 'reader' && reader
  const source = onReader ? reader : document.documentElement
  const token = onReader ? '--read-bg' : '--bg'
  const value = getComputedStyle(source).getPropertyValue(token).trim()
  return value || getComputedStyle(document.documentElement).getPropertyValue('--bg').trim()
}

function syncBars() {
  const backdrop = barBackdrop()
  // Also paint the page behind the shell: Android WebView can show it for a
  // frame while it relayouts after a rotation.
  document.documentElement.style.backgroundColor = backdrop
  void syncSystemBars(backdrop)
}

let viewportFrame = 0
function onViewportChange() {
  if (viewportFrame) return
  viewportFrame = requestAnimationFrame(() => {
    viewportFrame = 0
    document.documentElement.style.setProperty('--app-h', `${window.innerHeight}px`)
    syncBars()
  })
}

watch(
  () => ui.view,
  () => {
    exitPrompt.value = false
    void nextTick(syncBars)
  },
)

watch(
  () => settings.readerTheme,
  () => void nextTick(syncBars),
)

watch(
  () => [settings.palette, settings.autoTheme],
  () => {
    applyAppTheme()
    void nextTick(syncBars)
  },
)

const schemeQuery = typeof window !== 'undefined' ? window.matchMedia?.('(prefers-color-scheme: dark)') : null
function onSchemeChange() {
  if (settings.autoTheme) {
    applyAppTheme()
    void nextTick(syncBars)
  }
}

onMounted(async () => {
  await loadSettings()
  applyAppTheme()
  await loadLibrary()
  void loadStreak()
  await initNative()
  document.documentElement.style.setProperty('--app-h', `${window.innerHeight}px`)
  syncBars()
  // Measure before the boot screen lifts so the shell never snaps by a status bar.
  await syncSafeArea()
  window.addEventListener('resize', onViewportChange)
  window.addEventListener('orientationchange', onViewportChange)
  cleanupBack = await onBack(handleBack)
  schemeQuery?.addEventListener?.('change', onSchemeChange)
  booting.value = false
})

onBeforeUnmount(() => {
  cleanupBack?.()
  schemeQuery?.removeEventListener?.('change', onSchemeChange)
  window.removeEventListener('resize', onViewportChange)
  window.removeEventListener('orientationchange', onViewportChange)
  if (viewportFrame) cancelAnimationFrame(viewportFrame)
})
</script>

<template>
  <div
    class="app"
    :class="{ 'is-reading': ui.view === 'reader' }"
    :data-read="ui.view === 'reader' ? settings.readerTheme : null"
  >
    <div v-if="booting" class="boot">
      <RdrMark :size="66" />
      <p>rdr</p>
    </div>

    <div :key="ui.view" class="view-host">
      <LibraryView v-if="ui.view === 'library'" ref="shelf" />
      <SettingsView v-else-if="ui.view === 'settings'" />
      <!-- Wide screens keep the shelf beside the reader; narrow ones show only
           the reader and reveal the shelf again on back. -->
      <div v-else class="split">
        <div class="split-shelf">
          <LibraryView ref="shelf" />
        </div>
        <div class="split-reader">
          <ReaderView ref="reader" />
        </div>
      </div>
    </div>

    <SheetPanel v-if="exitPrompt" title="Leave rdr?" icon="bx-door-open" @close="exitPrompt = false">
      <p class="exit-copy">Your shelf, bookmarks and reading positions stay on this device.</p>
      <div class="exit-actions">
        <button class="btn btn-ghost" @click="exitPrompt = false">Keep reading</button>
        <button class="btn btn-primary" @click="leaveApp">Close rdr</button>
      </div>
    </SheetPanel>

    <div v-if="ui.toast.message" :key="ui.toast.id" class="toast" :class="`tone-${ui.toast.tone}`" role="status">
      <i :class="['bx', icons[ui.toast.tone]]" aria-hidden="true" />
      <span>{{ ui.toast.message }}</span>
    </div>
  </div>
</template>

<style scoped>
.app {
  position: relative;
  /* --app-h comes from the live viewport so a rotation never leaves the shell
     at the old height while WebView catches up. dvh is the fallback. */
  height: var(--app-h, 100dvh);
  padding-top: var(--safe-top);
  overflow: hidden;
  background: var(--bg);
}

/* The status-bar strip is painted by the shell, so it follows the reading page. */
.app.is-reading {
  background: var(--read-bg);
}

.boot {
  position: fixed;
  inset: 0;
  z-index: 100;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 14px;
  background: var(--bg);
}

.boot p {
  margin: 0;
  font-family: var(--font-display);
  font-variation-settings: 'SOFT' 30, 'WONK' 1;
  font-size: 26px;
  letter-spacing: -0.02em;
}

.view-host {
  height: 100%;
  animation: view-in 0.22s var(--ease) both;
}

.split {
  display: flex;
  height: 100%;
}

.split-shelf {
  display: none;
}

.split-reader {
  flex: 1;
  min-width: 0;
  height: 100%;
}

@media (min-width: 900px) {
  .split-shelf {
    display: block;
    flex: none;
    width: 400px;
    height: 100%;
    border-right: 1px solid var(--line);
    background: var(--bg);
  }
}

.exit-copy {
  margin: 0 0 18px;
  color: var(--muted);
  font-size: 13.5px;
  line-height: 1.5;
  max-width: 42ch;
}

.exit-actions {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
}

.exit-actions .btn {
  width: 100%;
}

@keyframes view-in {
  from {
    opacity: 0;
    transform: translateY(5px);
  }
  to {
    opacity: 1;
    transform: none;
  }
}

@media (prefers-reduced-motion: reduce) {
  .view-host {
    animation: none;
  }
}
</style>
