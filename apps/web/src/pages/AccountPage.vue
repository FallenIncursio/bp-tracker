<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute } from 'vue-router'
import { Bell, CheckCircle2, Inbox, KeyRound, Link2, Link2Off, Lock, Save, Settings, Shield, UserCircle, Users } from '@lucide/vue'
import type { AuthResponse } from '../services/api'
import AuthPanel from '../components/AuthPanel.vue'
import BrandDiscordIcon from '../components/BrandDiscordIcon.vue'
import { useAuth } from '../composables/useAuth'
import { api } from '../services/api'
import { formatDateTime } from '../utils/labels'

type Notification = {
  id: string
  title: string
  body: string
  readAt: string | null
  createdAt: string
}

type NotificationPreferences = {
  inAppEnabled: boolean
  discordEnabled: boolean
  missingBpAlerts: boolean
  wantedBpAlerts: boolean
  planetExpiryAlerts: boolean
}

const { user, refresh } = useAuth()
const { t, te, locale } = useI18n()
const route = useRoute()
const notifications = ref<Notification[]>([])
const preferences = ref<NotificationPreferences | null>(null)
const profileForm = ref({ displayName: '' })
const profileMessage = ref('')
const profileError = ref('')
const profileBusy = ref(false)
const passwordForm = ref({ currentPassword: '', newPassword: '', confirmPassword: '' })
const passwordMessage = ref('')
const passwordError = ref('')
const passwordBusy = ref(false)
const preferencesMessage = ref('')
const preferencesError = ref('')
const preferencesBusy = ref(false)
const discordUnlinkPassword = ref('')
const discordMessage = ref('')
const discordError = ref('')
const discordBusy = ref(false)
const showPasswordForm = ref(false)

const discordStatusMessage = computed(() => {
  const status = route.query.discord
  if (typeof status !== 'string') return ''
  const key = `account.discordStatus.${status}`
  return te(key) ? t(key) : ''
})

const enumLabel = (scope: 'role' | 'status', value: string | null | undefined) => {
  if (!value) return '-'
  const key = `${scope}.${value}`
  return te(key) ? t(key) : value
}

const activeMemberships = computed(() => user.value?.memberships.filter(membership => membership.status === 'ACTIVE') ?? [])
const unreadNotifications = computed(() => notifications.value.filter(notification => !notification.readAt).length)
const connectedDiscordName = computed(() => {
  if (!user.value?.discord.linked) return t('account.discordNotLinked')
  return user.value.discord.globalName || user.value.discord.username || t('account.discordLinked')
})
const accountRoleLabel = computed(() => {
  if (user.value?.globalRole === 'ADMIN') return enumLabel('role', 'ADMIN')
  const primaryMembership = activeMemberships.value[0] ?? user.value?.memberships[0]
  return primaryMembership ? enumLabel('role', primaryMembership.role) : t('app.guest')
})
const accountInitials = computed(() => {
  const name = user.value?.displayName || user.value?.username || ''
  const parts = name
    .trim()
    .split(/\s+/)
    .filter(Boolean)
  if (parts.length >= 2) return `${parts[0]![0]}${parts[1]![0]}`.toUpperCase()
  return name.slice(0, 2).toUpperCase() || 'BP'
})
const passwordStatusLabel = computed(() => (user.value?.hasPassword ? t('account.passwordReady') : t('account.passwordMissing')))
const passwordStatusHint = computed(() => (user.value?.hasPassword ? t('account.passwordReadyHint') : t('account.passwordMissingHint')))

const loadNotifications = async () => {
  if (!user.value) return
  const response = await api.get<{ notifications: Notification[] }>('/notifications')
  notifications.value = response.notifications
}

const loadPreferences = async () => {
  if (!user.value) return
  const response = await api.get<{ preferences: NotificationPreferences }>('/notifications/preferences')
  preferences.value = response.preferences
}

const saveProfile = async () => {
  profileMessage.value = ''
  profileError.value = ''
  profileBusy.value = true
  try {
    await api.patch('/users/me', { displayName: profileForm.value.displayName })
    await refresh()
    profileMessage.value = t('account.profileSaved')
  } catch (err) {
    profileError.value = err instanceof Error ? err.message : t('account.profileFailed')
  } finally {
    profileBusy.value = false
  }
}

