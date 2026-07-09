<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { AlertCircle, ArrowDown, ArrowUp, ArrowUpDown, CheckCircle2, CheckSquare, Search, Sparkles, Square, X } from '@lucide/vue'
import AppTooltip from '../components/AppTooltip.vue'
import { api } from '../services/api'
import { useAuth } from '../composables/useAuth'
import { localizedName, localizedText } from '../utils/labels'

type Blueprint = {
  id: string
  canonicalName: string
  nameDe: string
  nameEn: string | null
  translations: Array<{ locale: string; name: string }>
  systemName: string | null
  itemTypeName: string | null
  itemTypeNameDe: string | null
  itemTypeNameEn: string | null
  itemTypeTranslations: Array<{ locale: string; name: string }>
  slotGroup: string | null
  siriusRing: number | null
  siriusTechTier: string | null
  rarity: string
}

type SortKey = 'name' | 'system' | 'type' | 'slot' | 'rarity' | 'status'
type SortDirection = 'asc' | 'desc'

type SortPreference = {
  key: SortKey | ''
  direction: SortDirection
}

const { user } = useAuth()
const { t, te, locale } = useI18n()
const q = ref('')
const slotGroup = ref('')
const blueprints = ref<Blueprint[]>([])
const statuses = ref<Record<string, string>>({})
const loading = ref(false)
const bulkSaving = ref(false)
const selectedIds = ref<Set<string>>(new Set())
const isMobileLayout = ref(false)
const slotOptions = ['SLOT_18', 'SLOT_14', 'SLOT_12', 'SLOT_5', 'SLOT_2', 'RESOURCE'] as const
const statusOptions = ['MISSING', 'WANTED', 'OWNED'] as const
const bulkStatusOptions = ['OWNED', 'MISSING', 'WANTED'] as const
const sortKeys = ['name', 'system', 'type', 'slot', 'rarity', 'status'] as const
const sortDirections = ['asc', 'desc'] as const
const sortPreferenceStorageKey = 'bp-tracker:blueprint-sort'
const slotSortWeights: Record<string, number> = {
  SLOT_2: 2,
  SLOT_5: 5,
  SLOT_12: 12,
  SLOT_14: 14,
  SLOT_18: 18,
}
const sortOptions: Array<{
  key: SortKey
  labelKey: string
  requiresUser?: boolean
}> = [
  { key: 'name', labelKey: 'blueprints.name' },
  { key: 'system', labelKey: 'blueprints.system' },
  { key: 'type', labelKey: 'blueprints.type' },
  { key: 'slot', labelKey: 'blueprints.slot' },
  { key: 'rarity', labelKey: 'blueprints.rarity' },
  { key: 'status', labelKey: 'blueprints.myStatus', requiresUser: true },
]
let mobileLayoutQuery: MediaQueryList | null = null

const isSortKey = (value: unknown): value is SortKey => typeof value === 'string' && sortKeys.includes(value as SortKey)
const isSortDirection = (value: unknown): value is SortDirection =>
  typeof value === 'string' && sortDirections.includes(value as SortDirection)
const readSortPreference = (): SortPreference => {
  if (typeof window === 'undefined') return { key: '', direction: 'asc' }
  try {
    const parsed = JSON.parse(window.localStorage.getItem(sortPreferenceStorageKey) ?? '{}') as Partial<SortPreference>
    return {
      key: isSortKey(parsed.key) ? parsed.key : '',
      direction: isSortDirection(parsed.direction) ? parsed.direction : 'asc',
    }
  } catch {
    return { key: '', direction: 'asc' }
  }
}
const initialSortPreference = readSortPreference()
const sortKey = ref<SortKey | ''>(initialSortPreference.key)
const sortDirection = ref<SortDirection>(initialSortPreference.direction)
const selectedCount = computed(() => selectedIds.value.size)
const visibleIds = computed(() => filtered.value.map((blueprint) => blueprint.id))
const allVisibleSelected = computed(
  () => visibleIds.value.length > 0 && visibleIds.value.every((blueprintId) => selectedIds.value.has(blueprintId)),
)
const enumLabel = (scope: 'slot' | 'status' | 'rarity', value: string | null | undefined) => {
  if (!value) return '-'
  const key = `${scope}.${value}`
  return te(key) ? t(key) : value
}

