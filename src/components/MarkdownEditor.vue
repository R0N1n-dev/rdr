<script setup lang="ts">
import { computed, nextTick, ref } from 'vue'

const props = defineProps<{ text: string; markdown?: boolean }>()
const emit = defineEmits<{ save: [string]; cancel: [] }>()

const value = ref(props.text)
const area = ref<HTMLTextAreaElement>()
const words = computed(() => value.value.trim().split(/\s+/).filter(Boolean).length)

function apply(next: string, selStart: number, selEnd: number) {
  value.value = next
  void nextTick(() => {
    const el = area.value
    if (!el) return
    el.focus()
    el.setSelectionRange(selStart, selEnd)
  })
}

function wrap(before: string, after = before, placeholder = 'text') {
  const el = area.value
  if (!el) return
  const { selectionStart: s, selectionEnd: e } = el
  const selected = value.value.slice(s, e) || placeholder
  const next = `${value.value.slice(0, s)}${before}${selected}${after}${value.value.slice(e)}`
  apply(next, s + before.length, s + before.length + selected.length)
}

function prefixLines(prefix: string | ((i: number) => string), fallback = 'Item') {
  const el = area.value
  if (!el) return
  const { selectionStart: s, selectionEnd: e } = el
  const lineStart = value.value.lastIndexOf('\n', s - 1) + 1
  const lineEndIndex = value.value.indexOf('\n', e)
  const lineEnd = lineEndIndex === -1 ? value.value.length : lineEndIndex
  const block = value.value.slice(lineStart, lineEnd) || fallback
  const lines = block.split('\n')
  const next = lines
    .map((line, i) => `${typeof prefix === 'string' ? prefix : prefix(i)}${line.replace(/^(\s*)([-*]|\d+\.)\s+/, '$1')}`)
    .join('\n')
  const updated = value.value.slice(0, lineStart) + next + value.value.slice(lineEnd)
  apply(updated, lineStart, lineStart + next.length)
}

const tools = [
  { icon: 'bx-heading', label: 'Heading', run: () => wrap('## ', '', 'Heading') },
  { icon: 'bx-bold', label: 'Bold', run: () => wrap('**', '**', 'bold') },
  { icon: 'bx-italic', label: 'Italic', run: () => wrap('*', '*', 'italic') },
  { icon: 'bx-link', label: 'Link', run: () => wrap('[', '](https://)', 'label') },
  { icon: 'bx-list-ul', label: 'Bulleted list', run: () => prefixLines('- ') },
  { icon: 'bx-list-ol', label: 'Numbered list', run: () => prefixLines((i) => `${i + 1}. `) },
  { icon: 'bx-block', label: 'Quote', run: () => prefixLines('> ') },
  { icon: 'bx-code-curly', label: 'Code block', run: () => wrap('\n```\n', '\n```\n', 'code') },
]
</script>

<template>
  <div class="editor">
    <div v-if="markdown !== false" class="toolbar" role="toolbar" aria-label="Formatting">
      <button
        v-for="tool in tools"
        :key="tool.label"
        class="tool"
        :aria-label="tool.label"
        :title="tool.label"
        @click="tool.run"
      >
        <i :class="['bx', tool.icon]" aria-hidden="true" />
      </button>
    </div>
    <textarea
      ref="area"
      v-model="value"
      class="area"
      spellcheck="true"
      autocapitalize="sentences"
      aria-label="Markdown text"
      @keydown.ctrl.s.prevent="emit('save', value)"
      @keydown.meta.s.prevent="emit('save', value)"
    />
    <div class="editor-foot">
      <span>{{ words }} {{ words === 1 ? 'word' : 'words' }}</span>
      <span class="hint">{{ markdown === false ? 'Plain text' : 'Markdown' }}</span>
    </div>
    <div class="editor-actions">
      <button class="btn btn-ghost" @click="emit('cancel')">Cancel</button>
      <button class="btn btn-primary" @click="emit('save', value)">Save changes</button>
    </div>
  </div>
</template>

<style scoped>
.editor {
  height: 100%;
  display: flex;
  flex-direction: column;
  background: var(--read-bg);
  color: var(--read-ink);
}

.toolbar {
  display: flex;
  gap: 2px;
  overflow-x: auto;
  padding: 8px 10px;
  border-bottom: 1px solid var(--read-rule);
  scrollbar-width: none;
}

.toolbar::-webkit-scrollbar {
  display: none;
}

.tool {
  flex: none;
  width: 42px;
  height: 42px;
  display: grid;
  place-items: center;
  border-radius: 10px;
  font-size: 21px;
  color: var(--read-muted);
}

.tool:active {
  background: var(--read-code);
  color: var(--read-ink);
}

.area {
  flex: 1;
  width: 100%;
  resize: none;
  border: 0;
  outline: none;
  background: var(--read-bg);
  color: var(--read-ink);
  padding: 20px 22px;
  font-family: var(--read-editor-font, var(--font-ui));
  font-size: 16px;
  line-height: 1.7;
  caret-color: var(--read-accent);
}

.editor-foot {
  display: flex;
  justify-content: space-between;
  padding: 8px 22px;
  font-size: 11.5px;
  color: var(--read-muted);
  border-top: 1px solid var(--read-rule);
}

.hint {
  font-family: var(--font-mono);
}

.editor-actions {
  display: flex;
  gap: 10px;
  padding: 10px 16px calc(14px + env(safe-area-inset-bottom));
  border-top: 1px solid var(--read-rule);
}

.editor-actions .btn {
  flex: 1;
}
</style>
