<script setup lang="ts">
import { computed } from 'vue'
import { FORMAT_LABEL, type Book } from '../lib/types'

const props = withDefaults(defineProps<{ book: Book; variant?: 'mini' | 'tile' }>(), { variant: 'tile' })

const initial = computed(() => props.book.title.trim().charAt(0).toUpperCase() || '?')
</script>

<template>
  <div class="cover" :class="[`tint-${book.tint % 6}`, variant]" aria-hidden="true">
    <img v-if="book.cover" class="art" :src="book.cover" alt="" />
    <template v-else>
      <span class="spine" />
      <template v-if="variant === 'mini'">
        <span class="initial">{{ initial }}</span>
      </template>
      <template v-else>
        <span class="ribbon" />
        <span class="title">{{ book.title }}</span>
        <span class="foot">{{ FORMAT_LABEL[book.format] }}</span>
      </template>
    </template>
  </div>
</template>

<style scoped>
.cover {
  position: relative;
  overflow: hidden;
  border-radius: var(--radius-cover);
  background: var(--tint);
  color: #231d33;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  box-shadow:
    inset 0 0 0 1px rgba(35, 29, 51, 0.08),
    0 1px 2px rgba(35, 29, 51, 0.12);
  isolation: isolate;
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

.art {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.spine {
  position: absolute;
  inset: 0 auto 0 0;
  width: 7%;
  min-width: 3px;
  background: rgba(35, 29, 51, 0.13);
}

.ribbon {
  position: absolute;
  top: 0;
  right: 14%;
  width: 13%;
  height: 24%;
  background: rgba(255, 255, 255, 0.62);
  clip-path: polygon(0 0, 100% 0, 100% 100%, 50% 78%, 0 100%);
}

.tile {
  aspect-ratio: 3 / 4;
  padding: 14% 9% 9% 15%;
}

.title {
  font-family: var(--font-display);
  font-variation-settings: 'SOFT' 30, 'WONK' 1;
  font-weight: 500;
  font-size: clamp(12px, 3.4vw, 16px);
  line-height: 1.16;
  letter-spacing: -0.015em;
  display: -webkit-box;
  -webkit-line-clamp: 4;
  -webkit-box-orient: vertical;
  overflow: hidden;
  overflow-wrap: anywhere;
}

.foot {
  font-size: 8px;
  font-weight: 600;
  letter-spacing: 0.09em;
  text-transform: uppercase;
  color: rgba(35, 29, 51, 0.62);
}

.mini {
  width: 58px;
  aspect-ratio: 3 / 4;
  align-items: center;
  justify-content: center;
}

.initial {
  font-family: var(--font-display);
  font-weight: 600;
  font-size: 26px;
  line-height: 1;
  margin-left: 9%;
}
</style>
