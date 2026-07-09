<script setup lang="ts">
withDefaults(
  defineProps<{
    size?: number | string
    title?: string
  }>(),
  {
    size: 16,
  }
)
</script>

<template>
  <svg
    class="brand-icon"
    :width="size"
    :height="size"
    viewBox="0 0 24 24"
    fill="none"
    role="img"
    :aria-label="title"
    :aria-hidden="title ? undefined : 'true'"
  >
    <title v-if="title">{{ title }}</title>
    <path
      d="M3.4 5.2h12.8A1.8 1.8 0 0 1 18 7v1h1.4a3.4 3.4 0 0 1 0 6.8H18v.7a4.3 4.3 0 0 1-4.3 4.3H6a4.3 4.3 0 0 1-4.3-4.3V7a1.8 1.8 0 0 1 1.7-1.8Z"
      fill="#29abe0"
    />
    <path d="M18 10v2.8h1.2a1.4 1.4 0 0 0 0-2.8H18Z" fill="#fff" opacity=".95" />
    <path
      d="m9.8 15.4-2.9-2.7a2.2 2.2 0 0 1-.2-3 2.1 2.1 0 0 1 3.1-.1l.2.2.2-.2a2.1 2.1 0 0 1 3.1.1 2.2 2.2 0 0 1-.2 3l-2.9 2.7a.3.3 0 0 1-.4 0Z"
      fill="#ff5e5b"
    />
  </svg>
</template>
