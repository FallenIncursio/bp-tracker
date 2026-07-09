<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { RouterLink } from 'vue-router'
import { CalendarClock, LogIn, RefreshCw, Route, UserPlus } from '@lucide/vue'
import AppTooltip from '../components/AppTooltip.vue'
import CountdownTimer from '../components/CountdownTimer.vue'
import { useClans } from '../composables/useClans'
import { useAuth } from '../composables/useAuth'
import { api } from '../services/api'
import { formatDateTime, localizedName } from '../utils/labels'

type StatusUser = {
  userId: string
  displayName: string
}

type CountKind = 'missing' | 'wanted'

type SiriusAppearance = {
  id: string
  planet: { name: string }
  ring: number
  techTier: string | null
  observedAt: string
  expiresAt: string
  nextSpawnAt: string | null
  status: string
  slots: Array<{
    id: string
    slotGroup: string
    enemyType: string | null
    locationName: string | null
    rawBlueprintName: string | null
    blueprint: {
      canonicalName: string
      nameDe: string
      nameEn: string | null
      partsRequired?: number | null
      rarity?: string | null
      translations?: Array<{ locale: string; name: string }> | null
    } | null
    counts: {
      owned: number
      missing: number
      wanted: number
      unknown: number
      users?: {
        missing: StatusUser[]
        wanted: StatusUser[]
      }
    } | null
  }>
}

type MemberCounts = {
  active: number
  counted: number
  excluded: number
}

type SpawnWindow = {
  id: string
  expectedAt: string
  status: string
  derivedStatus: 'ACTIVE_SOURCE' | 'WAITING_FOR_SPAWN' | 'OVERDUE' | 'RESOLVED' | 'CANCELLED'
  sourceAppearance: {
    id: string
    ring: number
    expiresAt: string
    status: string
    planet: { name: string }
  }
  resolvedAppearance: {
    id: string
    ring: number
    planet: { name: string }
  } | null
}

type JourneyStop = {
  id: string
  planetName: string | null
  ring: number
  arriveAt: string | null
  departAt: string | null
  status: 'PLANNED' | 'CURRENT' | 'COMPLETED' | 'SKIPPED' | 'CANCELLED'
  certainty: 'CONFIRMED' | 'TENTATIVE'
  warnings: string[]
  metrics: {
    owned: number
    missing: number
    wanted: number
  }
  planet: { name: string; ring: number | null } | null
  appearance: {
    id: string
    expiresAt: string
    status: string
    planet: { name: string }
  } | null
}

const { user } = useAuth()
const { selectedClanId, selectedClan, canViewSelectedClanDetails, loadClans } = useClans()
const { t, te, locale } = useI18n()
const appearances = ref<SiriusAppearance[]>([])
const memberCounts = ref<MemberCounts>({ active: 0, counted: 0, excluded: 0 })
const spawnWindows = ref<SpawnWindow[]>([])
const journeyStops = ref<JourneyStop[]>([])
const loading = ref(false)
const timerRefreshQueued = ref(false)
const activeRotationMetricKey = ref('')

const activeSlots = computed(() => appearances.value.flatMap(appearance => appearance.slots))
const wantedCount = computed(() => activeSlots.value.reduce((sum, slot) => sum + (slot.counts?.wanted ?? 0), 0))
const missingCount = computed(() => activeSlots.value.reduce((sum, slot) => sum + (slot.counts?.missing ?? 0), 0))
const trackingScopeLabel = computed(() =>
  t('dashboard.trackingScope', { counted: memberCounts.value.counted, excluded: memberCounts.value.excluded })
)
const openSpawnWindows = computed(() => spawnWindows.value.filter(row => row.derivedStatus !== 'RESOLVED' && row.derivedStatus !== 'CANCELLED'))
const nextSpawnWindow = computed(() => openSpawnWindows.value[0] ?? null)
const journeyPreviewStops = computed(() => {
  const visibleStops = journeyStops.value.filter(stop => stop.status !== 'CANCELLED')
  const currentIndex = visibleStops.findIndex(stop => stop.status === 'CURRENT')
  if (currentIndex === -1) return visibleStops.slice(0, 6)
  return visibleStops.slice(Math.max(0, currentIndex - 2), currentIndex + 4)
})
const label = (scope: 'slot' | 'enemy' | 'techTier', value: string | null | undefined) => {
  if (!value) return '-'
  const key = `${scope}.${value}`
  return te(key) ? t(key) : value
}
const rarityLabel = (value: string | null | undefined) => {
  if (!value) return '-'
  const key = `rarity.${value}`
  return te(key) ? t(key) : value
}
const enemyClass = (value: string | null | undefined) => ({
  'enemy-chip': Boolean(value),
  'enemy-giza': value === 'GIZA',
  'enemy-amarna': value === 'AMARNA',
  'enemy-soris': value === 'SORIS',
})
const slotLabel = (slot: SiriusAppearance['slots'][number]) =>
  slot.blueprint?.rarity === 'COSMETIC'
    ? rarityLabel(slot.blueprint.rarity)
    : slot.slotGroup === 'RESOURCE' && slot.blueprint?.partsRequired
      ? `${slot.blueprint.partsRequired}er`
      : label('slot', slot.slotGroup)
