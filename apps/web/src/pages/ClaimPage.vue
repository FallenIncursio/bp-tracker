<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'
import { Eye, EyeOff, KeyRound, Link2 } from '@lucide/vue'
import { api } from '../services/api'
import { useAuth } from '../composables/useAuth'

type AccountInvitePreview = {
  displayName: string
  clanName: string | null
  expiresAt: string
}

const { t, locale } = useI18n()
const route = useRoute()
const router = useRouter()
const { refresh } = useAuth()

const invite = ref<AccountInvitePreview | null>(null)
const loading = ref(true)
const busy = ref(false)
const error = ref('')
const message = ref('')
const password = ref('')
const confirmPassword = ref('')
const showPassword = ref(false)

const token = computed(() => (typeof route.params.token === 'string' ? route.params.token : ''))
const expiresAtLabel = computed(() =>
  invite.value ? new Intl.DateTimeFormat(locale.value, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(invite.value.expiresAt)) : '',
)
const canSubmit = computed(() => password.value.length >= 8 && password.value === confirmPassword.value && Boolean(invite.value) && !busy.value)

const loadInvite = async () => {
  loading.value = true
  error.value = ''
  try {
    const response = await api.get<{ invite: AccountInvitePreview }>(`/auth/invites/${encodeURIComponent(token.value)}`)
    invite.value = response.invite
  } catch (err) {
    invite.value = null
    error.value = err instanceof Error ? err.message : t('auth.claimInvalid')
  } finally {
    loading.value = false
  }
}

const acceptInvite = async () => {
  error.value = ''
  message.value = ''
  if (password.value !== confirmPassword.value) {
    error.value = t('auth.claimPasswordMismatch')
    return
  }
  if (password.value.length < 8) {
    error.value = t('auth.claimPasswordTooShort')
    return
  }

  busy.value = true
  try {
    await api.post(`/auth/invites/${encodeURIComponent(token.value)}/accept`, { newPassword: password.value })
    await refresh()
    message.value = t('auth.claimAccepted')
    await router.push('/account')
  } catch (err) {
    error.value = err instanceof Error ? err.message : t('auth.claimFailed')
  } finally {
    busy.value = false
  }
}

onMounted(loadInvite)
</script>

<template>
  <section class="page auth-page">
    <div class="auth-hero">
      <div>
        <p class="account-kicker">{{ t('auth.claimKicker') }}</p>
        <h1 class="page-title">{{ t('auth.claimTitle') }}</h1>
        <p class="page-subtitle">{{ t('auth.claimSubtitle') }}</p>
      </div>
    </div>

    <div class="auth-layout">
      <section class="panel auth-panel">
        <div v-if="loading" class="muted">{{ t('auth.claimLoading') }}</div>
        <template v-else-if="invite">
          <div class="claim-summary">
            <div class="account-avatar" aria-hidden="true">
              <Link2 :size="22" />
            </div>
            <div>
              <h2 class="panel-title">{{ invite.displayName }}</h2>
              <p class="muted">{{ invite.clanName ?? t('auth.claimNoClan') }}</p>
              <p class="muted">{{ t('auth.claimExpires', { date: expiresAtLabel }) }}</p>
            </div>
          </div>

          <form class="form-grid" @submit.prevent="acceptInvite">
            <label>
              {{ t('auth.newPassword') }}
              <span class="password-field">
                <input id="claim-password" v-model="password" name="claimPassword" :type="showPassword ? 'text' : 'password'" autocomplete="new-password" />
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
            <label>
              {{ t('auth.confirmPassword') }}
              <input id="claim-confirm-password" v-model="confirmPassword" name="claimConfirmPassword" :type="showPassword ? 'text' : 'password'" autocomplete="new-password" />
            </label>
            <p v-if="message" class="success-text">{{ message }}</p>
            <p v-if="error" class="error-text">{{ error }}</p>
            <button class="primary-button" :disabled="!canSubmit"><KeyRound :size="16" /> {{ t('auth.claimSubmit') }}</button>
          </form>
        </template>
        <p v-else class="error-text">{{ error }}</p>
      </section>
    </div>
  </section>
</template>
