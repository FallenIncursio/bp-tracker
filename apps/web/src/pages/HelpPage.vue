<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { Bell, CheckSquare, Orbit, ScrollText, ShieldCheck, Users } from '@lucide/vue'

const { t, tm } = useI18n()

const sections = [
  { key: 'gettingStarted', icon: Users },
  { key: 'blueprints', icon: ScrollText },
  { key: 'sirius', icon: Orbit },
  { key: 'checker', icon: CheckSquare },
  { key: 'roles', icon: ShieldCheck },
  { key: 'notifications', icon: Bell },
] as const

const sectionItems = (key: (typeof sections)[number]['key']) => tm(`help.sections.${key}.items`) as string[]
</script>

<template>
  <section class="page">
    <div class="page-header">
      <div>
        <h1 class="page-title">{{ t('help.title') }}</h1>
        <p class="page-subtitle">{{ t('help.subtitle') }}</p>
      </div>
    </div>

    <section class="help-grid">
      <article v-for="section in sections" :key="section.key" class="panel help-card">
        <component :is="section.icon" :size="20" />
        <div>
          <h2 class="panel-title">{{ t(`help.sections.${section.key}.title`) }}</h2>
          <ul>
            <li v-for="item in sectionItems(section.key)" :key="item">{{ item }}</li>
          </ul>
        </div>
      </article>
    </section>
  </section>
</template>
