<script setup lang="ts">
import type { PDFDocumentProxy } from 'pdfjs-dist'
import { nextTick, onBeforeUnmount, onMounted, ref } from 'vue'

const props = defineProps<{ data: ArrayBuffer; startPage: number }>()
const emit = defineEmits<{
  progress: [{ page: number; pages: number; pct: number }]
  outline: [{ label: string; page: number }[]]
}>()

const scroller = ref<HTMLElement>()
const stage = ref<HTMLElement>()
const pageEls = ref<HTMLElement[]>([])
const pageCount = ref(0)
const current = ref(1)
const ratio = ref(1.414)
const pageRatios = ref<Record<number, number>>({})
const error = ref('')
const ready = ref(false)

let pdf: PDFDocumentProxy | null = null
let task: { destroy: () => Promise<void>; promise: Promise<PDFDocumentProxy> } | null = null
let observer: IntersectionObserver | null = null
const rendering = new Set<number>()
let width = 0
let destroyed = false
let resizeHandler: (() => void) | null = null

async function renderPage(n: number) {
  if (!pdf || rendering.has(n) || destroyed) return
  const holder = pageEls.value[n - 1]
  const canvas = holder?.querySelector('canvas')
  if (!canvas || canvas.dataset.done === '1') return
  rendering.add(n)
  try {
    const page = await pdf.getPage(n)
    if (destroyed) return
    const base = page.getViewport({ scale: 1 })
    // Pages in one PDF can differ in size; remember each page's own ratio so
    // its box reserves the right height instead of cloning page 1's shape.
    pageRatios.value = { ...pageRatios.value, [n]: base.height / base.width }
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    const viewport = page.getViewport({ scale: (width / base.width) * dpr })
    canvas.width = Math.floor(viewport.width)
    canvas.height = Math.floor(viewport.height)
    canvas.style.width = '100%'
    canvas.style.height = 'auto'
    const context = canvas.getContext('2d')
    if (!context) throw new Error('Canvas is unavailable')
    await page.render({ canvasContext: context, viewport }).promise
    canvas.dataset.done = '1'
    canvas.classList.add('painted')
  } catch (err) {
    // A single broken page should not blank the whole document.
    console.warn(`PDF page ${n} failed to render`, err)
  } finally {
    rendering.delete(n)
  }
}

function clearPage(n: number) {
  const canvas = pageEls.value[n - 1]?.querySelector('canvas')
  if (!canvas) return
  canvas.dataset.done = ''
  canvas.width = 0
  canvas.height = 0
  canvas.classList.remove('painted')
}

function setCurrent(n: number) {
  if (n === current.value) return
  current.value = n
  report()
}

function report() {
  if (!pageCount.value) return
  emit('progress', {
    page: current.value,
    pages: pageCount.value,
    pct: current.value / pageCount.value,
  })
}

function onScroll() {
  const sc = scroller.value
  if (!sc || !pageCount.value) return
  const origin = sc.getBoundingClientRect().top
  const line = sc.clientHeight * 0.35
  let page = current.value
  for (let i = 0; i < pageEls.value.length; i++) {
    if (pageEls.value[i].getBoundingClientRect().top - origin <= line) page = i + 1
    else break
  }
  setCurrent(page)
  // Free canvases that are far from the viewport; they re-render on return.
  for (let i = 0; i < pageEls.value.length; i++) {
    const distance = Math.abs(i + 1 - current.value)
    if (distance > 4 && pageEls.value[i].querySelector('canvas')?.dataset.done === '1') clearPage(i + 1)
  }
}

function jumpPage(n: number, smooth = true) {
  const el = pageEls.value[Math.min(Math.max(n, 1), pageCount.value) - 1]
  const sc = scroller.value
  if (!el || !sc) return
  const offset = el.getBoundingClientRect().top - sc.getBoundingClientRect().top
  sc.scrollTo({ top: sc.scrollTop + offset - 10, behavior: smooth ? 'smooth' : 'auto' })
  setCurrent(n)
}

defineExpose({ jumpPage })

