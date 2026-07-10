<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { Download, RefreshCw, Search, TableProperties } from '@lucide/vue'
import AppTooltip from '../components/AppTooltip.vue'
import StatusPill from '../components/StatusPill.vue'
import { useClans } from '../composables/useClans'
import { api } from '../services/api'
import { localizedName } from '../utils/labels'

type OverviewStatus = 'OWNED' | 'MISSING' | 'WANTED'
type OverviewScope = 'all' | 'sirius-own' | 'sirius-all-ring5'
type OverviewBlueprint = {
  id: string
  blueprintId: string
  canonicalName: string
  nameDe: string
  nameEn: string | null
  translations?: Array<{ locale: string; name: string }> | null
  systemName: string | null
  slotGroup: string | null
  partsRequired: number | null
  status: OverviewStatus
}
type OverviewRow = {
  userId: string
  displayName: string
  role: string
  trackingExcluded: boolean
  trackingExcludedReason: string | null
  owned: number
  missing: number
  wanted: number
  blueprints: OverviewBlueprint[]
}
type OverviewTotals = {
  members: number
  blueprints: number
  owned: number
  missing: number
  wanted: number
}

const { selectedClanId, selectedClan, loadClans } = useClans()
const { t, te, locale } = useI18n()
const rows = ref<OverviewRow[]>([])
const totals = ref<OverviewTotals>({ members: 0, blueprints: 0, owned: 0, missing: 0, wanted: 0 })
const loading = ref(false)
const query = ref('')
const statusFilter = ref<'all' | OverviewStatus>('all')
const scope = ref<OverviewScope>('all')
const includeExcluded = ref(false)
const includeSiriusResources = ref(false)
const expandedUserIds = ref<Set<string>>(new Set())
const scopeOptions: OverviewScope[] = ['all', 'sirius-own', 'sirius-all-ring5']
const statusOptions: Array<'all' | OverviewStatus> = ['all', 'MISSING', 'WANTED', 'OWNED']
const scopeLabelKey = (value: OverviewScope) => (value === 'sirius-own' ? 'overview.scopes.siriusOwn' : value === 'sirius-all-ring5' ? 'overview.scopes.siriusAllRing5' : 'overview.scopes.all')

const enumLabel = (scopeName: 'role' | 'status' | 'slot', value: string | null | undefined) => {
  if (!value) return '-'
  const key = `${scopeName}.${value}`
  return te(key) ? t(key) : value
}
const blueprintName = (blueprint: OverviewBlueprint) => localizedName(blueprint, locale.value)
const slotLabel = (blueprint: OverviewBlueprint) => (blueprint.slotGroup === 'RESOURCE' && blueprint.partsRequired ? `${blueprint.partsRequired}er` : enumLabel('slot', blueprint.slotGroup))
const statusClass = (status: OverviewStatus) => ({
  'owned-chip': status === 'OWNED',
  'danger-chip': status === 'MISSING',
  'warning-chip': status === 'WANTED',
})
const completionPercent = (row: OverviewRow) => {
  const total = row.owned + row.missing + row.wanted
  return total > 0 ? Math.round((row.owned / total) * 100) : 0
}

const blueprintsForRow = (row: OverviewRow) => {
  const normalizedQuery = query.value.trim().toLowerCase()
  return row.blueprints.filter(blueprint => {
    const statusMatches = statusFilter.value === 'all' || blueprint.status === statusFilter.value
    if (!statusMatches) return false
    if (!normalizedQuery) return true
    return [blueprintName(blueprint), blueprint.canonicalName, blueprint.systemName, slotLabel(blueprint)].filter(Boolean).join(' ').toLowerCase().includes(normalizedQuery)
  })
}

const filteredRows = computed(() => {
  const normalizedQuery = query.value.trim().toLowerCase()
  return rows.value.filter(row => {
    if (normalizedQuery && row.displayName.toLowerCase().includes(normalizedQuery)) return true
    return blueprintsForRow(row).length > 0
  })
})

