<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { Ban, Check, History, Pin, Plus, RefreshCw, RotateCcw, Save, Search, Send, X } from '@lucide/vue'
import AuthPanel from '../components/AuthPanel.vue'
import AppTooltip from '../components/AppTooltip.vue'
import BrandDiscordIcon from '../components/BrandDiscordIcon.vue'
import { api } from '../services/api'
import { useAuth } from '../composables/useAuth'
import { useClans } from '../composables/useClans'
import { formatDateTime } from '../utils/labels'

type Member = {
  userId: string
  displayName: string
  username: string
  role: string
  status: string
  trackingExcluded: boolean
  trackingExcludedAt: string | null
  trackingExcludedReason: string | null
}

type ClanDiscordSettings = {
  clanId: string
  guildId: string
  notificationChannelId: string
  notificationChannelName: string
  enabled: boolean
  statusEnabled: boolean
  statusChannelId: string
  statusChannelName: string
  statusRoadmapMessageId: string
  statusPlanetsMessageId: string
  statusPinMessages: boolean
  statusLastPublishedAt: string | null
  statusLastError: string | null
}

type DiscordChannel = {
  id: string
  name: string
  displayName: string
  type: number
  guildId: string
  parentId: string | null
}

type AuditLog = {
  id: string
  actorUserId: string | null
  actor: { id: string; displayName: string; username: string } | null
  clanId: string | null
  action: string
  entityType: string
  entityId: string | null
  summary: string | null
  beforeJson: unknown
  afterJson: unknown
  createdAt: string
}

const { user, isAdmin } = useAuth()
const { selectedClanId, canManageSelectedClan, loadClans } = useClans()
const { t, te, locale } = useI18n()
const members = ref<Member[]>([])
const registrations = ref<Array<{ userId: string; displayName: string; username: string; email: string | null }>>([])
const clanForm = ref({ name: '', slug: '' })
const passwordResets = ref<Record<string, string>>({})
const trackingReasons = ref<Record<string, string>>({})
const trackingBusy = ref<Record<string, boolean>>({})
const passwordResetMessage = ref('')
const passwordResetError = ref('')
const discordSettings = ref<ClanDiscordSettings>({
  clanId: '',
  guildId: '',
  notificationChannelId: '',
  notificationChannelName: '',
  enabled: false,
  statusEnabled: false,
  statusChannelId: '',
  statusChannelName: '',
  statusRoadmapMessageId: '',
  statusPlanetsMessageId: '',
  statusPinMessages: true,
  statusLastPublishedAt: null,
  statusLastError: null,
})
const discordMessage = ref('')
const discordError = ref('')
const discordBusy = ref(false)
const discordTestBusy = ref(false)
const discordStatusBusy = ref(false)
const discordStatusRecreateBusy = ref(false)
const discordChannels = ref<DiscordChannel[]>([])
const discordChannelsAvailable = ref(false)
const discordChannelsBusy = ref(false)
const discordChannelsError = ref('')
const auditLogs = ref<AuditLog[]>([])
const auditTotal = ref(0)
const auditPage = ref(1)
const auditLimit = 25
const auditSearch = ref('')
const auditAction = ref('')
const auditEntityType = ref('')
const auditBusy = ref(false)

const canManageDiscordSettings = computed(() => {
  if (isAdmin.value) return true
  return (
    user.value?.memberships.some(
      membership => membership.clanId === selectedClanId.value && membership.status === 'ACTIVE' && membership.role === 'ADMIRAL'
    ) ?? false
  )
})

const normalizeDiscordSettings = (settings: {
  clanId: string
  guildId: string | null
  notificationChannelId: string | null
  notificationChannelName: string | null
  enabled: boolean
  statusEnabled: boolean
  statusChannelId: string | null
  statusChannelName: string | null
  statusRoadmapMessageId: string | null
  statusPlanetsMessageId: string | null
  statusPinMessages: boolean
  statusLastPublishedAt: string | null
  statusLastError: string | null
}): ClanDiscordSettings => ({
  clanId: settings.clanId,
  guildId: settings.guildId ?? '',
  notificationChannelId: settings.notificationChannelId ?? '',
  notificationChannelName: settings.notificationChannelName ?? '',
  enabled: settings.enabled,
  statusEnabled: settings.statusEnabled,
  statusChannelId: settings.statusChannelId ?? '',
  statusChannelName: settings.statusChannelName ?? '',
  statusRoadmapMessageId: settings.statusRoadmapMessageId ?? '',
  statusPlanetsMessageId: settings.statusPlanetsMessageId ?? '',
  statusPinMessages: settings.statusPinMessages,
  statusLastPublishedAt: settings.statusLastPublishedAt,
  statusLastError: settings.statusLastError,
})