onMounted(async () => {
  try {
    const pdfjs = await import('pdfjs-dist')
    const worker = await import('../lib/pdf-worker.ts?worker&url')
    pdfjs.GlobalWorkerOptions.workerSrc = worker.default
    // getDocument takes ownership of the buffer, so hand it a copy.
    task = pdfjs.getDocument({ data: props.data.slice(0) })
    const docProxy = await task.promise
    if (destroyed) return
    pdf = docProxy
    pageCount.value = docProxy.numPages
    const first = await docProxy.getPage(1)
    const vp = first.getViewport({ scale: 1 })
    ratio.value = vp.height / vp.width
    ready.value = true
    await nextTick()

    const measure = () => {
      if (!stage.value) return
      width = Math.min(stage.value.clientWidth - 20, 900)
    }
    measure()
    const onResize = () => {
      const sc = scroller.value
      const keep = sc ? sc.scrollTop / Math.max(1, sc.scrollHeight - sc.clientHeight) : 0
      measure()
      pageEls.value.forEach((_, i) => {
        const n = i + 1
        if (Math.abs(n - current.value) > 2) clearPage(n)
        else {
          clearPage(n)
          void renderPage(n)
        }
      })
      // Page boxes resize with the stage, so put the viewport back at the same
      // fraction of the document once the new layout has settled.
      requestAnimationFrame(() => {
        if (!sc || !sc.isConnected) return
        const max = sc.scrollHeight - sc.clientHeight
        sc.scrollTop = max > 0 ? keep * max : 0
        onScroll()
      })
    }
    window.addEventListener('resize', onResize)
    resizeHandler = onResize

    observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const n = Number((entry.target as HTMLElement).dataset.page)
          if (entry.isIntersecting) void renderPage(n)
          else if (Math.abs(n - current.value) > 4) clearPage(n)
        }
      },
      { root: scroller.value, rootMargin: '800px 0px' },
    )
    pageEls.value.forEach((el) => observer!.observe(el))

    const start = Math.min(Math.max(props.startPage || 1, 1), docProxy.numPages)
    await nextTick()
    jumpPage(start, false)
    await nextTick()
    onScroll()
    report()

    const outline = await docProxy.getOutline()
    if (outline && outline.length && !destroyed) {
      const items: { label: string; page: number }[] = []
      for (const item of outline.slice(0, 200)) {
        try {
          let dest = item.dest
          if (typeof dest === 'string') dest = await docProxy.getDestination(dest)
          const ref = Array.isArray(dest) ? dest[0] : null
          const pageIndex = ref && typeof ref === 'object' ? await docProxy.getPageIndex(ref) : 0
          if (item.title?.trim()) items.push({ label: item.title.trim(), page: pageIndex + 1 })
        } catch {
          // Skip destinations the file cannot resolve.
        }
      }
      if (items.length) emit('outline', items)
    }
  } catch (err) {
    error.value = (err as Error).message || 'This PDF could not be opened.'
  }
})

onBeforeUnmount(() => {
  destroyed = true
  observer?.disconnect()
  if (resizeHandler) window.removeEventListener('resize', resizeHandler)
  void pdf?.cleanup()
  void task?.destroy()
})
</script>

<template>
  <div ref="scroller" class="pdf-scroller" @scroll.passive="onScroll">
    <div v-if="error" class="loading-pane">{{ error }}</div>
    <div v-else-if="!ready" class="loading-pane"><span class="spinner" /> Opening PDF…</div>
    <div ref="stage" class="pdf-stage">
      <div
        v-for="n in pageCount"
        :key="n"
        ref="pageEls"
        class="pdf-page"
        :data-page="n"
        :style="{ '--ratio': pageRatios[n] ?? ratio }"
      >
        <canvas />
        <span class="page-tag">{{ n }}</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.pdf-scroller {
  height: 100%;
  overflow-y: auto;
  background: var(--read-bg);
  -webkit-overflow-scrolling: touch;
  overscroll-behavior-y: contain;
}

.pdf-stage {
  max-width: 940px;
  margin: 0 auto;
  padding: 64px 10px calc(70px + env(safe-area-inset-bottom));
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.pdf-page {
  position: relative;
  background: #fff;
  border-radius: 2px;
  box-shadow: 0 1px 3px rgba(20, 16, 26, 0.16);
  overflow: hidden;
  aspect-ratio: 1 / var(--ratio);
  min-height: 60px;
}

.pdf-page canvas {
  display: block;
  opacity: 0;
  transition: opacity 0.22s var(--ease);
}

.pdf-page canvas.painted {
  opacity: 1;
}

.page-tag {
  position: absolute;
  right: 8px;
  bottom: 7px;
  font-size: 10px;
  color: rgba(35, 29, 51, 0.45);
  font-variant-numeric: tabular-nums;
  background: rgba(255, 255, 255, 0.72);
  border-radius: 4px;
  padding: 1px 5px;
}
</style>
