<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { GitCommit } from '@lucide/vue'
import { useI18n } from 'vue-i18n'
import { appCommitDate, appCommitMessage, appCommitSha, appCommitUrl, appVersion } from '../utils/buildInfo'
import { dateLocale } from '../utils/labels'

const { t, locale } = useI18n()
const open = ref(false)
const root = ref<HTMLElement | null>(null)
const panelId = `app-version-info-${Math.random().toString(36).slice(2)}`
const commitShortSha = computed(() => (appCommitSha ? appCommitSha.slice(0, 7) : t('app.versionUnknown')))
const commitDateLabel = computed(() => {
  if (!appCommitDate) return t('app.versionUnknown')
  const date = new Date(appCommitDate)
  if (Number.isNaN(date.getTime())) return appCommitDate
  return new Intl.DateTimeFormat(dateLocale(locale.value), {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date)
})
const commitMessageLabel = computed(() => appCommitMessage || t('app.versionUnknown'))

const toggleOpen = () => {
  open.value = !open.value
}

const close = () => {
  open.value = false
}

const handleDocumentClick = (event: MouseEvent) => {
  if (!root.value?.contains(event.target as Node)) close()
}

const handleDocumentKeydown = (event: KeyboardEvent) => {
  if (event.key === 'Escape') close()
}

onMounted(() => {
  document.addEventListener('click', handleDocumentClick)
  document.addEventListener('keydown', handleDocumentKeydown)
})

onBeforeUnmount(() => {
  document.removeEventListener('click', handleDocumentClick)
  document.removeEventListener('keydown', handleDocumentKeydown)
})
</script>

<template>
  <div ref="root" class="app-version-info">
    <button
      class="app-version-button"
      type="button"
      :aria-expanded="open"
      :aria-controls="panelId"
      :title="t('app.versionDetails')"
      @click.stop="toggleOpen"
    >
      {{ t('app.version', { version: appVersion }) }}
    </button>

    <div v-if="open" :id="panelId" class="app-version-popover" role="dialog" :aria-label="t('app.versionDetails')">
      <h2>{{ t('app.versionDetails') }}</h2>
      <dl>
        <div>
          <dt>{{ t('app.versionLabel') }}</dt>
          <dd>{{ appVersion }}</dd>
        </div>
        <div>
          <dt>{{ t('app.versionCommit') }}</dt>
          <dd>
            <a v-if="appCommitUrl" :href="appCommitUrl" target="_blank" rel="noreferrer"> <GitCommit :size="14" /> {{ commitShortSha }} </a>
            <span v-else>{{ commitShortSha }}</span>
          </dd>
        </div>
        <div>
          <dt>{{ t('app.versionDate') }}</dt>
          <dd>{{ commitDateLabel }}</dd>
        </div>
        <div>
          <dt>{{ t('app.versionMessage') }}</dt>
          <dd>{{ commitMessageLabel }}</dd>
        </div>
      </dl>
    </div>
  </div>
</template>