const filteredTotals = computed(() =>
  filteredRows.value.reduce(
    (summary, row) => {
      const blueprints = blueprintsForRow(row)
      summary.members += 1
      summary.blueprints += blueprints.length
      summary.owned += blueprints.filter(blueprint => blueprint.status === 'OWNED').length
      summary.missing += blueprints.filter(blueprint => blueprint.status === 'MISSING').length
      summary.wanted += blueprints.filter(blueprint => blueprint.status === 'WANTED').length
      return summary
    },
    { members: 0, blueprints: 0, owned: 0, missing: 0, wanted: 0 },
  ),
)

const isExpanded = (userId: string) => expandedUserIds.value.has(userId)
const toggleExpanded = (userId: string) => {
  const next = new Set(expandedUserIds.value)
  if (next.has(userId)) next.delete(userId)
  else next.add(userId)
  expandedUserIds.value = next
}
const visibleBlueprintsForRow = (row: OverviewRow) => {
  const blueprints = blueprintsForRow(row)
  return isExpanded(row.userId) ? blueprints : blueprints.slice(0, 18)
}

const loadOverview = async () => {
  if (!selectedClanId.value) return
  loading.value = true
  try {
    const params = new URLSearchParams({ scope: scope.value })
    if (includeExcluded.value) params.set('includeExcluded', 'true')
    if (includeSiriusResources.value) params.set('includeSiriusResources', 'true')
    const response = await api.get<{ rows: OverviewRow[]; totals: OverviewTotals }>(`/clans/${selectedClanId.value}/blueprint-overview?${params.toString()}`)
    rows.value = response.rows
    totals.value = response.totals
    expandedUserIds.value = new Set()
  } finally {
    loading.value = false
  }
}

const csvEscape = (value: string | number | null | undefined) => `"${String(value ?? '').replaceAll('"', '""')}"`
const exportCsv = () => {
  const lines = [['Member', 'Role', 'Tracking', 'Status', 'Blueprint', 'System', 'Slot'].map(csvEscape).join(',')]
  for (const row of filteredRows.value) {
    for (const blueprint of blueprintsForRow(row)) {
      lines.push(
        [
          row.displayName,
          enumLabel('role', row.role),
          row.trackingExcluded ? t('admin.trackingExcluded') : t('admin.trackingIncluded'),
          enumLabel('status', blueprint.status),
          blueprintName(blueprint),
          blueprint.systemName ?? '-',
          slotLabel(blueprint),
        ]
          .map(csvEscape)
          .join(','),
      )
    }
  }
  const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `bp-tracker-${selectedClan.value?.slug ?? 'clan'}-overview.csv`
  link.click()
  URL.revokeObjectURL(url)
}

onMounted(async () => {
  await loadClans()
  await loadOverview()
})

watch([selectedClanId, scope, includeExcluded, includeSiriusResources], () => {
  void loadOverview()
})
</script>

