<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { Layers, Play, Rocket, ShieldCheck } from '@lucide/vue'
import { api } from '../services/api'
import { useClans } from '../composables/useClans'
import StatusPill from '../components/StatusPill.vue'
import AppTooltip from '../components/AppTooltip.vue'
import { localizedName, localizedText } from '../utils/labels'

type Ship = { id: string; name: string; className: string | null; systemName: string | null; requirementCount: number }
type SiriusCheckerCounts = {
  ownRingFive: number
  ownWithResources: number
  allRingFive: number
  allRingFiveWithResources: number
  resources: number
}
type CheckerSystem = { id: string; name: string; blueprintCount: number; siriusCounts?: SiriusCheckerCounts }
type CheckerGroup = { id: string; nameDe: string; nameEn: string; blueprintCount: number }
type CheckerBlueprint = { id: string; canonicalName: string; nameDe: string; nameEn: string | null; translations?: Array<{ locale: string; name: string }> | null }
type CheckRow = {
  userId: string
  displayName: string
  role: string
  trackingExcluded: boolean
  trackingExcludedReason: string | null
  owned: number
  missing: number
  wanted: number
  blueprints: Array<CheckerBlueprint & { blueprintId: string; status: string }>
}
type CheckerMode = 'ship' | 'system' | 'special'
type SiriusCheckerScope = 'own' | 'all-ring5'

const { selectedClanId, loadClans } = useClans()
const { t, locale } = useI18n()
const ships = ref<Ship[]>([])
const systems = ref<CheckerSystem[]>([])
const groups = ref<CheckerGroup[]>([])
const mode = ref<CheckerMode>('ship')
const selectedShipId = ref('')
const selectedSystemId = ref('')
const selectedGroupId = ref('')
const siriusScope = ref<SiriusCheckerScope>('own')
const includeSiriusResources = ref(false)
const rows = ref<CheckRow[]>([])
const blueprints = ref<CheckerBlueprint[]>([])
const loading = ref(false)
const includeExcluded = ref(false)

const checkedCount = computed(() => blueprints.value.length)
const shipsBySystem = computed(() => {
  const groupedShips = new Map<string, Ship[]>()
  for (const ship of ships.value) {
    const systemName = ship.systemName ?? t('checker.unassignedSystem')
    groupedShips.set(systemName, [...(groupedShips.get(systemName) ?? []), ship])
  }
  return Array.from(groupedShips, ([systemName, items]) => ({ systemName, ships: items }))
})
const selectedSystem = computed(() => systems.value.find(system => system.id === selectedSystemId.value) ?? null)
const isSiriusSystemSelected = computed(() => mode.value === 'system' && selectedSystem.value?.name === 'Sirius')
const checkerCountForSystem = (system: CheckerSystem | null | undefined) => {
  const counts = system?.siriusCounts
  if (!counts) return system?.blueprintCount ?? 0
  if (siriusScope.value === 'all-ring5') {
    return includeSiriusResources.value ? counts.allRingFiveWithResources : counts.allRingFive
  }
  return includeSiriusResources.value ? counts.ownWithResources : counts.ownRingFive
}
const selectedSiriusCount = computed(() => checkerCountForSystem(selectedSystem.value))

const loadShips = async () => {
  const response = await api.get<{ ships: Ship[] }>('/checker/ships')
  ships.value = response.ships
  selectedShipId.value = selectedShipId.value || response.ships[0]?.id || ''
}

const loadSystems = async () => {
  const response = await api.get<{ systems: CheckerSystem[] }>('/checker/systems')
  systems.value = response.systems
  selectedSystemId.value = selectedSystemId.value || response.systems[0]?.id || ''
}

const loadGroups = async () => {
  const response = await api.get<{ groups: CheckerGroup[] }>('/checker/groups')
  groups.value = response.groups
  selectedGroupId.value = selectedGroupId.value || response.groups[0]?.id || ''
  if (mode.value === 'special' && response.groups.length === 0) {
    mode.value = 'ship'
  }
}

