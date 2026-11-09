<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { openExternal } from '../lib/native'
import { settings } from '../lib/settings'
import type { ReflowDoc } from '../lib/types'
import { clamp } from '../lib/util'

const props = defineProps<{ doc: ReflowDoc; startPos: number }>()
const emit = defineEmits<{ progress: [{ pos: number; pct: number; label: string }] }>()

const scroller = ref<HTMLElement>()
const article = ref<HTMLElement>()
const pct = ref(0)
const label = ref('')

const fontStack = computed(() =>
  settings.font === 'instrument'
    ? "var(--font-ui)"
    : settings.font === 'mono'
      ? 'var(--font-mono)'
      : 'var(--font-read)',
)

const readerStyle = computed(() => ({
  '--read-size': `${settings.fontSize}px`,
  '--read-leading': String(settings.lineHeight),
  '--read-font': fontStack.value,
  '--read-align': settings.justify ? 'justify' : 'start',
  '--read-measure': settings.justify ? '66ch' : '68ch',
}))

/*
 * Heading positions are indexed once per layout change instead of measured on
 * every scroll frame: a 300-chapter book should not trigger 300 layout reads
 * per frame.
 */
interface Anchor {
  top: number
  label: string
}

let anchors: Anchor[] = []

function indexHeadings() {
  const sc = scroller.value
  const art = article.value
  if (!sc || !art) return
  const base = sc.getBoundingClientRect().top - sc.scrollTop
  anchors = Array.from(art.querySelectorAll<HTMLElement>('h1, h2, h3, h4')).map((h) => ({
    top: h.getBoundingClientRect().top - base,
    label: (h.textContent ?? '').replace(/\s+/g, ' ').trim(),
  }))
}

function headingAt(y: number): string {
  let lo = 0
  let hi = anchors.length - 1
  let best = -1
  while (lo <= hi) {
    const mid = (lo + hi) >> 1
    if (anchors[mid].top <= y) {
      best = mid
      lo = mid + 1
    } else {
      hi = mid - 1
    }
  }
  return best >= 0 ? anchors[best].label : ''
}

function measure(emitProgress = true) {
  const el = scroller.value
  if (!el) return
  if (!anchors.length) indexHeadings()
  const max = el.scrollHeight - el.clientHeight
  const ratio = max > 0 ? clamp(el.scrollTop / max) : 0
  pct.value = ratio
  // Before the first heading, name the document instead of keeping a stale chapter.
  label.value = headingAt(el.scrollTop + 90) || props.doc.toc[0]?.label || ''
  if (emitProgress) emit('progress', { pos: ratio, pct: ratio, label: label.value })
}

let frame = 0
function onScroll() {
  if (frame) return
  frame = requestAnimationFrame(() => {
    frame = 0
    measure()
  })
}

function scrollToId(id: string) {
  const el = article.value?.querySelector<HTMLElement>(`#${CSS.escape(id)}`)
  const sc = scroller.value
  if (!el || !sc) return
  const top = el.getBoundingClientRect().top - sc.getBoundingClientRect().top + sc.scrollTop - 16
  sc.scrollTo({ top, behavior: 'smooth' })
  measure()
}

function jump(pos: number, smooth = true) {
  const sc = scroller.value
  if (!sc) return
  sc.scrollTo({
    top: pos * (sc.scrollHeight - sc.clientHeight),
    behavior: smooth ? 'smooth' : 'instant',
  })
  measure()
}

function onLinkClick(e: MouseEvent) {
  const anchor = (e.target as HTMLElement).closest('a')
  if (!anchor) return
  const href = anchor.getAttribute('href') ?? ''
  if (href.startsWith('#')) {
    e.preventDefault()
    scrollToId(href.slice(1))
  } else if (/^https?:/i.test(href)) {
    e.preventDefault()
    void openExternal(href)
  }
}

/* Find: ranges are built once per query and painted with the CSS Highlight API. */
interface Match {
  snippet: string
  index: number
}

let ranges: Range[] = []
const supportsHighlight = typeof CSS !== 'undefined' && 'highlights' in CSS

function clearFind() {
  ranges = []
  if (!supportsHighlight) return
  const api = CSS as unknown as { highlights: Map<string, unknown> }
  api.highlights.delete('rdr-find')
  api.highlights.delete('rdr-find-active')
}