const isSiriusBlueprint = (name: string | null | undefined) => Boolean(name?.toLowerCase().startsWith('sirius '))
const blueprintName = (blueprint: Blueprint) => localizedName(blueprint, locale.value)
const itemTypeName = (blueprint: Blueprint) =>
  localizedText(
    blueprint.itemTypeNameDe ?? blueprint.itemTypeName,
    blueprint.itemTypeNameEn,
    locale.value,
    '-',
    blueprint.itemTypeTranslations,
  )
const statusValue = (blueprintId: string) =>
  statuses.value[blueprintId] === 'UNKNOWN' ? 'MISSING' : (statuses.value[blueprintId] ?? 'MISSING')
const activeSortKey = computed(() => (sortKey.value === 'status' && !user.value ? '' : sortKey.value))
const availableSortOptions = computed(() => sortOptions.filter((option) => !option.requiresUser || user.value))
const sortCollator = computed(() => new Intl.Collator(locale.value, { numeric: true, sensitivity: 'base' }))
const sortDirectionMultiplier = computed(() => (sortDirection.value === 'asc' ? 1 : -1))
const sortColumnLabel = (key: SortKey) => t(sortOptions.find((option) => option.key === key)?.labelKey ?? `blueprints.${key}`)
const sortDirectionLabel = computed(() => {
  if (sortKey.value === 'slot') return t(sortDirection.value === 'asc' ? 'blueprints.sortSlotAscending' : 'blueprints.sortSlotDescending')
  return t(sortDirection.value === 'asc' ? 'blueprints.sortAscending' : 'blueprints.sortDescending')
})
const nextSortDirection = (key: SortKey) => (sortKey.value === key && sortDirection.value === 'asc' ? 'desc' : 'asc')
const sortToggleLabel = (key: SortKey) =>
  t('blueprints.sortByColumn', {
    column: sortColumnLabel(key),
    direction:
      key === 'slot'
        ? t(nextSortDirection(key) === 'asc' ? 'blueprints.sortSlotAscending' : 'blueprints.sortSlotDescending')
        : t(nextSortDirection(key) === 'asc' ? 'blueprints.sortAscending' : 'blueprints.sortDescending'),
  })
const sortAria = (key: SortKey) => {
  if (activeSortKey.value !== key) return 'none'
  return sortDirection.value === 'asc' ? 'ascending' : 'descending'
}
const sortIcon = (key: SortKey) => {
  if (activeSortKey.value !== key) return ArrowUpDown
  return sortDirection.value === 'asc' ? ArrowUp : ArrowDown
}
const visibleSelectionLabel = computed(() => (allVisibleSelected.value ? t('blueprints.deselectVisible') : t('blueprints.selectVisible')))
const selectedBlueprints = computed(() => blueprints.value.filter((blueprint) => selectedIds.value.has(blueprint.id)))
const selectedPreviewNames = computed(() => selectedBlueprints.value.slice(0, 3).map(blueprintName))
const selectedPreviewOverflow = computed(() => Math.max(selectedCount.value - selectedPreviewNames.value.length, 0))

const bulkStatusLabel = (status: (typeof bulkStatusOptions)[number]) => {
  if (status === 'OWNED') return t('blueprints.setOwned')
  if (status === 'MISSING') return t('blueprints.setMissing')
  return t('blueprints.setWanted')
}

const bulkStatusIcon = (status: (typeof bulkStatusOptions)[number]) => {
  if (status === 'OWNED') return CheckCircle2
  if (status === 'MISSING') return AlertCircle
  return Sparkles
}

const bulkStatusClass = (status: (typeof bulkStatusOptions)[number]) => ({
  'status-action-owned': status === 'OWNED',
  'status-action-missing': status === 'MISSING',
  'status-action-wanted': status === 'WANTED',
})

const compareText = (left: string, right: string) => sortCollator.value.compare(left, right) * sortDirectionMultiplier.value