const run = async () => {
  if (!selectedClanId.value) return
  const clanId = selectedClanId.value
  const checkerParams = (extra?: Record<string, string | boolean | undefined>) => {
    const params = new URLSearchParams({ clanId })
    if (includeExcluded.value) params.set('includeExcluded', 'true')
    for (const [key, value] of Object.entries(extra ?? {})) {
      if (value === undefined || value === false) continue
      params.set(key, value === true ? 'true' : value)
    }
    return params.toString()
  }

  const endpoint =
    mode.value === 'ship' && selectedShipId.value
      ? `/checker/ships/${selectedShipId.value}/check?${checkerParams()}`
      : mode.value === 'system' && selectedSystemId.value
        ? `/checker/systems/${selectedSystemId.value}/check?${checkerParams(
            isSiriusSystemSelected.value
              ? {
                  siriusScope: siriusScope.value,
                  includeSiriusResources: includeSiriusResources.value,
                }
              : undefined
          )}`
        : mode.value === 'special' && selectedGroupId.value
          ? `/checker/groups/${selectedGroupId.value}/check?${checkerParams()}`
          : null

  if (!endpoint) return

  loading.value = true
  try {
    const response = await api.get<{ rows: CheckRow[]; blueprints: CheckerBlueprint[] }>(endpoint)
    rows.value = response.rows
    blueprints.value = response.blueprints
  } finally {
    loading.value = false
  }
}

const groupName = (group: CheckerGroup) => localizedText(group.nameDe, group.nameEn, locale.value)
const blueprintName = (blueprint: CheckerBlueprint | CheckRow['blueprints'][number]) => localizedName(blueprint, locale.value)
const blueprintsByStatus = (row: CheckRow, status: string) => row.blueprints.filter(blueprint => blueprint.status === status)

onMounted(async () => {
  await loadClans()
  await Promise.all([loadShips(), loadSystems(), loadGroups()])
  await run()
})

watch(selectedClanId, run)
watch(mode, run)
watch(includeExcluded, run)
watch([siriusScope, includeSiriusResources], run)
</script>