const enemyLabel = (slot: SiriusAppearance['slots'][number]) => slot.locationName ?? label('enemy', slot.enemyType)

const isSiriusBlueprint = (name: string | null | undefined) => Boolean(name?.toLowerCase().startsWith('sirius '))
const blueprintName = (slot: SiriusAppearance['slots'][number]) =>
  slot.blueprint ? localizedName(slot.blueprint, locale.value) : slot.rawBlueprintName ?? '-'
const dateTime = (value: string | null | undefined) => formatDateTime(value, locale.value)
const journeyStopName = (stop: JourneyStop) => stop.planetName ?? stop.planet?.name ?? stop.appearance?.planet.name ?? t('sirius.unknownPlanet')
const journeyStatusLabel = (value: JourneyStop['status']) => t(`sirius.journeyStatuses.${value}`)
const journeyCertaintyLabel = (value: JourneyStop['certainty']) => t(`sirius.journeyCertainties.${value}`)
const journeyStopClass = (stop: JourneyStop) => ({
  'journey-stop-completed': stop.status === 'COMPLETED',
  'journey-stop-current': stop.status === 'CURRENT',
  'journey-stop-planned': stop.status === 'PLANNED',
  'journey-stop-muted': stop.status === 'SKIPPED' || stop.status === 'CANCELLED',
  'journey-stop-warning': stop.warnings.length > 0,
  'journey-stop-tentative': stop.certainty === 'TENTATIVE',
})
const journeyTimeLabel = (stop: JourneyStop) => {
  if (stop.arriveAt && stop.departAt) return `${dateTime(stop.arriveAt)} - ${dateTime(stop.departAt)}`
  if (stop.arriveAt) return t('sirius.arrivesAt', { date: dateTime(stop.arriveAt) })
  if (stop.departAt) return t('sirius.departsAt', { date: dateTime(stop.departAt) })
  return t('sirius.noJourneyTime')
}
const spawnStatusLabel = (value: SpawnWindow['derivedStatus']) => t(`sirius.spawnStatuses.${value}`)
const spawnStatusClass = (value: SpawnWindow['derivedStatus']) => ({
  'status-chip-active': value === 'RESOLVED',
  'status-chip-warning': value === 'WAITING_FOR_SPAWN' || value === 'ACTIVE_SOURCE',
  'status-chip-danger': value === 'OVERDUE',
})

const appearanceMissing = (appearance: SiriusAppearance) =>
  appearance.slots.reduce((sum, slot) => sum + (slot.counts?.missing ?? 0), 0)

const appearanceWanted = (appearance: SiriusAppearance) =>
  appearance.slots.reduce((sum, slot) => sum + (slot.counts?.wanted ?? 0), 0)

const countForSlot = (slot: SiriusAppearance['slots'][number], kind: CountKind) => slot.counts?.[kind] ?? 0
const usersForSlot = (slot: SiriusAppearance['slots'][number], kind: CountKind) => slot.counts?.users?.[kind] ?? []
const canSeeAffectedUsers = computed(() => canViewSelectedClanDetails.value)

const formatUserList = (users: StatusUser[], max = 18) => {
  if (users.length === 0) return t('dashboard.noAffectedUsers')
  const visible = users.slice(0, max).map(user => user.displayName).join(', ')
  const remaining = users.length - max
  return remaining > 0 ? `${visible}, ${t('dashboard.moreUsers', { count: remaining })}` : visible
}