const discordGuildIdPattern = /^\d{17,20}$/
const canLoadDiscordChannels = computed(() => discordGuildIdPattern.test(discordSettings.value.guildId.trim()))
const selectedNotificationDiscordChannel = computed(() =>
  discordChannels.value.find(channel => channel.id === discordSettings.value.notificationChannelId.trim())
)
const selectedStatusDiscordChannel = computed(() => discordChannels.value.find(channel => channel.id === discordSettings.value.statusChannelId.trim()))

const resetDiscordChannels = () => {
  discordChannels.value = []
  discordChannelsAvailable.value = false
  discordChannelsError.value = ''
}

const syncDiscordChannelNames = () => {
  if (selectedNotificationDiscordChannel.value) {
    discordSettings.value.notificationChannelName = selectedNotificationDiscordChannel.value.displayName
  }
  if (selectedStatusDiscordChannel.value) {
    discordSettings.value.statusChannelName = selectedStatusDiscordChannel.value.displayName
  }
}

const loadDiscordChannels = async () => {
  if (!selectedClanId.value || !canManageDiscordSettings.value) return
  discordChannelsError.value = ''
  discordChannelsAvailable.value = false

  const guildId = discordSettings.value.guildId.trim()
  if (!discordGuildIdPattern.test(guildId)) {
    discordChannels.value = []
    discordChannelsError.value = t('admin.discordServerIdRequired')
    return
  }

  discordChannelsBusy.value = true
  try {
    const params = new URLSearchParams({ guildId })
    const response = await api.get<{ available: boolean; channels: DiscordChannel[]; error?: string }>(
      `/clans/${selectedClanId.value}/discord-channels?${params}`
    )
    discordChannels.value = response.channels
    discordChannelsAvailable.value = response.available
    discordChannelsError.value = response.available ? '' : t('admin.discordChannelsUnavailable')
    syncDiscordChannelNames()
  } catch (err) {
    discordChannels.value = []
    discordChannelsError.value = err instanceof Error ? err.message : t('admin.discordChannelsUnavailable')
  } finally {
    discordChannelsBusy.value = false
  }
}

const onDiscordChannelSelect = () => syncDiscordChannelNames()

const loadMembers = async () => {
  if (!selectedClanId.value || !user.value) return
  const response = await api.get<{ members: Member[] }>(`/clans/${selectedClanId.value}/members`)
  members.value = response.members
  trackingReasons.value = Object.fromEntries(response.members.map(member => [member.userId, member.trackingExcludedReason ?? '']))
}

const loadRegistrations = async () => {
  if (!selectedClanId.value || !canManageSelectedClan.value) return
  const response = await api.get<{ registrations: typeof registrations.value }>(`/clans/${selectedClanId.value}/registrations`)
  registrations.value = response.registrations
}

const loadDiscordSettings = async () => {
  if (!selectedClanId.value || !canManageDiscordSettings.value) return
  const response = await api.get<{ settings: ReturnType<typeof normalizeDiscordSettings> }>(`/clans/${selectedClanId.value}/discord-settings`)
  discordSettings.value = normalizeDiscordSettings(response.settings)
  resetDiscordChannels()
  if (discordSettings.value.guildId) {
    await loadDiscordChannels()
  }
}

const approve = async (userId: string, role = 'MEMBER') => {
  if (!selectedClanId.value) return
  await api.post(`/clans/${selectedClanId.value}/registrations/${userId}/approve`, { role })
  await Promise.all([loadMembers(), loadRegistrations()])
}

const reject = async (userId: string) => {
  if (!selectedClanId.value) return
  await api.post(`/clans/${selectedClanId.value}/registrations/${userId}/reject`)
  await loadRegistrations()
}

const setRole = async (member: Member, role: string) => {
  if (!selectedClanId.value) return
  await api.patch(`/clans/${selectedClanId.value}/members/${member.userId}/role`, { role })
  await loadMembers()
}