function search(raw: string): Match[] {
  clearFind()
  const q = raw.trim().toLowerCase()
  if (!q || !article.value) return []
  const root = article.value
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode: (node) =>
      node.nodeValue?.trim() ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT,
  })
  const found: Match[] = []
  let node: Node | null = walker.nextNode()
  while (node && found.length < 300) {
    const text = node.nodeValue ?? ''
    const hay = text.toLowerCase()
    let at = hay.indexOf(q)
    while (at >= 0 && found.length < 300) {
      const range = document.createRange()
      range.setStart(node, at)
      range.setEnd(node, at + q.length)
      ranges.push(range)
      const host = node.parentElement?.closest('p, li, td, h1, h2, h3, h4, blockquote')
      const full = (host?.textContent ?? text).replace(/\s+/g, ' ').trim()
      const pos = full.toLowerCase().indexOf(q)
      const snippet =
        full.length > 110
          ? `${pos > 40 ? '…' : ''}${full.slice(Math.max(0, pos - 40), Math.max(0, pos - 40) + 100)}${
              pos + 100 < full.length ? '…' : ''
            }`
          : full
      found.push({ snippet: snippet || text.trim().slice(0, 90), index: found.length })
      at = hay.indexOf(q, at + q.length)
    }
    node = walker.nextNode()
  }

  if (supportsHighlight && ranges.length) {
    const api = CSS as unknown as { highlights: Map<string, unknown> }
    const HighlightCtor = (window as unknown as { Highlight: new (...r: Range[]) => unknown }).Highlight
    if (HighlightCtor) api.highlights.set('rdr-find', new HighlightCtor(...ranges))
  }
  return found
}

function reveal(index: number) {
  const range = ranges[index]
  if (!range) return
  const host = range.startContainer.parentElement
  host?.scrollIntoView({ block: 'center', behavior: 'smooth' })
  if (supportsHighlight) {
    const api = CSS as unknown as { highlights: Map<string, unknown> }
    const HighlightCtor = (window as unknown as { Highlight: new (...r: Range[]) => unknown }).Highlight
    if (HighlightCtor) api.highlights.set('rdr-find-active', new HighlightCtor(range))
  }
}

defineExpose({ search, reveal, jump, scrollToId, clearFind })

watch(
  () => settings.fontSize + settings.lineHeight + settings.font + String(settings.justify),
  () =>
    nextTick(() => {
      indexHeadings()
      measure(false)
    }),
)

let resizeObserver: ResizeObserver | null = null
let indexFrame = 0

/** Layout moved (rotation, font load, wide table, image): rebuild anchors once per frame. */
function scheduleIndex() {
  if (indexFrame) return
  indexFrame = requestAnimationFrame(() => {
    indexFrame = 0
    const el = scroller.value
    if (el) {
      // Relayout changed the content height, so restore the same fraction of
      // the document instead of letting the pixel scroll offset drift.
      const max = el.scrollHeight - el.clientHeight
      if (max > 0) el.scrollTop = clamp(pct.value) * max
    }
    indexHeadings()
    measure()
  })
}

onMounted(async () => {
  await nextTick()
  const sc = scroller.value
  if (sc && props.startPos > 0) {
    sc.scrollTop = props.startPos * (sc.scrollHeight - sc.clientHeight)
  }
  indexHeadings()
  measure(false)
  label.value = headingAt(sc?.scrollTop ?? 0) || (props.doc.toc[0]?.label ?? '')
  if (article.value && typeof ResizeObserver !== 'undefined') {
    resizeObserver = new ResizeObserver(scheduleIndex)
    resizeObserver.observe(article.value)
  }
})

function clearToc() {
  anchors = []
}

onBeforeUnmount(() => {
  if (frame) cancelAnimationFrame(frame)
  if (indexFrame) cancelAnimationFrame(indexFrame)
  resizeObserver?.disconnect()
  clearToc()
})
</script>

<template>
  <div ref="scroller" class="reflow-scroller" :style="readerStyle" @scroll.passive="onScroll">
    <article ref="article" class="doc" @click="onLinkClick" v-html="doc.html" />
    <div class="doc-end">
      <span class="end-rule" />
      <p>End of document</p>
      <span class="end-rule" />
    </div>
  </div>
</template>

<style scoped>
.reflow-scroller {
  height: 100%;
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
  background: var(--read-bg);
  color: var(--read-ink);
  overscroll-behavior-y: contain;
  scroll-behavior: smooth;
}

