<script setup lang="ts">
import { computed, watch } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { CheckCircle2, LogIn, UserPlus } from '@lucide/vue'
import AuthPanel from '../components/AuthPanel.vue'
import { useAuth } from '../composables/useAuth'

const props = withDefaults(
  defineProps<{
    initialMode?: 'login' | 'register'
  }>(),
  {
    initialMode: 'login',
  }
)

const route = useRoute()
const router = useRouter()
const { user } = useAuth()
const { t } = useI18n()

const redirectTarget = computed(() => {
  const redirect = typeof route.query.redirect === 'string' ? route.query.redirect : '/'
  return redirect.startsWith('/') && !redirect.startsWith('//') ? redirect : '/'
})
const alternateMode = computed(() => (props.initialMode === 'login' ? 'register' : 'login'))
const alternatePath = computed(() => (alternateMode.value === 'login' ? '/login' : '/register'))
const authTitle = computed(() => (props.initialMode === 'login' ? t('auth.pageLoginTitle') : t('auth.pageRegisterTitle')))
const authSubtitle = computed(() => (props.initialMode === 'login' ? t('auth.pageLoginSubtitle') : t('auth.pageRegisterSubtitle')))
const alternateLabel = computed(() => (alternateMode.value === 'login' ? t('auth.login') : t('auth.register')))

watch(
  user,
  currentUser => {
    if (currentUser) {
      void router.replace(redirectTarget.value)
    }
  },
  { immediate: true }
)
</script>

<template>
  <section class="page auth-page">
    <div class="auth-hero">
      <div>
        <p class="account-kicker">{{ t('auth.guestMode') }}</p>
        <h1 class="page-title">{{ authTitle }}</h1>
        <p class="page-subtitle">{{ authSubtitle }}</p>
      </div>
    </div>

    <div class="auth-layout">
      <AuthPanel :key="initialMode" :initial-mode="initialMode" :redirect-on-success="redirectTarget" />

      <aside class="panel auth-info-panel">
        <h2 class="panel-title">
          <LogIn v-if="initialMode === 'login'" :size="18" />
          <UserPlus v-else :size="18" />
          {{ t('auth.whyLoginTitle') }}
        </h2>
        <ul class="auth-benefit-list">
          <li><CheckCircle2 :size="16" /> {{ t('auth.whyLoginStatus') }}</li>
          <li><CheckCircle2 :size="16" /> {{ t('auth.whyLoginNotifications') }}</li>
          <li><CheckCircle2 :size="16" /> {{ t('auth.whyLoginRoadmap') }}</li>
        </ul>
        <RouterLink class="secondary-button auth-switch-link" :to="{ path: alternatePath, query: { redirect: redirectTarget } }">
          {{ alternateLabel }}
        </RouterLink>
      </aside>
    </div>
  </section>
</template>