const compareSlot = (left: Blueprint, right: Blueprint) => {
  const leftWeight = left.slotGroup ? slotSortWeights[left.slotGroup] : undefined
  const rightWeight = right.slotGroup ? slotSortWeights[right.slotGroup] : undefined
  const leftHasNumericSlot = typeof leftWeight === 'number'
  const rightHasNumericSlot = typeof rightWeight === 'number'

  if (leftHasNumericSlot && rightHasNumericSlot && leftWeight !== rightWeight) {
    return (leftWeight - rightWeight) * sortDirectionMultiplier.value
  }
  if (leftHasNumericSlot !== rightHasNumericSlot) return leftHasNumericSlot ? -1 : 1

  return compareText(enumLabel('slot', left.slotGroup), enumLabel('slot', right.slotGroup))
}

const sortTextValue = (blueprint: Blueprint, key: Exclude<SortKey, 'slot'>) => {
  if (key === 'name') return blueprintName(blueprint)
  if (key === 'system') return blueprint.systemName ?? '-'
  if (key === 'type') return itemTypeName(blueprint)
  if (key === 'rarity') return enumLabel('rarity', blueprint.rarity)
  return enumLabel('status', statusValue(blueprint.id))
}

const compareBlueprints = (left: Blueprint, right: Blueprint) => {
  const key = activeSortKey.value
  if (!key) return 0

  const primary = key === 'slot' ? compareSlot(left, right) : compareText(sortTextValue(left, key), sortTextValue(right, key))
  if (primary !== 0) return primary

  const nameFallback = sortCollator.value.compare(blueprintName(left), blueprintName(right))
  if (nameFallback !== 0) return nameFallback
  return sortCollator.value.compare(left.id, right.id)
}

const filtered = computed(() => {
  const entries = [...blueprints.value]
  if (!activeSortKey.value) return entries
  return entries.sort(compareBlueprints)
})

const setSortKey = (value: string) => {
  if (!value) {
    sortKey.value = ''
    sortDirection.value = 'asc'
    return
  }
  if (!isSortKey(value)) return
  if (sortKey.value !== value) sortDirection.value = 'asc'
  sortKey.value = value
}

const toggleSort = (key: SortKey) => {
  if (sortKey.value === key) {
    sortDirection.value = sortDirection.value === 'asc' ? 'desc' : 'asc'
    return
  }
  sortKey.value = key
  sortDirection.value = 'asc'
}

const toggleSortDirection = () => {
  sortDirection.value = sortDirection.value === 'asc' ? 'desc' : 'asc'
}

const loadBlueprints = async () => {
  loading.value = true
  try {
    const params = new URLSearchParams()
    if (q.value) params.set('q', q.value)
    if (slotGroup.value) params.set('slotGroup', slotGroup.value)
    const response = await api.get<{ blueprints: Blueprint[] }>(`/blueprints?${params.toString()}`)
    blueprints.value = response.blueprints
  } finally {
    loading.value = false
  }
}

const loadStatuses = async () => {
  if (!user.value) return
  const response = await api.get<{
    statuses: Array<{ blueprintId: string; status: string }>
  }>('/blueprints/me/statuses')
  statuses.value = Object.fromEntries(response.statuses.map((status) => [status.blueprintId, status.status]))
}

const setStatus = async (blueprintId: string, status: string) => {
  await api.put(`/blueprints/me/statuses/${blueprintId}`, { status })
  statuses.value = { ...statuses.value, [blueprintId]: status }
}

const toggleSelected = (blueprintId: string) => {
  const next = new Set(selectedIds.value)
  if (next.has(blueprintId)) {
    next.delete(blueprintId)
  } else {
    next.add(blueprintId)
  }
  selectedIds.value = next
}

const toggleVisibleSelection = () => {
  const next = new Set(selectedIds.value)
  if (allVisibleSelected.value) {
    for (const blueprintId of visibleIds.value) {
      next.delete(blueprintId)
    }
  } else {
    for (const blueprintId of visibleIds.value) {
      next.add(blueprintId)
    }
  }
  selectedIds.value = next
}

const clearSelection = () => {
  selectedIds.value = new Set()
}

const applyBulkStatus = async (status: string) => {
  if (!user.value || selectedIds.value.size === 0) return
  bulkSaving.value = true
  try {
    const blueprintIds = Array.from(selectedIds.value)
    await api.put('/blueprints/me/statuses', { blueprintIds, status })
    statuses.value = {
      ...statuses.value,
      ...Object.fromEntries(blueprintIds.map((blueprintId) => [blueprintId, status])),
    }
    clearSelection()
  } finally {
    bulkSaving.value = false
  }
}

