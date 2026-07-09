<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'
import { Eye, EyeOff, LogIn, ShieldCheck, UserPlus } from '@lucide/vue'
import BrandDiscordIcon from './BrandDiscordIcon.vue'
import { api, apiBase } from '../services/api'
import { useAuth } from '../composables/useAuth'
import { useClans } from '../composables/useClans'

const props = withDefaults(
  defineProps<{
    initialMode?: 'login' | 'register'
    redirectOnSuccess?: string
  }>(),
  {
    initialMode: 'login',
    redirectOnSuccess: '',
  }
)

const { user, login, refresh } = useAuth()
const { clans, loadClans } = useClans()
const { t } = useI18n()
const route = useRoute()
const router = useRouter()

const mode = ref<'login' | 'register' | 'setup'>(props.initialMode)
const setupRequired = ref(false)
const setupTokenRequired = ref(false)
const username = ref('')
const password = ref('')
const showPassword = ref(false)
const displayName = ref('')
const email = ref('')
const clanId = ref('')
const setupToken = ref('')
const error = ref('')
const busy = ref(false)

const canSubmit = computed(() => {
  const hasLoginFields = username.value.trim().length >= 2 && password.value.length >= 8
  if (mode.value === 'login') return hasLoginFields
  if (mode.value === 'setup') return hasLoginFields && displayName.value.trim().length >= 2
  return hasLoginFields && displayName.value.trim().length >= 2 && Boolean(clanId.value)
})

const safeRedirect = computed(() => {
  const target = props.redirectOnSuccess.trim()
  if (target.startsWith('/') && !target.startsWith('//')) return target
  return route.fullPath.startsWith('/') ? route.fullPath : '/'
})

const finishAuth = async () => {
  if (props.redirectOnSuccess) {
    await router.push(safeRedirect.value)
  }
}

onMounted(async () => {
  const setup = await api.get<{ setupRequired: boolean; setupTokenRequired: boolean }>('/auth/setup-state')
  setupRequired.value = setup.setupRequired
  setupTokenRequired.value = setup.setupTokenRequired
  if (setup.setupRequired) mode.value = 'setup'
  await loadClans()
  clanId.value = clans.value[0]?.id ?? ''
})

const submit = async () => {
  error.value = ''
  busy.value = true
  try {
    if (mode.value === 'login') {
      await login(username.value, password.value)
    } else if (mode.value === 'setup') {
      await api.post('/auth/setup', {
        username: username.value,
        password: password.value,
        displayName: displayName.value,
        setupToken: setupToken.value || undefined,
      })
      await refresh()
    } else {
      await api.post('/auth/register', {
        username: username.value,
        password: password.value,
        displayName: displayName.value,
        email: email.value || undefined,
        clanId: clanId.value,
      })
      await refresh()
    }
    await finishAuth()
  } catch (err) {
    error.value = err instanceof Error ? err.message : t('auth.failed')
  } finally {
    busy.value = false
  }
}

const startDiscordAuth = () => {
  const params = new URLSearchParams({
    mode: mode.value === 'register' ? 'register' : 'login',
    redirect: safeRedirect.value,
  })
  if (mode.value === 'register' && clanId.value) {
    params.set('clanId', clanId.value)
  }
  window.location.href = `${apiBase}/auth/discord?${params.toString()}`
}

watch(
  () => props.initialMode,
  value => {
    if (!setupRequired.value) mode.value = value
  }
)
</script>

<template>
  <section v-if="!user" class="panel auth-panel">
    <div class="segmented">
      <button :class="{ active: mode === 'login' }" :disabled="setupRequired" @click="mode = 'login'">
        <LogIn :size="16" /> {{ t('auth.login') }}
      </button>
      <button :class="{ active: mode === 'register' }" :disabled="setupRequired" @click="mode = 'register'">
        <UserPlus :size="16" /> {{ t('auth.register') }}
      </button>
      <button v-if="setupRequired" class="active" @click="mode = 'setup'">
        <ShieldCheck :size="16" /> {{ t('auth.setup') }}
      </button>
    </div>

    <button
      v-if="mode !== 'setup'"
      class="discord-button"
      :disabled="setupRequired || (mode === 'register' && !clanId)"
      @click="startDiscordAuth"
    >
      <BrandDiscordIcon :size="16" />
      {{ mode === 'register' ? t('auth.discordRegister') : t('auth.discordLogin') }}
    </button>

    <form class="form-grid" @submit.prevent="submit">
      <label>
        {{ t('auth.username') }}
        <input id="auth-username" v-model="username" name="username" autocomplete="username" />
      </label>
      <label>
        {{ t('auth.password') }}
        <span class="password-field">
          <input id="auth-password" v-model="password" name="password" :type="showPassword ? 'text' : 'password'" autocomplete="current-password" />
          <button
            class="password-toggle-button"
            type="button"
            :title="showPassword ? t('auth.hidePassword') : t('auth.showPassword')"
            :aria-label="showPassword ? t('auth.hidePassword') : t('auth.showPassword')"
            @click="showPassword = !showPassword"
          >
            <EyeOff v-if="showPassword" :size="16" />
            <Eye v-else :size="16" />
          </button>
        </span>
      </label>
      <label v-if="mode !== 'login'">
        {{ t('auth.displayName') }}
        <input id="auth-display-name" v-model="displayName" name="displayName" autocomplete="name" />
      </label>
      <label v-if="mode === 'register'">
        {{ t('auth.email') }}
        <input id="auth-email" v-model="email" name="email" type="email" autocomplete="email" />
      </label>
      <label v-if="mode === 'register'">
        {{ t('auth.clan') }}
        <select id="auth-clan-id" v-model="clanId" name="clanId">
          <option v-for="clan in clans" :key="clan.id" :value="clan.id">{{ clan.name }}</option>
        </select>
      </label>
      <label v-if="mode === 'setup' && setupTokenRequired">
        {{ t('auth.setupToken') }}
        <input id="auth-setup-token" v-model="setupToken" name="setupToken" autocomplete="one-time-code" />
      </label>
      <p v-if="error" class="error-text">{{ error }}</p>
      <button class="primary-button" :disabled="!canSubmit || busy">
        <ShieldCheck v-if="mode === 'setup'" :size="16" />
        <UserPlus v-else-if="mode === 'register'" :size="16" />
        <LogIn v-else :size="16" />
        {{ mode === 'setup' ? t('auth.createAdmin') : mode === 'register' ? t('auth.submitRegister') : t('auth.submitLogin') }}
      </button>
    </form>
  </section>
</template>