const markRead = async (id: string) => {
  await api.patch(`/notifications/${id}/read`)
  await loadNotifications()
}

const savePassword = async () => {
  passwordMessage.value = ''
  passwordError.value = ''
  if (passwordForm.value.newPassword !== passwordForm.value.confirmPassword) {
    passwordError.value = t('account.passwordMismatch')
    return
  }

  passwordBusy.value = true
  try {
    const hadPassword = Boolean(user.value?.hasPassword)
    if (hadPassword) {
      await api.post('/auth/change-password', {
        currentPassword: passwordForm.value.currentPassword,
        newPassword: passwordForm.value.newPassword,
      })
    } else {
      await api.post('/auth/set-password', {
        newPassword: passwordForm.value.newPassword,
      })
    }
    passwordForm.value = { currentPassword: '', newPassword: '', confirmPassword: '' }
    await refresh()
    showPasswordForm.value = false
    passwordMessage.value = hadPassword ? t('account.passwordChanged') : t('account.passwordSet')
  } catch (err) {
    passwordError.value = err instanceof Error ? err.message : t('account.passwordFailed')
  } finally {
    passwordBusy.value = false
  }
}

const connectDiscord = async () => {
  discordMessage.value = ''
  discordError.value = ''
  discordBusy.value = true
  try {
    const response = await api.post<{ authorizeUrl: string }>('/auth/discord/link', { redirect: '/account' })
    window.location.href = response.authorizeUrl
  } catch (err) {
    discordError.value = err instanceof Error ? err.message : t('account.discordFailed')
    discordBusy.value = false
  }
}

const unlinkDiscord = async () => {
  discordMessage.value = ''
  discordError.value = ''
  discordBusy.value = true
  try {
    const response = await api.post<AuthResponse>('/auth/discord/unlink', { currentPassword: discordUnlinkPassword.value })
    await refresh()
    discordUnlinkPassword.value = ''
    discordMessage.value = response.user?.discord.linked ? '' : t('account.discordUnlinked')
  } catch (err) {
    discordError.value = err instanceof Error ? err.message : t('account.discordFailed')
  } finally {
    discordBusy.value = false
  }
}

const savePreferences = async () => {
  if (!preferences.value) return
  preferencesMessage.value = ''
  preferencesError.value = ''
  preferencesBusy.value = true
  try {
    const response = await api.patch<{ preferences: NotificationPreferences }>('/notifications/preferences', preferences.value)
    preferences.value = response.preferences
    preferencesMessage.value = t('account.preferencesSaved')
  } catch (err) {
    preferencesError.value = err instanceof Error ? err.message : t('account.preferencesFailed')
  } finally {
    preferencesBusy.value = false
  }
}

const dateTime = (value: string | null | undefined) => formatDateTime(value, locale.value)

watch(
  user,
  async currentUser => {
    if (!currentUser) return
    profileForm.value.displayName = currentUser.displayName
    showPasswordForm.value = false
    await Promise.all([loadNotifications(), loadPreferences()])
  },
  { immediate: true }
)
</script>