const setTrackingExcluded = async (member: Member, trackingExcluded: boolean) => {
  if (!selectedClanId.value) return
  trackingBusy.value = { ...trackingBusy.value, [member.userId]: true }
  try {
    await api.patch(`/clans/${selectedClanId.value}/members/${member.userId}/tracking`, {
      trackingExcluded,
      reason: trackingReasons.value[member.userId] ?? '',
    })
    await Promise.all([loadMembers(), isAdmin.value ? loadAudit() : Promise.resolve()])
  } finally {
    trackingBusy.value = { ...trackingBusy.value, [member.userId]: false }
  }
}

const loadAudit = async () => {
  if (!isAdmin.value) return
  auditBusy.value = true
  try {
    const params = new URLSearchParams({ page: String(auditPage.value), limit: String(auditLimit) })
    if (auditSearch.value.trim()) params.set('search', auditSearch.value.trim())
    if (auditAction.value.trim()) params.set('action', auditAction.value.trim())
    if (auditEntityType.value.trim()) params.set('entityType', auditEntityType.value.trim())
    const response = await api.get<{ logs: AuditLog[]; total: number }>(`/audit?${params}`)
    auditLogs.value = response.logs
    auditTotal.value = response.total
  } finally {
    auditBusy.value = false
  }
}

const resetAuditFilters = async () => {
  auditSearch.value = ''
  auditAction.value = ''
  auditEntityType.value = ''
  auditPage.value = 1
  await loadAudit()
}

const applyAuditFilters = async () => {
  auditPage.value = 1
  await loadAudit()
}

const previousAuditPage = async () => {
  auditPage.value = Math.max(1, auditPage.value - 1)
  await loadAudit()
}

const nextAuditPage = async () => {
  auditPage.value = Math.min(auditPageCount.value, auditPage.value + 1)
  await loadAudit()
}

const createClan = async () => {
  await api.post('/clans', clanForm.value)
  clanForm.value = { name: '', slug: '' }
  await loadClans()
}

const saveDiscordSettings = async () => {
  if (!selectedClanId.value) return
  discordMessage.value = ''
  discordError.value = ''
  discordBusy.value = true
  try {
    const response = await api.patch<{ settings: ReturnType<typeof normalizeDiscordSettings> }>(
      `/clans/${selectedClanId.value}/discord-settings`,
      discordSettings.value
    )
    discordSettings.value = normalizeDiscordSettings(response.settings)
    if (discordSettings.value.guildId) {
      await loadDiscordChannels()
    }
    discordMessage.value = t('admin.discordSaved')
  } catch (err) {
    discordError.value = err instanceof Error ? err.message : t('admin.discordFailed')
  } finally {
    discordBusy.value = false
  }
}

const testDiscordSettings = async () => {
  if (!selectedClanId.value) return
  discordMessage.value = ''
  discordError.value = ''
  discordTestBusy.value = true
  try {
    await api.post(`/clans/${selectedClanId.value}/discord-settings/test`)
    discordMessage.value = t('admin.discordTestSent')
  } catch (err) {
    discordError.value = err instanceof Error ? err.message : t('admin.discordFailed')
  } finally {
    discordTestBusy.value = false
  }
}

const publishDiscordStatus = async (recreateMessages = false) => {
  if (!selectedClanId.value) return
  discordMessage.value = ''
  discordError.value = ''
  if (recreateMessages) {
    discordStatusRecreateBusy.value = true
  } else {
    discordStatusBusy.value = true
  }
  try {
    const response = await api.post<{ settings: ReturnType<typeof normalizeDiscordSettings> }>(
      `/clans/${selectedClanId.value}/discord-settings/status/publish`,
      { recreateMessages }
    )
    discordSettings.value = normalizeDiscordSettings(response.settings)
    discordMessage.value = recreateMessages ? t('admin.discordStatusRecreated') : t('admin.discordStatusPublished')
  } catch (err) {
    discordError.value = err instanceof Error ? err.message : t('admin.discordStatusFailed')
  } finally {
    discordStatusBusy.value = false
    discordStatusRecreateBusy.value = false
  }
}

const resetPassword = async (member: Member) => {
  passwordResetMessage.value = ''
  passwordResetError.value = ''
  const newPassword = passwordResets.value[member.userId]?.trim()
  if (!newPassword || newPassword.length < 8) {
    passwordResetError.value = t('admin.passwordTooShort')
    return
  }

  try {
    await api.patch(`/users/${member.userId}`, { newPassword })
    passwordResets.value = { ...passwordResets.value, [member.userId]: '' }
    passwordResetMessage.value = t('admin.passwordSet', { name: member.displayName })
  } catch (err) {
    passwordResetError.value = err instanceof Error ? err.message : t('admin.passwordFailed')
  }
}