<template>
  <section class="page">
    <div class="page-header">
      <div>
        <h1 class="page-title">{{ t('checker.title') }}</h1>
        <p class="page-subtitle">{{ t('checker.subtitle') }}</p>
      </div>
      <AppTooltip :text="t('tooltips.checker')" />
    </div>

    <section class="panel">
      <div class="segmented checker-tabs">
        <button :class="{ active: mode === 'ship' }" @click="mode = 'ship'">
          <Rocket :size="16" /> {{ t('checker.modeShip') }}
        </button>
        <button :class="{ active: mode === 'system' }" @click="mode = 'system'">
          <Layers :size="16" /> {{ t('checker.modeSystem') }}
        </button>
        <button v-if="groups.length" :class="{ active: mode === 'special' }" @click="mode = 'special'">
          <ShieldCheck :size="16" /> {{ t('checker.modeSpecial') }}
        </button>
      </div>
      <div class="filters">
        <label v-if="mode === 'ship'">
          {{ t('checker.ship') }}
          <select id="checker-ship-id" v-model="selectedShipId" name="checkerShipId">
            <optgroup v-for="group in shipsBySystem" :key="group.systemName" :label="group.systemName">
              <option v-for="ship in group.ships" :key="ship.id" :value="ship.id">
                {{ ship.name }} ({{ ship.requirementCount }})
              </option>
            </optgroup>
          </select>
        </label>
        <label v-if="mode === 'system'">
          {{ t('checker.system') }}
          <select id="checker-system-id" v-model="selectedSystemId" name="checkerSystemId">
            <option v-for="system in systems" :key="system.id" :value="system.id">
              {{ system.name }} ({{ checkerCountForSystem(system) }})
            </option>
          </select>
        </label>
        <template v-if="isSiriusSystemSelected">
          <label>
            {{ t('checker.siriusScope') }}
            <select id="checker-sirius-scope" v-model="siriusScope" name="checkerSiriusScope">
              <option value="own">
                {{ t('checker.siriusScopeOwn') }} ({{ selectedSystem?.siriusCounts?.ownRingFive ?? selectedSiriusCount }})
              </option>
              <option value="all-ring5">
                {{ t('checker.siriusScopeAllRing5') }} ({{ selectedSystem?.siriusCounts?.allRingFive ?? selectedSiriusCount }})
              </option>
            </select>
          </label>
          <label class="toggle-row sirius-resource-toggle">
            <input
              id="checker-include-sirius-resources"
              v-model="includeSiriusResources"
              name="checkerIncludeSiriusResources"
              type="checkbox"
            />
            <span>{{ t('checker.includeSiriusResources') }}</span>
          </label>
          <p class="checker-sirius-hint">
            {{
              t('checker.siriusScopeHint', {
                own: selectedSystem?.siriusCounts?.ownRingFive ?? 0,
                all: selectedSystem?.siriusCounts?.allRingFive ?? 0,
                resources: selectedSystem?.siriusCounts?.resources ?? 0,
              })
            }}
          </p>
        </template>
        <label v-if="mode === 'special'">
          {{ t('checker.group') }}
          <select id="checker-group-id" v-model="selectedGroupId" name="checkerGroupId">
            <option v-for="group in groups" :key="group.id" :value="group.id">
              {{ groupName(group) }} ({{ group.blueprintCount }})
            </option>
          </select>
        </label>
        <button class="primary-button" :disabled="loading" @click="run"><Play :size="16" /> {{ t('app.actions.check') }}</button>
        <label class="toggle-row">
          <input id="checker-include-excluded" v-model="includeExcluded" name="checkerIncludeExcluded" type="checkbox" />
          <span>{{ t('checker.includeExcluded') }}</span>
        </label>
      </div>
    </section>

    <section class="section-block">
      <div class="panel-header">
        <div>
          <h2 class="panel-title">{{ t('checker.results') }}</h2>
          <p class="panel-subtitle">{{ t('checker.blueprintsChecked', { count: checkedCount }) }}</p>
        </div>
      </div>
      <div v-if="blueprints.length" class="chip-list summary-chip-list">
        <span v-for="bp in blueprints" :key="bp.id" class="data-chip">{{ blueprintName(bp) }}</span>
      </div>
      <div v-if="rows.length" class="checker-results">
        <article v-for="row in rows" :key="row.userId" class="check-card" :class="{ 'check-card-excluded': row.trackingExcluded }">
          <header class="check-card-header">
            <div>
              <h3>{{ row.displayName }}</h3>
              <span>{{ row.role }}</span>
              <span v-if="row.trackingExcluded" class="status-chip status-chip-muted">
                {{ t('checker.excludedFromTracking') }}
              </span>
              <span v-if="row.trackingExcluded && row.trackingExcludedReason" class="muted">{{ row.trackingExcludedReason }}</span>
            </div>
            <strong>{{ t('checker.progress', { owned: row.owned, total: checkedCount }) }}</strong>
          </header>
          <div class="check-metrics">
            <span><StatusPill status="OWNED" /> {{ row.owned }}</span>
            <span><StatusPill status="MISSING" /> {{ row.missing }}</span>
            <span><StatusPill status="WANTED" /> {{ row.wanted }}</span>
          </div>
          <div class="check-detail-grid">
            <div v-if="blueprintsByStatus(row, 'OWNED').length">
              <h4>{{ t('checker.ownedList') }}</h4>
              <div class="chip-list">
                <span v-for="bp in blueprintsByStatus(row, 'OWNED')" :key="bp.blueprintId" class="data-chip owned-chip">
                  {{ blueprintName(bp) }}
                </span>
              </div>
            </div>
            <div v-if="blueprintsByStatus(row, 'MISSING').length">
              <h4>{{ t('checker.missingList') }}</h4>
              <div class="chip-list">
                <span v-for="bp in blueprintsByStatus(row, 'MISSING')" :key="bp.blueprintId" class="data-chip danger-chip">
                  {{ blueprintName(bp) }}
                </span>
              </div>
            </div>
            <div v-if="blueprintsByStatus(row, 'WANTED').length">
              <h4>{{ t('checker.wantedList') }}</h4>
              <div class="chip-list">
                <span v-for="bp in blueprintsByStatus(row, 'WANTED')" :key="bp.blueprintId" class="data-chip warning-chip">
                  {{ blueprintName(bp) }}
                </span>
              </div>
            </div>
          </div>
        </article>
      </div>
      <div v-else class="empty-state">
        {{ t('checker.noResults') }}
      </div>
    </section>
  </section>
</template>
