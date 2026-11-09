<script setup lang="ts">
withDefaults(defineProps<{ size?: number }>(), { size: 28 })
</script>

<template>
  <svg
    :width="size"
    :height="size"
    viewBox="0 0 120 120"
    fill="none"
    aria-hidden="true"
    focusable="false"
    class="rdr-mark"
  >
    <rect x="19" y="31" width="38" height="58" rx="6" fill="#D6C8F7" transform="rotate(-14 60 60)" />
    <rect x="63" y="31" width="38" height="58" rx="6" fill="#BFDDEF" transform="rotate(14 60 60)" />
    <rect x="35" y="22" width="50" height="68" rx="7" fill="#FFF7EF" />
    <rect x="44" y="45" width="29" height="3.6" rx="1.8" fill="#231D33" opacity="0.24" />
    <rect x="44" y="54" width="21" height="3.6" rx="1.8" fill="#231D33" opacity="0.16" />
    <rect x="44" y="63" width="25" height="3.6" rx="1.8" fill="#231D33" opacity="0.16" />
    <circle cx="46.5" cy="78" r="3.1" fill="#BFE7D1" />
    <path d="M70 22h14v27l-7-5.6-7 5.6z" fill="#FFD3BE" />
  </svg>
</template>

<style scoped>
.rdr-mark {
  display: block;
  flex: none;
}
</style>