const formatUserHits = (users: Array<StatusUser & { count: number }>, max = 12) => {
  if (users.length === 0) return t('dashboard.noAffectedUsers')
  const visible = users
    .slice(0, max)
    .map(user => (user.count > 1 ? `${user.displayName} (${user.count})` : user.displayName))
    .join(', ')
  const remaining = users.length - max
  return remaining > 0 ? `${visible}, ${t('dashboard.moreUsers', { count: remaining })}` : visible
}

const appearanceUserHits = (appearance: SiriusAppearance, kind: CountKind) => {
  const hits = new Map<string, StatusUser & { count: number }>()
  for (const slot of appearance.slots) {
    for (const user of usersForSlot(slot, kind)) {
      const existing = hits.get(user.userId)
      if (existing) {
        existing.count += 1
      } else {
        hits.set(user.userId, { ...user, count: 1 })
      }
    }
  }

  return Array.from(hits.values()).sort((left, right) => left.displayName.localeCompare(right.displayName, locale.value))
}

const appearanceTooltip = (appearance: SiriusAppearance, kind: CountKind) => {
  const count = kind === 'missing' ? appearanceMissing(appearance) : appearanceWanted(appearance)
  const key = kind === 'missing' ? 'dashboard.missingTooltip' : 'dashboard.wantedTooltip'
  const lines = [t(key, { count, planet: appearance.planet.name })]
  if (canSeeAffectedUsers.value) {
    lines.push(`${t('dashboard.affectedUsers')}: ${formatUserHits(appearanceUserHits(appearance, kind))}`)
  }
  lines.push(trackingScopeLabel.value)
  return lines.join('\n')
}

const slotTooltip = (slot: SiriusAppearance['slots'][number], kind: CountKind) => {
  if (!canSeeAffectedUsers.value) {
    const key = kind === 'missing' ? 'dashboard.missingSlotTooltipPrivate' : 'dashboard.wantedSlotTooltipPrivate'
    return t(key, {
      count: countForSlot(slot, kind),
      blueprint: blueprintName(slot),
    })
  }
  const key = kind === 'missing' ? 'dashboard.missingSlotTooltip' : 'dashboard.wantedSlotTooltip'
  return t(key, {
    count: countForSlot(slot, kind),
    blueprint: blueprintName(slot),
    users: formatUserList(usersForSlot(slot, kind)),
  })
}

const rotationMetricKey = (scope: 'appearance' | 'slot', id: string, kind: CountKind) => `${scope}-${id}-${kind}`
const rotationMetricPopoverId = (key: string) => `rotation-metric-${key}`
const isRotationMetricOpen = (key: string) => activeRotationMetricKey.value === key
const toggleRotationMetric = (key: string) => {
  activeRotationMetricKey.value = isRotationMetricOpen(key) ? '' : key
}
const closeRotationMetric = () => {
  activeRotationMetricKey.value = ''
}
const handleRotationMetricPointerDown = (event: PointerEvent) => {
  if (event.target instanceof Element && event.target.closest('.rotation-metric-popover-wrap')) return
  closeRotationMetric()
}
const handleRotationMetricKeydown = (event: KeyboardEvent) => {
  if (event.key === 'Escape') closeRotationMetric()
}

const loadActive = async () => {
  if (!selectedClanId.value) return
  loading.value = true
  try {
    const response = await api.get<{ appearances: SiriusAppearance[]; memberCounts: MemberCounts }>(`/sirius/clans/${selectedClanId.value}/active`)
    appearances.value = response.appearances
    memberCounts.value = response.memberCounts
  } finally {
    loading.value = false
  }
}

const loadSpawnPlan = async () => {
  if (!selectedClanId.value) return
  const response = await api.get<{ spawnWindows: SpawnWindow[] }>(`/sirius/clans/${selectedClanId.value}/spawn-plan`)
  spawnWindows.value = response.spawnWindows
}

const loadJourney = async () => {
  if (!selectedClanId.value || !canViewSelectedClanDetails.value) {
    journeyStops.value = []
    return
  }
  const response = await api.get<{ stops: JourneyStop[] }>(`/sirius/clans/${selectedClanId.value}/journey`)
  journeyStops.value = response.stops
}

const refreshDashboard = async () => {
  await Promise.all([loadActive(), loadSpawnPlan(), loadJourney()])
}

const scheduleTimerRefresh = () => {
  if (timerRefreshQueued.value) return
  timerRefreshQueued.value = true
  window.setTimeout(() => {
    void refreshDashboard().finally(() => {
      timerRefreshQueued.value = false
    })
  }, 1000)
}

