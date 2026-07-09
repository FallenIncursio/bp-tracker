<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { Info } from '@lucide/vue'

defineProps<{
  text: string
  label?: string
}>()

const open = ref(false)
const root = ref<HTMLElement | null>(null)
const tooltipId = `tooltip-${Math.random().toString(36).slice(2)}`

const close = () => {
  open.value = false
}

const toggle = () => {
  open.value = !open.value
}

const onDocumentPointerDown = (event: PointerEvent) => {
  if (!open.value || !root.value?.contains(event.target as Node)) {
    close()
  }
}

onMounted(() => {
  document.addEventListener('pointerdown', onDocumentPointerDown)
})

onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', onDocumentPointerDown)
})
</script>

<template>
  <span ref="root" class="tooltip-wrap" :class="{ 'tooltip-open': open }">
    <button
      class="tooltip-trigger"
      type="button"
      :aria-label="label ?? text"
      :aria-describedby="tooltipId"
      :aria-expanded="open"
      @click="toggle"
      @keydown.esc.prevent="close"
    >
      <Info :size="15" />
    </button>
    <span :id="tooltipId" class="tooltip-bubble" role="tooltip">{{ text }}</span>
  </span>
</template>
