<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { Clock3 } from '@lucide/vue'
import { useNow } from '../composables/useNow'
import { formatDateTime } from '../utils/labels'

const props = withDefaults(
  defineProps<{
    observedAt?: string | null
    expiresAt?: string | null
    nextSpawnAt?: string | null
    status?: string | null
    compact?: boolean
    showNext?: boolean
    expiredText?: string | null
  }>(),
  {
    observedAt: null,
    expiresAt: null,
    nextSpawnAt: null,
    status: null,
    compact: false,
    showNext: true,
    expiredText: null,
  }
)

const emit = defineEmits<{
  expired: []
}>()

const { t, locale } = useI18n()
const now = useNow()
const expiredEmitted = ref(false)

const parseTime = (value: string | null | undefined) => {
  if (!value) return null
  const parsed = new Date(value).getTime()
  return Number.isFinite(parsed) ? parsed : null
}

const observedTime = computed(() => parseTime(props.observedAt))
const expiresTime = computed(() => parseTime(props.expiresAt))
const nextSpawnTime = computed(() => parseTime(props.nextSpawnAt))
const msUntilStart = computed(() => (observedTime.value ? observedTime.value - now.value : 0))
const msRemaining = computed(() => (expiresTime.value ? expiresTime.value - now.value : 0))
const isUpcoming = computed(() => msUntilStart.value > 0 || props.status === 'UPCOMING')
const isExpired = computed(() => Boolean(expiresTime.value && msRemaining.value <= 0))
const totalMs = computed(() => Math.max((expiresTime.value ?? 0) - (observedTime.value ?? now.value), 1))
const elapsedMs = computed(() => {
  if (!expiresTime.value) return 0
  if (isUpcoming.value) return 0
  return Math.min(Math.max(now.value - (observedTime.value ?? now.value), 0), totalMs.value)
})
const progressPercent = computed(() => {
  if (!expiresTime.value) return 0
  if (isExpired.value) return 100
  return Math.round((elapsedMs.value / totalMs.value) * 100)
})

const formatDuration = (value: number) => {
  const totalSeconds = Math.max(Math.ceil(value / 1000), 0)
  const days = Math.floor(totalSeconds / 86_400)
  const hours = Math.floor((totalSeconds % 86_400) / 3_600)
  const minutes = Math.floor((totalSeconds % 3_600) / 60)
  const seconds = totalSeconds % 60

  if (days > 0) return `${days}d ${hours}h`
  if (hours > 0) return `${hours}h ${minutes}m`
  return `${minutes}m ${seconds.toString().padStart(2, '0')}s`
}

const label = computed(() => {
  if (!expiresTime.value) return t('timer.noDeadline')
  if (isExpired.value) return props.expiredText ?? t('timer.expired')
  if (isUpcoming.value) return t('timer.startsIn', { time: formatDuration(msUntilStart.value) })
  return t('timer.remaining', { time: formatDuration(msRemaining.value) })
})

const nextSpawnLabel = computed(() =>
  props.showNext && nextSpawnTime.value ? t('timer.nextSpawn', { date: formatDateTime(props.nextSpawnAt, locale.value) }) : ''
)

const tone = computed(() => {
  if (isExpired.value) return 'expired'
  if (isUpcoming.value) return 'upcoming'
  if (msRemaining.value <= 60 * 60 * 1000) return 'danger'
  if (msRemaining.value <= 6 * 60 * 60 * 1000) return 'warning'
  return 'normal'
})

watch(
  () => props.expiresAt,
  () => {
    expiredEmitted.value = false
  }
)

watch(isExpired, expired => {
  if (!expired || expiredEmitted.value) return
  expiredEmitted.value = true
  emit('expired')
})
</script>

<template>
  <div
    class="countdown-timer"
    :class="[`countdown-${tone}`, { 'countdown-compact': compact }]"
    role="timer"
    :aria-label="label"
  >
    <div class="countdown-main">
      <Clock3 :size="compact ? 14 : 16" />
      <strong>{{ label }}</strong>
    </div>
    <div v-if="!compact && nextSpawnLabel" class="countdown-next">{{ nextSpawnLabel }}</div>
    <div
      v-if="!compact && expiresTime"
      class="countdown-track"
      role="progressbar"
      :aria-label="t('timer.progress', { percent: progressPercent })"
      aria-valuemin="0"
      aria-valuemax="100"
      :aria-valuenow="progressPercent"
    >
      <span :style="{ width: `${progressPercent}%` }" />
    </div>
  </div>
</template>