onMounted(async () => {
  document.addEventListener('pointerdown', handleRotationMetricPointerDown)
  document.addEventListener('keydown', handleRotationMetricKeydown)
  await loadClans()
  await refreshDashboard()
})

onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', handleRotationMetricPointerDown)
  document.removeEventListener('keydown', handleRotationMetricKeydown)
})

watch([selectedClanId, canViewSelectedClanDetails], () => {
  closeRotationMetric()
  void refreshDashboard()
})
</script>

<template>
  <section class="page">
    <div class="page-header">
      <div>
        <h1 class="page-title">{{ t('dashboard.title') }}</h1>
        <p class="page-subtitle">{{ selectedClan?.name ?? t('app.noClan') }}</p>
      </div>
        <div class="page-actions">
        <AppTooltip :text="t('tooltips.dashboard')" />
        <button class="secondary-button" :disabled="loading" @click="refreshDashboard">
          <RefreshCw :size="16" /> {{ t('app.actions.refresh') }}
        </button>
      </div>
    </div>

    <section v-if="!user" class="panel guest-callout">
      <div>
        <p class="account-kicker">{{ t('auth.guestMode') }}</p>
        <h2>{{ t('dashboard.guestTitle') }}</h2>
        <p>{{ t('dashboard.guestSubtitle') }}</p>
      </div>
      <div class="guest-callout-actions">
        <RouterLink class="secondary-button" :to="{ path: '/login', query: { redirect: '/' } }">
          <LogIn :size="16" /> {{ t('auth.login') }}
        </RouterLink>
        <RouterLink class="primary-button" :to="{ path: '/register', query: { redirect: '/' } }">
          <UserPlus :size="16" /> {{ t('auth.register') }}
        </RouterLink>
      </div>
    </section>

    <div class="grid-3">
      <article class="panel stat-card">
        <h2 class="panel-title">{{ t('dashboard.activePlanets') }}</h2>
        <strong class="stat-value">{{ appearances.length }}</strong>
        <span class="stat-caption">{{ t('dashboard.activePlanetsCaption') }}</span>
      </article>
      <article class="panel stat-card">
        <h2 class="panel-title">{{ t('dashboard.missingHits') }}</h2>
        <strong class="stat-value">{{ missingCount }}</strong>
        <span class="stat-caption">{{ t('dashboard.missingHitsCaption') }}</span>
        <span class="stat-caption muted">{{ trackingScopeLabel }}</span>
      </article>
      <article class="panel stat-card">
        <h2 class="panel-title">{{ t('dashboard.wantedHits') }}</h2>
        <strong class="stat-value">{{ wantedCount }}</strong>
        <span class="stat-caption">{{ t('dashboard.wantedHitsCaption') }}</span>
        <span class="stat-caption muted">{{ trackingScopeLabel }}</span>
      </article>
    </div>

    <section v-if="canViewSelectedClanDetails" class="panel journey-summary-panel">
      <div class="panel-header">
        <div>
          <h2 class="panel-title"><Route :size="18" /> {{ t('dashboard.journeyTitle') }}</h2>
          <p class="panel-subtitle">{{ t('dashboard.journeySubtitle') }}</p>
        </div>
        <RouterLink class="secondary-button" to="/sirius">{{ t('dashboard.openJourneyPlanner') }}</RouterLink>
      </div>
      <div v-if="journeyPreviewStops.length" class="journey-strip" :aria-label="t('dashboard.journeyTitle')">
        <article
          v-for="(stop, index) in journeyPreviewStops"
          :key="stop.id"
          class="journey-stop"
          :class="journeyStopClass(stop)"
          :style="{ '--journey-index': index }"
        >
          <span class="journey-stop-kicker">{{ journeyStatusLabel(stop.status) }}</span>
          <strong>{{ journeyStopName(stop) }} - {{ t('dashboard.ringLabel', { ring: stop.ring }) }}</strong>
          <span class="journey-stop-time">{{ journeyTimeLabel(stop) }}</span>
          <div class="journey-stop-chips">
            <span v-if="stop.certainty === 'TENTATIVE'" class="status-chip status-chip-warning">
              {{ journeyCertaintyLabel(stop.certainty) }}
            </span>
            <span v-if="stop.metrics.missing" class="metric metric-missing">{{ stop.metrics.missing }}</span>
            <span v-if="stop.metrics.wanted" class="metric metric-wanted">{{ stop.metrics.wanted }}</span>
            <span v-if="stop.warnings.length" class="status-chip status-chip-danger">{{ t('sirius.warningCount', { count: stop.warnings.length }) }}</span>
          </div>
        </article>
      </div>
      <div v-else class="empty-state compact-empty">{{ t('dashboard.noJourney') }}</div>
    </section>

    <section class="panel spawn-summary-panel">
      <div class="panel-header">
        <div>
          <h2 class="panel-title"><CalendarClock :size="18" /> {{ t('dashboard.nextSpawnTitle') }}</h2>
          <p class="panel-subtitle">{{ t('dashboard.nextSpawnSubtitle') }}</p>
        </div>
        <RouterLink class="secondary-button" to="/sirius">{{ t('dashboard.openSpawnPlanner') }}</RouterLink>
      </div>
      <div v-if="nextSpawnWindow" class="spawn-summary-content">
        <CountdownTimer
          compact
          :show-next="false"
          :expired-text="t('sirius.spawnOverdue')"
          :observed-at="nextSpawnWindow.sourceAppearance.expiresAt"
          :expires-at="nextSpawnWindow.expectedAt"
          :status="nextSpawnWindow.derivedStatus === 'ACTIVE_SOURCE' ? 'UPCOMING' : 'ACTIVE'"
          @expired="scheduleTimerRefresh"
        />
        <div>
          <strong>
            {{ nextSpawnWindow.sourceAppearance.planet.name }} -
            {{ t('dashboard.ringLabel', { ring: nextSpawnWindow.sourceAppearance.ring }) }}
          </strong>
          <p class="muted">
            {{ t('dashboard.spawnExpectedAt', { date: dateTime(nextSpawnWindow.expectedAt) }) }}
          </p>
        </div>
        <span class="status-chip" :class="spawnStatusClass(nextSpawnWindow.derivedStatus)">
          {{ spawnStatusLabel(nextSpawnWindow.derivedStatus) }}
        </span>
      </div>
      <div v-else class="empty-state compact-empty">{{ t('dashboard.noSpawnPlan') }}</div>
    </section>

    <section class="section-block">
      <div class="panel-header">
        <div>
          <h2 class="panel-title">{{ t('dashboard.rotation') }}</h2>
          <p class="panel-subtitle">{{ t('dashboard.compactHint') }}</p>
          <p class="panel-subtitle">{{ trackingScopeLabel }}</p>
        </div>
        <span class="muted">{{ t('dashboard.slots', { count: activeSlots.length }) }}</span>
      </div>
      <div v-if="appearances.length" class="rotation-grid">
        <article v-for="appearance in appearances" :key="appearance.id" class="rotation-card">
          <header class="rotation-card-header">
            <div class="rotation-card-main">
              <h3>{{ appearance.planet.name }} - {{ t('dashboard.ringLabel', { ring: appearance.ring }) }}</h3>
              <CountdownTimer
                :observed-at="appearance.observedAt"
                :expires-at="appearance.expiresAt"
                :next-spawn-at="appearance.nextSpawnAt"
                :status="appearance.status"
                @expired="scheduleTimerRefresh"
              />
            </div>
            <div class="rotation-counts">
              <span class="rotation-metric-popover-wrap">
                <button
                  class="metric metric-missing rotation-metric-trigger"
                  type="button"
                  :aria-label="appearanceTooltip(appearance, 'missing')"
                  :aria-expanded="isRotationMetricOpen(rotationMetricKey('appearance', appearance.id, 'missing'))"
                  :aria-controls="rotationMetricPopoverId(rotationMetricKey('appearance', appearance.id, 'missing'))"
                  @click.stop="toggleRotationMetric(rotationMetricKey('appearance', appearance.id, 'missing'))"
                >
                  {{ appearanceMissing(appearance) }}
                </button>
                <span
                  v-if="isRotationMetricOpen(rotationMetricKey('appearance', appearance.id, 'missing'))"
                  :id="rotationMetricPopoverId(rotationMetricKey('appearance', appearance.id, 'missing'))"
                  class="rotation-metric-popover"
                  role="tooltip"
                >
                  {{ appearanceTooltip(appearance, 'missing') }}
                </span>
              </span>
              <span class="rotation-metric-popover-wrap">
                <button
                  class="metric metric-wanted rotation-metric-trigger"
                  type="button"
                  :aria-label="appearanceTooltip(appearance, 'wanted')"
                  :aria-expanded="isRotationMetricOpen(rotationMetricKey('appearance', appearance.id, 'wanted'))"
                  :aria-controls="rotationMetricPopoverId(rotationMetricKey('appearance', appearance.id, 'wanted'))"
                  @click.stop="toggleRotationMetric(rotationMetricKey('appearance', appearance.id, 'wanted'))"
                >
                  {{ appearanceWanted(appearance) }}
                </button>
                <span
                  v-if="isRotationMetricOpen(rotationMetricKey('appearance', appearance.id, 'wanted'))"
                  :id="rotationMetricPopoverId(rotationMetricKey('appearance', appearance.id, 'wanted'))"
                  class="rotation-metric-popover"
                  role="tooltip"
                >
                  {{ appearanceTooltip(appearance, 'wanted') }}
                </span>
              </span>
            </div>
          </header>
          <div class="mini-table-wrap">
            <table class="mini-table">
              <thead>
                <tr>
                  <th>{{ t('dashboard.slot') }}</th>
                  <th>{{ t('dashboard.enemy') }}</th>
                  <th>{{ t('dashboard.blueprint') }}</th>
                  <th>{{ t('dashboard.missing') }}</th>
                  <th>{{ t('dashboard.wanted') }}</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="slot in appearance.slots" :key="slot.id">
                  <td :data-label="t('dashboard.slot')">{{ slotLabel(slot) }}</td>
                  <td :data-label="t('dashboard.enemy')">
                    <span :class="enemyClass(slot.enemyType ?? slot.locationName)">{{ enemyLabel(slot) }}</span>
                  </td>
                  <td :data-label="t('dashboard.blueprint')" class="bp-cell">
                    <span :class="{ 'sirius-bp-name': isSiriusBlueprint(slot.blueprint?.canonicalName ?? slot.rawBlueprintName) }">
                      {{ blueprintName(slot) }}
                    </span>
                  </td>
                  <td class="metric-cell" :data-label="t('dashboard.missing')">
                    <span v-if="slot.counts" class="rotation-metric-popover-wrap rotation-metric-popover-wrap-inline">
                      <button
                        class="count-tooltip rotation-metric-trigger"
                        type="button"
                        :aria-label="slotTooltip(slot, 'missing')"
                        :aria-expanded="isRotationMetricOpen(rotationMetricKey('slot', slot.id, 'missing'))"
                        :aria-controls="rotationMetricPopoverId(rotationMetricKey('slot', slot.id, 'missing'))"
                        @click.stop="toggleRotationMetric(rotationMetricKey('slot', slot.id, 'missing'))"
                      >
                        {{ slot.counts.missing }}
                      </button>
                      <span
                        v-if="isRotationMetricOpen(rotationMetricKey('slot', slot.id, 'missing'))"
                        :id="rotationMetricPopoverId(rotationMetricKey('slot', slot.id, 'missing'))"
                        class="rotation-metric-popover"
                        role="tooltip"
                      >
                        {{ slotTooltip(slot, 'missing') }}
                      </span>
                    </span>
                    <span v-else>-</span>
                  </td>
                  <td class="metric-cell" :data-label="t('dashboard.wanted')">
                    <span v-if="slot.counts" class="rotation-metric-popover-wrap rotation-metric-popover-wrap-inline">
                      <button
                        class="count-tooltip rotation-metric-trigger"
                        type="button"
                        :aria-label="slotTooltip(slot, 'wanted')"
                        :aria-expanded="isRotationMetricOpen(rotationMetricKey('slot', slot.id, 'wanted'))"
                        :aria-controls="rotationMetricPopoverId(rotationMetricKey('slot', slot.id, 'wanted'))"
                        @click.stop="toggleRotationMetric(rotationMetricKey('slot', slot.id, 'wanted'))"
                      >
                        {{ slot.counts.wanted }}
                      </button>
                      <span
                        v-if="isRotationMetricOpen(rotationMetricKey('slot', slot.id, 'wanted'))"
                        :id="rotationMetricPopoverId(rotationMetricKey('slot', slot.id, 'wanted'))"
                        class="rotation-metric-popover"
                        role="tooltip"
                      >
                        {{ slotTooltip(slot, 'wanted') }}
                      </span>
                    </span>
                    <span v-else>-</span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </article>
      </div>
      <div v-else class="empty-state">
        {{ t('dashboard.noActive') }}
      </div>
    </section>
  </section>
</template>
