<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

const props = defineProps<{ status?: string | null }>()
const { t, te } = useI18n()

const className = computed(() => {
  if (props.status === 'OWNED') return 'pill pill-owned'
  if (props.status === 'MISSING') return 'pill pill-missing'
  if (props.status === 'WANTED') return 'pill pill-wanted'
  return 'pill pill-unknown'
})

const label = computed(() => {
  const key = props.status ? `status.${props.status}` : 'status.UNKNOWN'
  return te(key) ? t(key) : (props.status ?? '-')
})
</script>

<template>
  <span :class="className">{{ label }}</span>
</template>