<template>
  <section class="page">
    <div class="page-header">
      <div>
        <h1 class="page-title">{{ t('account.title') }}</h1>
        <p class="page-subtitle">{{ user?.displayName ?? t('account.notLoggedIn') }}</p>
      </div>
    </div>

    <AuthPanel />

    <section v-if="user" class="account-view">
      <article class="panel account-hero">
        <div class="account-hero-main">
          <div class="account-avatar" aria-hidden="true">{{ accountInitials }}</div>
          <div class="account-identity">
            <p class="account-kicker">{{ t('account.accountSummary') }}</p>
            <h2>{{ user.displayName }}</h2>
            <p class="muted">@{{ user.username }}</p>
            <div class="account-chip-row">
              <span class="status-chip status-chip-active"><Shield :size="14" /> {{ accountRoleLabel }}</span>
              <span class="status-chip" :class="user.discord.linked ? 'status-chip-active' : 'status-chip-muted'">
                <BrandDiscordIcon :size="14" /> {{ connectedDiscordName }}
              </span>
              <span class="status-chip" :class="user.hasPassword ? 'status-chip-active' : 'status-chip-warning'">
                <Lock :size="14" /> {{ passwordStatusLabel }}
              </span>
            </div>
          </div>
        </div>
        <div class="account-summary-grid">
          <div class="account-summary-item">
            <span>{{ t('account.memberships') }}</span>
            <strong>{{ user.memberships.length }}</strong>
            <small>{{ t('account.activeMembershipCount', { count: activeMemberships.length }) }}</small>
          </div>
          <div class="account-summary-item">
            <span>{{ t('account.notifications') }}</span>
            <strong>{{ unreadNotifications }}</strong>
            <small>{{ t('account.unreadCount', { count: unreadNotifications }) }}</small>
          </div>
          <div class="account-summary-item">
            <span>{{ t('account.connectedAccounts') }}</span>
            <strong>{{ user.discord.linked ? '1' : '0' }}</strong>
            <small>{{ user.discord.linked ? t('account.discordLinked') : t('account.discordNotLinked') }}</small>
          </div>
        </div>
      </article>

      <div class="account-layout">
        <nav class="panel account-nav" :aria-label="t('account.sectionNavigation')">
          <a href="#account-profile"><UserCircle :size="17" /> {{ t('account.profile') }}</a>
          <a href="#account-security"><KeyRound :size="17" /> {{ t('account.security') }}</a>
          <a href="#account-connections"><Link2 :size="17" /> {{ t('account.connectionsNav') }}</a>
          <a href="#account-preferences"><Settings :size="17" /> {{ t('account.preferencesNav') }}</a>
          <a href="#account-memberships"><Users :size="17" /> {{ t('account.clansNav') }}</a>
          <a href="#account-inbox"><Inbox :size="17" /> {{ t('account.inboxNav') }}</a>
        </nav>

        <div class="account-sections">
          <article id="account-profile" class="panel account-section">
            <div class="account-section-header">
              <div>
                <h2 class="panel-title"><UserCircle :size="18" /> {{ t('account.profile') }}</h2>
                <p class="panel-subtitle">{{ t('account.profileSubtitle') }}</p>
              </div>
            </div>
            <form class="account-form-grid" @submit.prevent="saveProfile">
              <label>
                {{ t('auth.displayName') }}
                <input id="profile-display-name" v-model="profileForm.displayName" name="displayName" autocomplete="name" />
              </label>
              <div class="account-readonly-field">
                <span>{{ t('account.username') }}</span>
                <strong>{{ user.username }}</strong>
              </div>
              <p v-if="profileMessage" class="success-text">{{ profileMessage }}</p>
              <p v-if="profileError" class="error-text">{{ profileError }}</p>
              <button class="primary-button" :disabled="profileBusy || profileForm.displayName.trim().length < 2">
                <Save :size="16" /> {{ t('app.actions.save') }}
              </button>
            </form>
          </article>

          <article id="account-security" class="panel account-section">
            <div class="account-section-header">
              <div>
                <h2 class="panel-title"><KeyRound :size="18" /> {{ t('account.security') }}</h2>
                <p class="panel-subtitle">{{ t('account.securitySubtitle') }}</p>
              </div>
            </div>
            <div class="account-status-card">
              <div class="account-status-icon" :class="user.hasPassword ? 'account-status-icon-good' : 'account-status-icon-warning'">
                <Lock :size="20" />
              </div>
              <div>
                <strong>{{ passwordStatusLabel }}</strong>
                <p class="muted">{{ passwordStatusHint }}</p>
              </div>
              <button class="secondary-button" type="button" @click="showPasswordForm = !showPasswordForm">
                <KeyRound :size="16" />
                {{ showPasswordForm ? t('account.hidePasswordForm') : user.hasPassword ? t('account.changePassword') : t('account.setPassword') }}
              </button>
            </div>
            <form v-if="showPasswordForm" class="account-form-grid account-password-form" @submit.prevent="savePassword">
              <label v-if="user.hasPassword">
                {{ t('account.currentPassword') }}
                <input id="account-current-password" v-model="passwordForm.currentPassword" name="currentPassword" type="password" autocomplete="current-password" />
              </label>
              <label>
                {{ t('account.newPassword') }}
                <input id="account-new-password" v-model="passwordForm.newPassword" name="newPassword" type="password" autocomplete="new-password" />
              </label>
              <label>
                {{ t('account.repeatPassword') }}
                <input id="account-confirm-password" v-model="passwordForm.confirmPassword" name="confirmPassword" type="password" autocomplete="new-password" />
              </label>
              <p v-if="passwordMessage" class="success-text">{{ passwordMessage }}</p>
              <p v-if="passwordError" class="error-text">{{ passwordError }}</p>
              <button
                class="primary-button"
                :disabled="passwordBusy || passwordForm.newPassword.length < 8 || (user.hasPassword && !passwordForm.currentPassword)"
              >
                <KeyRound :size="16" /> {{ t('account.savePassword') }}
              </button>
            </form>
            <p v-else-if="passwordMessage" class="success-text">{{ passwordMessage }}</p>
            <p v-else-if="passwordError" class="error-text">{{ passwordError }}</p>
          </article>

          <article id="account-connections" class="panel account-section">
            <div class="account-section-header">
              <div>
                <h2 class="panel-title"><Link2 :size="18" /> {{ t('account.connectedAccounts') }}</h2>
                <p class="panel-subtitle">{{ t('account.connectionsSubtitle') }}</p>
              </div>
            </div>
            <p v-if="discordStatusMessage" class="success-text">{{ discordStatusMessage }}</p>
            <div class="account-connection-card">
              <div class="account-connection-icon">
                <BrandDiscordIcon :size="24" />
              </div>
              <div>
                <div class="account-connection-label">
                  <strong>Discord</strong>
                  <span class="status-chip" :class="user.discord.linked ? 'status-chip-active' : 'status-chip-muted'">
                    {{ user.discord.linked ? t('account.discordLinked') : t('account.discordNotLinked') }}
                  </span>
                </div>
                <p class="muted">{{ connectedDiscordName }}</p>
              </div>
              <button v-if="!user.discord.linked" class="primary-button" :disabled="discordBusy" @click="connectDiscord">
                <BrandDiscordIcon :size="16" /> {{ t('account.discordConnect') }}
              </button>
            </div>
            <form v-if="user.discord.linked" class="inline-form account-unlink-form" @submit.prevent="unlinkDiscord">
              <input
                id="discord-unlink-password"
                v-model="discordUnlinkPassword"
                name="discordUnlinkPassword"
                type="password"
                autocomplete="current-password"
                :placeholder="t('account.currentPassword')"
                :disabled="!user.hasPassword"
              />
              <button class="secondary-button" :disabled="discordBusy || !user.hasPassword || discordUnlinkPassword.length < 8">
                <Link2Off :size="16" /> {{ t('account.discordUnlink') }}
              </button>
            </form>
            <p v-if="user.discord.linked && !user.hasPassword" class="muted">{{ t('account.passwordBeforeDiscordUnlink') }}</p>
            <p v-if="discordMessage" class="success-text">{{ discordMessage }}</p>
            <p v-if="discordError" class="error-text">{{ discordError }}</p>
          </article>

          <article id="account-preferences" class="panel account-section">
            <div class="account-section-header">
              <div>
                <h2 class="panel-title"><Settings :size="18" /> {{ t('account.notificationSettings') }}</h2>
                <p class="panel-subtitle">{{ t('account.notificationSettingsSubtitle') }}</p>
              </div>
            </div>
            <form v-if="preferences" class="form-grid" @submit.prevent="savePreferences">
              <div class="account-preference-grid">
                <fieldset class="preference-group">
                  <legend>{{ t('account.notificationChannels') }}</legend>
                  <label class="toggle-row">
                    <input id="notification-in-app-enabled" v-model="preferences.inAppEnabled" name="inAppEnabled" type="checkbox" />
                    <span>{{ t('account.inAppEnabled') }}</span>
                  </label>
                  <label class="toggle-row">
                    <input
                      id="notification-discord-enabled"
                      v-model="preferences.discordEnabled"
                      name="discordEnabled"
                      type="checkbox"
                      :disabled="!user.discord.linked"
                    />
                    <span>{{ t('account.discordEnabled') }}</span>
                  </label>
                </fieldset>
                <fieldset class="preference-group">
                  <legend>{{ t('account.notificationTypes') }}</legend>
                  <label class="toggle-row">
                    <input id="notification-missing-bp-alerts" v-model="preferences.missingBpAlerts" name="missingBpAlerts" type="checkbox" />
                    <span>{{ t('account.missingBpAlerts') }}</span>
                  </label>
                  <label class="toggle-row">
                    <input id="notification-wanted-bp-alerts" v-model="preferences.wantedBpAlerts" name="wantedBpAlerts" type="checkbox" />
                    <span>{{ t('account.wantedBpAlerts') }}</span>
                  </label>
                  <label class="toggle-row">
                    <input id="notification-planet-expiry-alerts" v-model="preferences.planetExpiryAlerts" name="planetExpiryAlerts" type="checkbox" />
                    <span>{{ t('account.planetExpiryAlerts') }}</span>
                  </label>
                </fieldset>
              </div>
              <p v-if="preferencesMessage" class="success-text">{{ preferencesMessage }}</p>
              <p v-if="preferencesError" class="error-text">{{ preferencesError }}</p>
              <button class="primary-button" :disabled="preferencesBusy">
                <Bell :size="16" /> {{ t('app.actions.save') }}
              </button>
            </form>
          </article>

          <article id="account-memberships" class="panel account-section">
            <div class="account-section-header">
              <div>
                <h2 class="panel-title"><Users :size="18" /> {{ t('account.memberships') }}</h2>
                <p class="panel-subtitle">{{ t('account.membershipsSubtitle') }}</p>
              </div>
            </div>
            <div v-if="user.memberships.length" class="membership-card-grid">
              <article v-for="membership in user.memberships" :key="membership.clanId" class="membership-card">
                <div class="membership-card-main">
                  <strong>{{ membership.clanName }}</strong>
                  <span class="muted">{{ membership.clanSlug }}</span>
                </div>
                <div class="membership-card-meta">
                  <span class="status-chip">{{ enumLabel('role', membership.role) }}</span>
                  <span class="status-chip" :class="membership.status === 'ACTIVE' ? 'status-chip-active' : 'status-chip-warning'">
                    {{ enumLabel('status', membership.status) }}
                  </span>
                  <span class="status-chip" :class="membership.trackingExcluded ? 'status-chip-muted' : 'status-chip-active'">
                    {{ membership.trackingExcluded ? t('account.trackingExcluded') : t('account.trackingIncluded') }}
                  </span>
                </div>
              </article>
            </div>
            <p v-else class="compact-empty muted">{{ t('account.noMemberships') }}</p>
          </article>

          <article id="account-inbox" class="panel account-section account-notifications">
            <div class="account-section-header">
              <div>
                <h2 class="panel-title"><Inbox :size="18" /> {{ t('account.notifications') }}</h2>
                <p class="panel-subtitle">{{ t('account.inboxSubtitle') }}</p>
              </div>
              <span class="status-chip" :class="unreadNotifications ? 'status-chip-warning' : 'status-chip-active'">
                {{ t('account.unreadCount', { count: unreadNotifications }) }}
              </span>
            </div>
            <div v-if="notifications.length" class="notification-list">
              <article
                v-for="notification in notifications"
                :key="notification.id"
                class="notification-item"
                :class="{ 'notification-item-unread': !notification.readAt }"
              >
                <div class="notification-copy">
                  <strong>{{ notification.title }}</strong>
                  <p class="muted">{{ notification.body }}</p>
                </div>
                <div class="notification-meta">
                  <time class="muted">{{ dateTime(notification.createdAt) }}</time>
                  <button v-if="!notification.readAt" class="secondary-button" @click="markRead(notification.id)">
                    <CheckCircle2 :size="16" /> {{ t('account.markRead') }}
                  </button>
                  <span v-else class="status-chip status-chip-muted">{{ t('account.read') }}</span>
                </div>
              </article>
            </div>
            <p v-else class="compact-empty muted">{{ t('account.noNotifications') }}</p>
          </article>
        </div>
      </div>
    </section>
  </section>
</template>