const enumLabel = (scope: 'role' | 'status', value: string | null | undefined) => {
  if (!value) return '-'
  const key = `${scope}.${value}`
  return te(key) ? t(key) : value
}
const dateTime = (value: string | null | undefined) => formatDateTime(value, locale.value)
const auditActor = (log: AuditLog) => log.actor?.displayName ?? t('admin.systemActor')
const auditDetails = (log: AuditLog) => JSON.stringify({ before: log.beforeJson ?? null, after: log.afterJson ?? null }, null, 2)
const auditPageCount = computed(() => Math.max(1, Math.ceil(auditTotal.value / auditLimit)))

onMounted(async () => {
  await loadClans()
  await Promise.all([loadMembers(), loadRegistrations(), loadDiscordSettings(), loadAudit()])
})

watch(selectedClanId, async () => {
  resetDiscordChannels()
  await Promise.all([loadMembers(), loadRegistrations(), loadDiscordSettings(), loadAudit()])
})

watch(
  () => discordSettings.value.notificationChannelId,
  () => syncDiscordChannelNames()
)

watch(
  () => discordSettings.value.statusChannelId,
  () => syncDiscordChannelNames()
)
</script>

<template>
  <section class="page">
    <div class="page-header">
      <div>
        <h1 class="page-title">{{ t('admin.title') }}</h1>
        <p class="page-subtitle">{{ t('admin.subtitle') }}</p>
      </div>
      <AppTooltip :text="t('tooltips.admin')" />
    </div>

    <AuthPanel />

    <section v-if="user && isAdmin" class="panel">
      <h2 class="panel-title">{{ t('admin.createClan') }}</h2>
      <form class="filters" @submit.prevent="createClan">
        <label>
          {{ t('admin.name') }}
          <input id="admin-clan-name" v-model="clanForm.name" name="clanName" />
        </label>
        <label>
          {{ t('admin.slug') }}
          <input id="admin-clan-slug" v-model="clanForm.slug" name="clanSlug" :placeholder="t('admin.slugPlaceholder')" />
        </label>
        <button class="primary-button" :disabled="!clanForm.name || !clanForm.slug"><Plus :size="16" /> {{ t('app.actions.create') }}</button>
      </form>
    </section>

    <section v-if="canManageDiscordSettings" class="panel">
      <div class="panel-header">
        <div>
          <h2 class="panel-title">{{ t('admin.discordSettings') }}</h2>
          <p class="panel-subtitle">{{ t('admin.discordSettingsSubtitle') }}</p>
        </div>
        <BrandDiscordIcon :size="20" />
      </div>
      <form class="discord-settings-form" @submit.prevent="saveDiscordSettings">
        <div class="discord-settings-grid">
          <label>
            {{ t('admin.discordGuildId') }}
            <input id="discord-guild-id" v-model="discordSettings.guildId" name="discordGuildId" inputmode="numeric" placeholder="123456789012345678" />
          </label>
          <div class="field-action">
            <span>{{ t('admin.discordChannels') }}</span>
            <button type="button" class="secondary-button" :disabled="discordChannelsBusy || !canLoadDiscordChannels" @click="loadDiscordChannels">
              <RefreshCw :size="16" /> {{ t('admin.discordLoadChannels') }}
            </button>
          </div>
        </div>
        <p v-if="discordChannelsError" class="muted">{{ discordChannelsError }}</p>
        <p v-else-if="discordChannelsAvailable" class="muted">
          {{ t('admin.discordChannelsLoaded', { count: discordChannels.length }) }}
        </p>

        <section class="discord-settings-section">
          <div class="discord-section-header">
            <div>
              <h3>{{ t('admin.discordNotificationsTitle') }}</h3>
              <p>{{ t('admin.discordNotificationsSubtitle') }}</p>
            </div>
            <label class="toggle-row">
              <input id="discord-settings-enabled" v-model="discordSettings.enabled" name="discordEnabled" type="checkbox" />
              <span>{{ t('admin.discordEnabled') }}</span>
            </label>
          </div>
          <div class="discord-settings-grid">
            <label v-if="discordChannels.length > 0" class="discord-wide-field">
              {{ t('admin.discordNotificationChannel') }}
              <select
                id="discord-notification-channel-select"
                v-model="discordSettings.notificationChannelId"
                name="discordNotificationChannelSelect"
                @change="onDiscordChannelSelect"
              >
                <option value="">{{ t('admin.discordSelectChannel') }}</option>
                <option v-for="channel in discordChannels" :key="channel.id" :value="channel.id">
                  {{ channel.displayName }}
                </option>
              </select>
            </label>
            <label>
              {{ t('admin.discordChannelId') }}
              <input
                id="discord-notification-channel-id"
                v-model="discordSettings.notificationChannelId"
                name="discordNotificationChannelId"
                inputmode="numeric"
                placeholder="123456789012345678"
              />
            </label>
            <label>
              {{ t('admin.discordChannelName') }}
              <input
                id="discord-notification-channel-name"
                v-model="discordSettings.notificationChannelName"
                name="discordNotificationChannelName"
                :placeholder="t('admin.discordChannelPlaceholder')"
              />
            </label>
          </div>
          <p class="form-hint">{{ t('admin.discordChannelHelp') }}</p>
          <div class="form-actions-row">
            <button
              type="button"
              class="secondary-button"
              :disabled="discordTestBusy || !discordSettings.enabled || !discordSettings.notificationChannelId"
              @click="testDiscordSettings"
            >
              <Send :size="16" /> {{ t('admin.discordTest') }}
            </button>
          </div>
        </section>

        <section class="discord-settings-section">
          <div class="discord-section-header">
            <div>
              <h3>{{ t('admin.discordStatusTitle') }}</h3>
              <p>{{ t('admin.discordStatusSubtitle') }}</p>
            </div>
            <label class="toggle-row">
              <input id="discord-status-enabled" v-model="discordSettings.statusEnabled" name="discordStatusEnabled" type="checkbox" />
              <span>{{ t('admin.discordStatusEnabled') }}</span>
            </label>
          </div>
          <div class="discord-settings-grid">
            <label v-if="discordChannels.length > 0" class="discord-wide-field">
              {{ t('admin.discordStatusChannel') }}
              <select
                id="discord-status-channel-select"
                v-model="discordSettings.statusChannelId"
                name="discordStatusChannelSelect"
                @change="onDiscordChannelSelect"
              >
                <option value="">{{ t('admin.discordSelectChannel') }}</option>
                <option v-for="channel in discordChannels" :key="`status-${channel.id}`" :value="channel.id">
                  {{ channel.displayName }}
                </option>
              </select>
            </label>
            <label>
              {{ t('admin.discordStatusChannelId') }}
              <input id="discord-status-channel-id" v-model="discordSettings.statusChannelId" name="discordStatusChannelId" inputmode="numeric" placeholder="123456789012345678" />
            </label>
            <label>
              {{ t('admin.discordStatusChannelName') }}
              <input id="discord-status-channel-name" v-model="discordSettings.statusChannelName" name="discordStatusChannelName" :placeholder="t('admin.discordStatusChannelPlaceholder')" />
            </label>
          </div>
          <label class="toggle-row discord-pin-toggle">
            <input id="discord-status-pin" v-model="discordSettings.statusPinMessages" name="discordStatusPinMessages" type="checkbox" />
            <span><Pin :size="16" /> {{ t('admin.discordStatusPinMessages') }}</span>
          </label>
          <div class="discord-status-meta">
            <span>{{ t('admin.discordStatusRoadmapMessage') }}: {{ discordSettings.statusRoadmapMessageId || '-' }}</span>
            <span>{{ t('admin.discordStatusPlanetsMessage') }}: {{ discordSettings.statusPlanetsMessageId || '-' }}</span>
            <span>{{ t('admin.discordStatusLastPublished') }}: {{ dateTime(discordSettings.statusLastPublishedAt) }}</span>
          </div>
          <p class="form-hint">{{ t('admin.discordStatusHelp') }}</p>
          <p v-if="discordSettings.statusLastError" class="error-text">{{ discordSettings.statusLastError }}</p>
          <div class="form-actions-row">
            <button
              type="button"
              class="secondary-button"
              :disabled="discordStatusBusy || !discordSettings.statusEnabled || !discordSettings.statusChannelId"
              @click="publishDiscordStatus(false)"
            >
              <Send :size="16" /> {{ t('admin.discordStatusPublish') }}
            </button>
            <button
              type="button"
              class="secondary-button"
              :disabled="discordStatusRecreateBusy || !discordSettings.statusEnabled || !discordSettings.statusChannelId"
              @click="publishDiscordStatus(true)"
            >
              <RefreshCw :size="16" /> {{ t('admin.discordStatusRecreate') }}
            </button>
          </div>
        </section>

        <div class="form-actions-row">
          <button
            class="primary-button"
            :disabled="
              discordBusy ||
              (discordSettings.enabled && !discordSettings.notificationChannelId) ||
              (discordSettings.statusEnabled && !discordSettings.statusChannelId)
            "
          >
            <Save :size="16" /> {{ t('app.actions.save') }}
          </button>
        </div>
      </form>
      <p v-if="discordMessage" class="success-text">{{ discordMessage }}</p>
      <p v-if="discordError" class="error-text">{{ discordError }}</p>
    </section>

    <section v-if="canManageSelectedClan" class="panel">
      <h2 class="panel-title">{{ t('admin.pendingRegistrations') }}</h2>
      <div class="table-wrap" tabindex="0">
        <table>
          <thead>
            <tr>
              <th>{{ t('admin.name') }}</th>
              <th>{{ t('admin.username') }}</th>
              <th>{{ t('auth.email') }}</th>
              <th>{{ t('admin.action') }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="registration in registrations" :key="registration.userId">
              <td>{{ registration.displayName }}</td>
              <td>{{ registration.username }}</td>
              <td>{{ registration.email ?? '-' }}</td>
              <td class="filters">
                <button class="secondary-button" @click="approve(registration.userId, 'MEMBER')"><Check :size="16" /> {{ enumLabel('role', 'MEMBER') }}</button>
                <button class="secondary-button" @click="reject(registration.userId)"><X :size="16" /> {{ t('app.actions.reject') }}</button>
              </td>
            </tr>
            <tr v-if="registrations.length === 0">
              <td colspan="4" class="muted">{{ t('admin.noRegistrations') }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>

    <section v-if="user" class="panel">
      <h2 class="panel-title">{{ t('admin.members') }}</h2>
      <p v-if="passwordResetMessage" class="success-text">{{ passwordResetMessage }}</p>
      <p v-if="passwordResetError" class="error-text">{{ passwordResetError }}</p>
      <div class="table-wrap" tabindex="0">
        <table>
          <thead>
            <tr>
              <th>{{ t('admin.name') }}</th>
              <th>{{ t('admin.username') }}</th>
              <th>{{ t('admin.status') }}</th>
              <th>{{ t('admin.role') }}</th>
              <th>{{ t('admin.tracking') }}</th>
              <th v-if="isAdmin">{{ t('admin.password') }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="member in members" :key="member.userId">
              <td>{{ member.displayName }}</td>
              <td>{{ member.username }}</td>
              <td>{{ enumLabel('status', member.status) }}</td>
              <td>
                <select
                  :id="`member-role-${member.userId}`"
                  :name="`memberRole-${member.userId}`"
                  :value="member.role"
                  :disabled="!canManageSelectedClan"
                  @change="setRole(member, ($event.target as HTMLSelectElement).value)"
                >
                  <option value="MEMBER">{{ enumLabel('role', 'MEMBER') }}</option>
                  <option value="COMMANDER">{{ enumLabel('role', 'COMMANDER') }}</option>
                  <option value="ADMIRAL" :disabled="!isAdmin">{{ enumLabel('role', 'ADMIRAL') }}</option>
                </select>
              </td>
              <td>
                <div class="tracking-cell">
                  <span class="status-chip" :class="member.trackingExcluded ? 'status-chip-muted' : 'status-chip-active'">
                    {{ member.trackingExcluded ? t('admin.trackingExcluded') : t('admin.trackingIncluded') }}
                  </span>
                  <span v-if="member.trackingExcludedReason" class="muted">{{ member.trackingExcludedReason }}</span>
                  <div v-if="canManageSelectedClan" class="tracking-control">
                    <input
                      :id="`member-tracking-reason-${member.userId}`"
                      v-model="trackingReasons[member.userId]"
                      :name="`memberTrackingReason-${member.userId}`"
                      :placeholder="t('admin.trackingReason')"
                    />
                    <button
                      v-if="!member.trackingExcluded"
                      type="button"
                      class="secondary-button"
                      :disabled="trackingBusy[member.userId]"
                      @click="setTrackingExcluded(member, true)"
                    >
                      <Ban :size="16" /> {{ t('admin.excludeFromTracking') }}
                    </button>
                    <button
                      v-else
                      type="button"
                      class="secondary-button"
                      :disabled="trackingBusy[member.userId]"
                      @click="setTrackingExcluded(member, false)"
                    >
                      <Check :size="16" /> {{ t('admin.includeInTracking') }}
                    </button>
                  </div>
                </div>
              </td>
              <td v-if="isAdmin">
                <form class="inline-form" @submit.prevent="resetPassword(member)">
                  <input
                    :id="`member-password-username-${member.userId}`"
                    class="visually-hidden"
                    :name="`memberPasswordUsername-${member.userId}`"
                    type="text"
                    autocomplete="username"
                    :value="member.username"
                    readonly
                    tabindex="-1"
                    aria-hidden="true"
                  />
                  <input
                    :id="`member-password-${member.userId}`"
                    v-model="passwordResets[member.userId]"
                    :name="`memberPassword-${member.userId}`"
                    type="password"
                    autocomplete="new-password"
                    :placeholder="t('admin.newPassword')"
                  />
                  <button class="secondary-button" :disabled="(passwordResets[member.userId] ?? '').length < 8">{{ t('admin.set') }}</button>
                </form>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>

    <section v-if="isAdmin" class="panel">
      <div class="panel-header">
        <div>
          <h2 class="panel-title"><History :size="18" /> {{ t('admin.auditTitle') }}</h2>
          <p class="panel-subtitle">{{ t('admin.auditSubtitle') }}</p>
        </div>
      </div>
      <form class="filters audit-filters" @submit.prevent="applyAuditFilters">
        <label>
          {{ t('admin.search') }}
          <input id="audit-search" v-model="auditSearch" name="auditSearch" :placeholder="t('admin.auditSearchPlaceholder')" />
        </label>
        <label>
          {{ t('admin.auditAction') }}
          <input id="audit-action" v-model="auditAction" name="auditAction" placeholder="clan.membership" />
        </label>
        <label>
          {{ t('admin.auditEntity') }}
          <input id="audit-entity-type" v-model="auditEntityType" name="auditEntityType" placeholder="ClanMembership" />
        </label>
        <button class="primary-button" :disabled="auditBusy"><Search :size="16" /> {{ t('app.actions.search') }}</button>
        <button type="button" class="secondary-button" :disabled="auditBusy" @click="resetAuditFilters">
          <RotateCcw :size="16" /> {{ t('app.actions.reset') }}
        </button>
      </form>
      <div class="table-wrap" tabindex="0">
        <table>
          <thead>
            <tr>
              <th>{{ t('admin.auditTime') }}</th>
              <th>{{ t('admin.auditActor') }}</th>
              <th>{{ t('admin.auditAction') }}</th>
              <th>{{ t('admin.auditEntity') }}</th>
              <th>{{ t('admin.auditSummary') }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="log in auditLogs" :key="log.id">
              <td>{{ dateTime(log.createdAt) }}</td>
              <td>{{ auditActor(log) }}</td>
              <td><code>{{ log.action }}</code></td>
              <td>{{ log.entityType }}<span v-if="log.entityId" class="muted"> / {{ log.entityId }}</span></td>
              <td>
                <details class="audit-details">
                  <summary>{{ log.summary ?? '-' }}</summary>
                  <pre>{{ auditDetails(log) }}</pre>
                </details>
              </td>
            </tr>
            <tr v-if="auditLogs.length === 0">
              <td colspan="5" class="muted">{{ t('admin.auditEmpty') }}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <div class="pagination-row">
        <button class="secondary-button" :disabled="auditPage <= 1 || auditBusy" @click="previousAuditPage">
          {{ t('app.actions.previous') }}
        </button>
        <span class="muted">{{ t('admin.auditPage', { page: auditPage, pages: auditPageCount, total: auditTotal }) }}</span>
        <button class="secondary-button" :disabled="auditPage >= auditPageCount || auditBusy" @click="nextAuditPage">
          {{ t('app.actions.next') }}
        </button>
      </div>
    </section>
  </section>
</template>