.doc {
  max-width: var(--read-measure);
  margin: 0 auto;
  padding: 64px 22px 74px;
  font-family: var(--read-font);
  font-size: var(--read-size);
  line-height: var(--read-leading);
  text-align: var(--read-align);
  hyphens: auto;
  overflow-wrap: break-word;
}

.doc :deep(p) {
  margin: 0 0 0.85em;
  text-wrap: pretty;
}

.doc :deep(.chapter + .chapter) {
  margin-top: 1.9em;
  padding-top: 1.6em;
  border-top: 1px solid var(--read-rule);
}

.doc :deep(h1),
.doc :deep(h2),
.doc :deep(h3),
.doc :deep(h4) {
  font-family: var(--font-display);
  font-variation-settings: 'SOFT' 20, 'WONK' 1;
  font-weight: 550;
  line-height: 1.18;
  letter-spacing: -0.018em;
  text-align: start;
  text-wrap: balance;
  margin: 1.6em 0 0.55em;
  color: var(--read-ink);
}

.doc :deep(h1) {
  font-size: 1.75em;
  margin-top: 0.4em;
}

.doc :deep(h2) {
  font-size: 1.38em;
}

.doc :deep(h3) {
  font-size: 1.16em;
}

.doc :deep(h4) {
  font-size: 1.02em;
}

.doc :deep(a) {
  color: var(--read-accent);
  text-decoration: underline;
  text-decoration-thickness: 1px;
  text-underline-offset: 2px;
}

.doc :deep(blockquote) {
  margin: 1.3em 0;
  padding: 0.15em 0 0.15em 1em;
  border-left: 3px solid var(--pastel-lilac);
  color: var(--read-muted);
  font-style: italic;
}

.doc :deep(ul),
.doc :deep(ol) {
  padding-left: 1.35em;
  margin: 0 0 0.9em;
}

.doc :deep(li) {
  margin-bottom: 0.35em;
}

.doc :deep(img),
.doc :deep(svg) {
  max-width: 100%;
  height: auto;
  display: block;
  margin: 1.2em auto;
  border-radius: 4px;
}

.doc :deep(figure) {
  margin: 1.4em 0;
}

.doc :deep(figcaption) {
  font-family: var(--font-ui);
  font-size: 0.72em;
  color: var(--read-muted);
  text-align: center;
  margin-top: 0.5em;
}

.doc :deep(hr) {
  border: 0;
  border-top: 1px solid var(--read-rule);
  margin: 1.8em 0;
}

.doc :deep(table) {
  width: 100%;
  border-collapse: collapse;
  font-family: var(--font-ui);
  font-size: 0.78em;
  margin: 1.2em 0;
  display: block;
  overflow-x: auto;
}

.doc :deep(th),
.doc :deep(td) {
  border-bottom: 1px solid var(--read-rule);
  padding: 7px 9px;
  text-align: left;
  vertical-align: top;
}

.doc :deep(th) {
  font-weight: 600;
  color: var(--read-ink);
}

.doc :deep(code),
.doc :deep(pre) {
  font-family: var(--font-mono);
  font-size: 0.82em;
}

.doc :deep(code) {
  background: var(--read-code);
  padding: 0.15em 0.35em;
  border-radius: 4px;
}

.doc :deep(pre) {
  background: var(--read-code);
  padding: 14px;
  border-radius: 8px;
  overflow-x: auto;
  text-align: start;
  line-height: 1.5;
}

.doc :deep(pre code) {
  background: none;
  padding: 0;
}

.doc :deep(.note) {
  font-family: var(--font-ui);
  font-size: 0.78em;
  color: var(--read-muted);
  font-style: italic;
}

.doc :deep(::highlight(rdr-find)) {
  background: var(--pastel-butter);
  color: #231d33;
}

.doc :deep(::highlight(rdr-find-active)) {
  background: var(--pastel-peach);
  color: #231d33;
}

.doc-end {
  display: flex;
  align-items: center;
  gap: 14px;
  max-width: var(--read-measure);
  margin: 0 auto;
  padding: 0 22px calc(48px + env(safe-area-inset-bottom));
  color: var(--read-muted);
  font-family: var(--font-ui);
  font-size: 12px;
}

.doc-end p {
  margin: 0;
  white-space: nowrap;
}

.end-rule {
  flex: 1;
  height: 1px;
  background: var(--read-rule);
}
</style>