const updateMobileLayout = () => {
  isMobileLayout.value = Boolean(mobileLayoutQuery?.matches)
}

const setupMobileLayoutObserver = () => {
  if (typeof window === 'undefined') return
  mobileLayoutQuery = window.matchMedia('(max-width: 640px)')
  updateMobileLayout()
  mobileLayoutQuery.addEventListener('change', updateMobileLayout)
}

onMounted(async () => {
  setupMobileLayoutObserver()
  await loadBlueprints()
  await loadStatuses()
})

watch([sortKey, sortDirection], () => {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(
    sortPreferenceStorageKey,
    JSON.stringify({
      key: sortKey.value,
      direction: sortDirection.value,
    }),
  )
})

onBeforeUnmount(() => {
  mobileLayoutQuery?.removeEventListener('change', updateMobileLayout)
  mobileLayoutQuery = null
})
</script>

<template>
  <section
    class="page"
    :class="{
      'has-mobile-bulk-action': user && isMobileLayout && selectedCount > 0,
    }"
  >
    <div class="page-header">
      <div>
        <h1 class="page-title">{{ t('blueprints.title') }}</h1>
        <p class="page-subtitle">
          {{ t('blueprints.subtitle', { count: blueprints.length }) }}
        </p>
      </div>
      <AppTooltip :text="t('tooltips.blueprints')" />
    </div>

    <section class="panel toolbar-panel">
      <div class="filters">
        <label>
          {{ t('blueprints.search') }}
          <input
            id="blueprint-search"
            v-model="q"
            name="blueprintSearch"
            :placeholder="t('blueprints.searchPlaceholder')"
            @keyup.enter="loadBlueprints"
          />
        </label>
        <label>
          {{ t('blueprints.slot') }}
          <select id="blueprint-slot-filter" v-model="slotGroup" name="blueprintSlotFilter" @change="loadBlueprints">
            <option value="">{{ t('blueprints.all') }}</option>
            <option v-for="option in slotOptions" :key="option" :value="option">
              {{ enumLabel('slot', option) }}
            </option>
          </select>
        </label>
        <button class="secondary-button" :disabled="loading" @click="loadBlueprints">
          <Search :size="16" /> {{ t('app.actions.search') }}
        </button>
      </div>
      <div v-if="user" class="selection-toolbar">
        <button class="secondary-button" :disabled="!visibleIds.length || bulkSaving" @click="toggleVisibleSelection">
          <CheckSquare v-if="allVisibleSelected" :size="16" />
          <Square v-else :size="16" />
          {{ visibleSelectionLabel }}
        </button>
        <AppTooltip :text="t('tooltips.bulkSelection')" />
      </div>
      <div v-if="isMobileLayout" class="mobile-sort-toolbar" role="group" :aria-label="t('blueprints.sortControls')">
        <label>
          {{ t('blueprints.sortBy') }}
          <select
            id="blueprint-sort-key"
            name="blueprintSortKey"
            :value="activeSortKey"
            @change="setSortKey(($event.target as HTMLSelectElement).value)"
          >
            <option value="">{{ t('blueprints.sortDefault') }}</option>
            <option v-for="option in availableSortOptions" :key="option.key" :value="option.key">
              {{ t(option.labelKey) }}
            </option>
          </select>
        </label>
        <button
          class="secondary-button sort-direction-button"
          :disabled="!activeSortKey"
          :title="sortDirectionLabel"
          :aria-label="sortDirectionLabel"
          @click="toggleSortDirection"
        >
          <ArrowUp v-if="sortDirection === 'asc'" :size="16" />
          <ArrowDown v-else :size="16" />
          {{ sortDirectionLabel }}
        </button>
      </div>
      <div v-if="user && selectedCount > 0" class="bulk-actionbar" aria-live="polite">
        <div class="bulk-summary">
          <strong>{{ t('blueprints.selected', { count: selectedCount }) }}</strong>
          <div v-if="selectedPreviewNames.length" class="selection-preview" :aria-label="t('blueprints.selectedPreview')">
            <span v-for="name in selectedPreviewNames" :key="name" class="data-chip">{{ name }}</span>
            <span v-if="selectedPreviewOverflow" class="data-chip">{{
              t('blueprints.selectedPreviewMore', {
                count: selectedPreviewOverflow,
              })
            }}</span>
          </div>
        </div>
        <div class="bulk-status-actions" role="group" :aria-label="t('blueprints.bulkStatus')">
          <button
            v-for="option in bulkStatusOptions"
            :key="option"
            class="status-action"
            :class="bulkStatusClass(option)"
            :disabled="bulkSaving"
            @click="applyBulkStatus(option)"
          >
            <component :is="bulkStatusIcon(option)" :size="16" />
            {{ bulkStatusLabel(option) }}
          </button>
        </div>
        <button
          class="icon-button"
          :disabled="bulkSaving"
          :title="t('blueprints.clearSelection')"
          :aria-label="t('blueprints.clearSelection')"
          @click="clearSelection"
        >
          <X :size="16" />
        </button>
      </div>
    </section>

    <section class="panel">
      <div class="panel-header">
        <h2 class="panel-title">
          {{ t('blueprints.visible', { count: filtered.length }) }}
        </h2>
      </div>
      <div v-if="!isMobileLayout" class="table-wrap responsive-desktop-table" tabindex="0">
        <table>
          <thead>
            <tr>
              <th v-if="user" class="selection-cell">
                <button
                  class="checkbox-button"
                  :class="{ 'is-selected': allVisibleSelected }"
                  :title="visibleSelectionLabel"
                  :aria-label="visibleSelectionLabel"
                  @click="toggleVisibleSelection"
                >
                  <CheckSquare v-if="allVisibleSelected" :size="16" />
                  <Square v-else :size="16" />
                </button>
              </th>
              <th :aria-sort="sortAria('name')">
                <button
                  class="table-sort-button"
                  :class="{ 'is-active': activeSortKey === 'name' }"
                  :title="sortToggleLabel('name')"
                  :aria-label="sortToggleLabel('name')"
                  @click="toggleSort('name')"
                >
                  <span>{{ t('blueprints.name') }}</span>
                  <component :is="sortIcon('name')" class="table-sort-icon" :size="14" />
                </button>
              </th>
              <th :aria-sort="sortAria('system')">
                <button
                  class="table-sort-button"
                  :class="{ 'is-active': activeSortKey === 'system' }"
                  :title="sortToggleLabel('system')"
                  :aria-label="sortToggleLabel('system')"
                  @click="toggleSort('system')"
                >
                  <span>{{ t('blueprints.system') }}</span>
                  <component :is="sortIcon('system')" class="table-sort-icon" :size="14" />
                </button>
              </th>
              <th :aria-sort="sortAria('type')">
                <button
                  class="table-sort-button"
                  :class="{ 'is-active': activeSortKey === 'type' }"
                  :title="sortToggleLabel('type')"
                  :aria-label="sortToggleLabel('type')"
                  @click="toggleSort('type')"
                >
                  <span>{{ t('blueprints.type') }}</span>
                  <component :is="sortIcon('type')" class="table-sort-icon" :size="14" />
                </button>
              </th>
              <th :aria-sort="sortAria('slot')">
                <button
                  class="table-sort-button"
                  :class="{ 'is-active': activeSortKey === 'slot' }"
                  :title="sortToggleLabel('slot')"
                  :aria-label="sortToggleLabel('slot')"
                  @click="toggleSort('slot')"
                >
                  <span>{{ t('blueprints.slot') }}</span>
                  <component :is="sortIcon('slot')" class="table-sort-icon" :size="14" />
                </button>
              </th>
              <th :aria-sort="sortAria('rarity')">
                <button
                  class="table-sort-button"
                  :class="{ 'is-active': activeSortKey === 'rarity' }"
                  :title="sortToggleLabel('rarity')"
                  :aria-label="sortToggleLabel('rarity')"
                  @click="toggleSort('rarity')"
                >
                  <span>{{ t('blueprints.rarity') }}</span>
                  <component :is="sortIcon('rarity')" class="table-sort-icon" :size="14" />
                </button>
              </th>
              <th v-if="user" :aria-sort="sortAria('status')">
                <button
                  class="table-sort-button"
                  :class="{ 'is-active': activeSortKey === 'status' }"
                  :title="sortToggleLabel('status')"
                  :aria-label="sortToggleLabel('status')"
                  @click="toggleSort('status')"
                >
                  <span>{{ t('blueprints.myStatus') }}</span>
                  <component :is="sortIcon('status')" class="table-sort-icon" :size="14" />
                </button>
              </th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="bp in filtered" :key="bp.id" :class="{ 'selected-row': selectedIds.has(bp.id) }">
              <td v-if="user" class="selection-cell">
                <button
                  class="checkbox-button"
                  :class="{ 'is-selected': selectedIds.has(bp.id) }"
                  :title="t('blueprints.toggleSelection')"
                  :aria-label="t('blueprints.toggleSelection')"
                  @click="toggleSelected(bp.id)"
                >
                  <CheckSquare v-if="selectedIds.has(bp.id)" :size="16" />
                  <Square v-else :size="16" />
                </button>
              </td>
              <td>
                <span
                  :class="{
                    'sirius-bp-name': isSiriusBlueprint(bp.canonicalName),
                  }"
                  >{{ blueprintName(bp) }}</span
                >
              </td>
              <td>{{ bp.systemName ?? '-' }}</td>
              <td>{{ itemTypeName(bp) }}</td>
              <td>{{ enumLabel('slot', bp.slotGroup) }}</td>
              <td>{{ enumLabel('rarity', bp.rarity) }}</td>
              <td v-if="user">
                <div class="inline-status-control">
                  <select
                    :id="`blueprint-status-${bp.id}`"
                    :name="`blueprintStatus-${bp.id}`"
                    :value="statusValue(bp.id)"
                    @change="setStatus(bp.id, ($event.target as HTMLSelectElement).value)"
                  >
                    <option v-for="option in statusOptions" :key="option" :value="option">
                      {{ enumLabel('status', option) }}
                    </option>
                  </select>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <div v-if="isMobileLayout" class="mobile-card-list blueprint-mobile-list" aria-live="polite">
        <article
          v-for="bp in filtered"
          :key="`mobile-${bp.id}`"
          class="mobile-card blueprint-mobile-card"
          :class="{ 'is-selected': selectedIds.has(bp.id) }"
        >
          <header class="mobile-card-header">
            <div class="mobile-card-title-row">
              <button
                v-if="user"
                class="checkbox-button mobile-card-checkbox"
                :class="{ 'is-selected': selectedIds.has(bp.id) }"
                :title="t('blueprints.toggleSelection')"
                :aria-label="t('blueprints.toggleSelection')"
                @click="toggleSelected(bp.id)"
              >
                <CheckSquare v-if="selectedIds.has(bp.id)" :size="16" />
                <Square v-else :size="16" />
              </button>
              <h3
                class="mobile-card-title"
                :class="{
                  'sirius-bp-name': isSiriusBlueprint(bp.canonicalName),
                }"
              >
                {{ blueprintName(bp) }}
              </h3>
            </div>
            <span class="status-chip">{{ enumLabel('rarity', bp.rarity) }}</span>
          </header>

          <div class="mobile-card-meta-grid">
            <div class="mobile-label-row">
              <span>{{ t('blueprints.system') }}</span>
              <strong>{{ bp.systemName ?? '-' }}</strong>
            </div>
            <div class="mobile-label-row">
              <span>{{ t('blueprints.type') }}</span>
              <strong>{{ itemTypeName(bp) }}</strong>
            </div>
            <div class="mobile-label-row">
              <span>{{ t('blueprints.slot') }}</span>
              <strong>{{ enumLabel('slot', bp.slotGroup) }}</strong>
            </div>
          </div>

          <label v-if="user" class="mobile-select-row">
            <span>{{ t('blueprints.myStatus') }}</span>
            <select
              :id="`blueprint-mobile-status-${bp.id}`"
              :name="`blueprintMobileStatus-${bp.id}`"
              :value="statusValue(bp.id)"
              @change="setStatus(bp.id, ($event.target as HTMLSelectElement).value)"
            >
              <option v-for="option in statusOptions" :key="option" :value="option">
                {{ enumLabel('status', option) }}
              </option>
            </select>
          </label>
        </article>
      </div>
    </section>
  </section>
</template>
