<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import type { SheetsDoc } from '../lib/types'

const props = defineProps<{ doc: SheetsDoc; startSheet: number }>()
const emit = defineEmits<{ progress: [{ pos: number; pct: number; label: string }] }>()

const active = ref(Math.min(Math.max(props.startSheet, 0), props.doc.sheets.length - 1))
const limit = ref(300)

const sheet = computed(() => props.doc.sheets[active.value])
const rows = computed(() => sheet.value?.rows.slice(0, limit.value) ?? [])
const hasHeader = computed(() => rows.value.length > 1)

function select(index: number) {
  active.value = index
  limit.value = 300
  emit('progress', {
    pos: index,
    pct: (index + 1) / props.doc.sheets.length,
    label: props.doc.sheets[index]?.name ?? '',
  })
}

onMounted(() => select(active.value))
</script>

<template>
  <div class="sheet-reader">
    <div v-if="doc.sheets.length > 1" class="sheet-tabs" role="tablist" aria-label="Worksheets">
      <button
        v-for="(s, i) in doc.sheets"
        :key="s.name + i"
        role="tab"
        class="sheet-tab"
        :class="{ active: i === active }"
        :aria-selected="i === active"
        @click="select(i)"
      >
        {{ s.name }}
      </button>
    </div>

    <div class="table-wrap">
      <table>
        <thead v-if="hasHeader">
          <tr>
            <th class="gutter" />
            <th v-for="(cell, c) in rows[0]" :key="c" scope="col">{{ cell || ' ' }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(row, r) in rows.slice(hasHeader ? 1 : 0)" :key="r">
            <th class="gutter" scope="row">{{ (hasHeader ? r + 2 : r + 1) }}</th>
            <td v-for="(cell, c) in row" :key="c">{{ cell }}</td>
          </tr>
        </tbody>
      </table>
    </div>

    <div class="sheet-foot">
      <p>
        {{ sheet?.name }}
        <span v-if="sheet">· {{ sheet.rows.length }} rows</span>
      </p>
      <button v-if="sheet && sheet.rows.length > limit" class="btn btn-soft load-more" @click="limit += 300">
        Show 300 more rows
      </button>
    </div>
  </div>
</template>

<style scoped>
.sheet-reader {
  height: 100%;
  display: flex;
  flex-direction: column;
  /* Clears the floating reader chrome, with or without sheet tabs. The app
     shell already pads for the status bar, so no extra inset term here. */
  padding-top: 62px;
  background: var(--read-bg);
  color: var(--read-ink);
  overflow: hidden;
}

.sheet-tabs {
  display: flex;
  gap: 4px;
  overflow-x: auto;
  padding: 0 12px 8px;
  border-bottom: 1px solid var(--read-rule);
  scrollbar-width: none;
}

.sheet-tabs::-webkit-scrollbar {
  display: none;
}

.sheet-tab {
  flex: none;
  padding: 8px 14px;
  border-radius: 9px;
  font-family: var(--font-ui);
  font-size: 13px;
  font-weight: 550;
  color: var(--read-muted);
  background: var(--read-code);
}

.sheet-tab.active {
  color: #231d33;
  background: var(--pastel-lilac);
}

.table-wrap {
  flex: 1;
  overflow: auto;
  -webkit-overflow-scrolling: touch;
}

table {
  border-collapse: separate;
  border-spacing: 0;
  font-family: var(--font-ui);
  font-size: 13px;
  min-width: 100%;
}

th,
td {
  border-bottom: 1px solid var(--read-rule);
  border-right: 1px solid var(--read-rule);
  padding: 8px 10px;
  text-align: left;
  vertical-align: top;
  min-width: 88px;
  max-width: 320px;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

thead th {
  position: sticky;
  top: 0;
  z-index: 2;
  background: var(--read-code);
  font-weight: 600;
  color: var(--read-ink);
}

.gutter {
  position: sticky;
  left: 0;
  z-index: 1;
  width: 44px;
  min-width: 44px;
  max-width: 44px;
  background: var(--read-code);
  color: var(--read-muted);
  font-weight: 500;
  font-variant-numeric: tabular-nums;
  text-align: center;
  font-size: 11px;
}

thead .gutter {
  z-index: 3;
}

.sheet-foot {
  padding: 12px 16px calc(16px + env(safe-area-inset-bottom));
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  border-top: 1px solid var(--read-rule);
}

.sheet-foot p {
  margin: 0;
  font-size: 12px;
  color: var(--read-muted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.load-more {
  min-height: 40px;
  font-size: 13px;
  flex: none;
}
</style>
