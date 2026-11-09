<script setup lang="ts">
import { onBeforeUnmount, onMounted } from 'vue'

defineProps<{ title: string; icon?: string }>()
const emit = defineEmits<{ close: [] }>()

function onKey(e: KeyboardEvent) {
  if (e.key === 'Escape') emit('close')
}

onMounted(() => {
  document.addEventListener('keydown', onKey)
  document.documentElement.style.overflow = 'hidden'
})

onBeforeUnmount(() => {
  document.removeEventListener('keydown', onKey)
  document.documentElement.style.overflow = ''
})
</script>

<template>
  <div class="scrim" @click.self="emit('close')">
    <section class="sheet" role="dialog" aria-modal="true" :aria-label="title">
      <div class="sheet-handle" />
      <header class="sheet-head">
        <h2>
          <i v-if="icon" :class="['bx', icon]" class="head-icon" aria-hidden="true" />
          {{ title }}
        </h2>
        <button class="icon-btn" aria-label="Close" @click="emit('close')">
          <i class="bx bx-x" aria-hidden="true" />
        </button>
      </header>
      <div class="sheet-body">
        <slot />
      </div>
    </section>
  </div>
</template>

<style scoped>
.head-icon {
  color: var(--accent-ink);
  margin-right: 6px;
}
</style>