<template>
  <section class="page">
    <div class="page-header">
      <div>
        <h1 class="page-title">{{ t('overview.title') }}</h1>
        <p class="page-subtitle">{{ selectedClan?.name ?? t('app.noClan') }}</p>
      </div>
      <div class="page-actions">
        <AppTooltip :text="t('tooltips.overview')" />
        <button class="secondary-button" :disabled="loading" @click="loadOverview"><RefreshCw :size="16" /> {{ t('app.actions.refresh') }}</button>
        <button class="secondary-button" :disabled="filteredRows.length === 0" @click="exportCsv"><Download :size="16" /> {{ t('overview.exportCsv') }}</button>
      </div>
    </div>

    <div class="grid-3">
      <article class="panel stat-card">
        <h2 class="panel-title">{{ t('overview.members') }}</h2>
        <strong class="stat-value">{{ filteredTotals.members }}</strong>
        <span class="stat-caption">{{ t('overview.membersCaption', { total: totals.members }) }}</span>
      </article>
      <article class="panel stat-card">
        <h2 class="panel-title">{{ t('overview.blueprints') }}</h2>
        <strong class="stat-value">{{ filteredTotals.blueprints }}</strong>
        <span class="stat-caption">{{ t('overview.blueprintsCaption', { total: totals.blueprints }) }}</span>
      </article>
      <article class="panel stat-card">
        <h2 class="panel-title">{{ t('overview.openWork') }}</h2>
        <strong class="stat-value">{{ filteredTotals.missing + filteredTotals.wanted }}</strong>
        <span class="stat-caption">{{ t('overview.openWorkCaption', { missing: filteredTotals.missing, wanted: filteredTotals.wanted }) }}</span>
      </article>
    </div>

    <section class="panel">
      <div class="filters">
        <label>
          {{ t('overview.scope') }}
          <select id="overview-scope" v-model="scope" name="overviewScope">
            <option v-for="option in scopeOptions" :key="option" :value="option">{{ t(scopeLabelKey(option)) }}</option>
          </select>
        </label>
        <label>
          {{ t('overview.status') }}
          <select id="overview-status" v-model="statusFilter" name="overviewStatus">
            <option v-for="option in statusOptions" :key="option" :value="option">
              {{ option === 'all' ? t('overview.allStatuses') : enumLabel('status', option) }}
            </option>
          </select>
        </label>
        <label class="search-field">
          {{ t('overview.search') }}
          <span>
            <Search :size="16" />
            <input id="overview-search" v-model="query" name="overviewSearch" :placeholder="t('overview.searchPlaceholder')" />
          </span>
        </label>
        <label v-if="scope !== 'all'" class="toggle-row">
          <input id="overview-include-resources" v-model="includeSiriusResources" name="overviewIncludeResources" type="checkbox" />
          <span>{{ t('overview.includeResources') }}</span>
        </label>
        <label class="toggle-row">
          <input id="overview-include-excluded" v-model="includeExcluded" name="overviewIncludeExcluded" type="checkbox" />
          <span>{{ t('checker.includeExcluded') }}</span>
        </label>
      </div>
    </section>

    <section class="section-block">
      <div class="panel-header">
        <div>
          <h2 class="panel-title"><TableProperties :size="18" /> {{ t('overview.results') }}</h2>
          <p class="panel-subtitle">{{ t('overview.resultsSubtitle', { members: filteredTotals.members, blueprints: filteredTotals.blueprints }) }}</p>
        </div>
      </div>

      <div v-if="filteredRows.length" class="overview-results">
        <article v-for="row in filteredRows" :key="row.userId" class="overview-card" :class="{ 'check-card-excluded': row.trackingExcluded }">
          <header class="overview-card-header">
            <div>
              <h3>{{ row.displayName }}</h3>
              <div class="overview-card-meta">
                <span class="status-chip">{{ enumLabel('role', row.role) }}</span>
                <span v-if="row.trackingExcluded" class="status-chip status-chip-muted">{{ t('checker.excludedFromTracking') }}</span>
                <span v-if="row.trackingExcluded && row.trackingExcludedReason" class="muted">{{ row.trackingExcludedReason }}</span>
              </div>
            </div>
            <strong>{{ t('overview.progress', { percent: completionPercent(row) }) }}</strong>
          </header>
          <div class="overview-progress" aria-hidden="true">
            <span :style="{ width: `${completionPercent(row)}%` }"></span>
          </div>
          <div class="check-metrics">
            <span><StatusPill status="OWNED" /> {{ row.owned }}</span>
            <span><StatusPill status="MISSING" /> {{ row.missing }}</span>
            <span><StatusPill status="WANTED" /> {{ row.wanted }}</span>
          </div>
          <div class="chip-list overview-chip-list">
            <span v-for="blueprint in visibleBlueprintsForRow(row)" :key="`${row.userId}-${blueprint.blueprintId}`" class="data-chip" :class="statusClass(blueprint.status)">
              <StatusPill :status="blueprint.status" />
              {{ blueprintName(blueprint) }}
            </span>
          </div>
          <button v-if="blueprintsForRow(row).length > 18" class="secondary-button overview-expand-button" type="button" @click="toggleExpanded(row.userId)">
            {{ isExpanded(row.userId) ? t('overview.showLess') : t('overview.showAll', { count: blueprintsForRow(row).length }) }}
          </button>
        </article>
      </div>
      <div v-else class="empty-state">{{ t('overview.noResults') }}</div>
    </section>
  </section>
</template>
