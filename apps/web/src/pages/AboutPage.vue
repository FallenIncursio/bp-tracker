<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { ExternalLink, HeartHandshake, Info, Scale } from '@lucide/vue'
import BrandGithubIcon from '../components/BrandGithubIcon.vue'
import BrandKofiIcon from '../components/BrandKofiIcon.vue'

type CreditItem = {
  label?: string
  text: string
  href?: string
}

const { t, tm } = useI18n()

const githubUrl = import.meta.env.VITE_GITHUB_URL ?? 'https://github.com/FallenIncursio/bp-tracker'
const homepageUrl = import.meta.env.VITE_PROJECT_HOMEPAGE_URL ?? 'https://bp-tracker.arcenciel.io'
const apiDocsUrl = '/api/docs/'
const kofiUrl = 'https://ko-fi.com/fallenincursio'
const appVersion = import.meta.env.VITE_APP_VERSION ?? '0.2.0'

const credits = computed(() => tm('about.credits.items') as CreditItem[])
</script>

<template>
  <section class="page">
    <div class="page-header">
      <div>
        <h1 class="page-title">{{ t('about.title') }}</h1>
        <p class="page-subtitle">{{ t('about.subtitle') }}</p>
      </div>
      <div class="page-actions">
        <a class="secondary-button" :href="githubUrl" target="_blank" rel="noreferrer">
          <BrandGithubIcon :size="16" /> {{ t('about.github') }}
        </a>
        <a class="secondary-button" :href="homepageUrl" target="_blank" rel="noreferrer">
          <ExternalLink :size="16" /> {{ t('about.homepage') }}
        </a>
        <a class="secondary-button" :href="apiDocsUrl" target="_blank" rel="noreferrer">
          <ExternalLink :size="16" /> {{ t('about.apiDocs') }}
        </a>
        <a class="secondary-button kofi-button" :href="kofiUrl" target="_blank" rel="noreferrer">
          <BrandKofiIcon :size="16" /> {{ t('about.kofi.button') }}
        </a>
      </div>
    </div>

    <section class="grid-2 about-grid">
      <article class="panel about-panel">
        <Scale :size="22" />
        <h2 class="panel-title">{{ t('about.licenseTitle') }}</h2>
        <p>{{ t('about.licenseBody', { version: appVersion }) }}</p>
      </article>

      <article class="panel about-panel">
        <HeartHandshake :size="22" />
        <h2 class="panel-title">{{ t('about.credits.title') }}</h2>
        <ul class="credit-list">
          <li v-for="credit in credits" :key="`${credit.label ?? credit.text}-${credit.href ?? ''}`">
            <template v-if="credit.href">
              <a :href="credit.href" target="_blank" rel="noreferrer">{{ credit.label ?? credit.href }}</a>
              <span v-if="credit.text"> {{ credit.text }}</span>
            </template>
            <template v-else>{{ credit.text }}</template>
          </li>
        </ul>
      </article>

      <article class="panel about-panel">
        <BrandKofiIcon :size="24" />
        <h2 class="panel-title">{{ t('about.kofi.title') }}</h2>
        <p>{{ t('about.kofi.body') }}</p>
        <a class="secondary-button fit-button kofi-button" :href="kofiUrl" target="_blank" rel="noreferrer">
          <BrandKofiIcon :size="16" /> {{ t('about.kofi.button') }}
        </a>
      </article>

      <article class="panel about-panel">
        <Info :size="22" />
        <h2 class="panel-title">{{ t('about.disclaimerTitle') }}</h2>
        <p>{{ t('about.disclaimerBody') }}</p>
      </article>
    </section>
  </section>
</template>
