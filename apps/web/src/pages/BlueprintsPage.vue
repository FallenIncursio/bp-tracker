<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { AlertCircle, CheckCircle2, CheckSquare, Search, Sparkles, Square, X } from '@lucide/vue'
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
let mobileLayoutQuery: MediaQueryList | null = null

const filtered = computed(() => blueprints.value)
const selectedCount = computed(() => selectedIds.value.size)
const visibleIds = computed(() => filtered.value.map(blueprint => blueprint.id))
const allVisibleSelected = computed(
  () => visibleIds.value.length > 0 && visibleIds.value.every(blueprintId => selectedIds.value.has(blueprintId))
)
const enumLabel = (scope: 'slot' | 'status' | 'rarity', value: string | null | undefined) => {
  if (!value) return '-'
  const key = `${scope}.${value}`
  return te(key) ? t(key) : value
}

const isSiriusBlueprint = (name: string | null | undefined) => Boolean(name?.toLowerCase().startsWith('sirius '))
const blueprintName = (blueprint: Blueprint) => localizedName(blueprint, locale.value)
const itemTypeName = (blueprint: Blueprint) =>
  localizedText(blueprint.itemTypeNameDe ?? blueprint.itemTypeName, blueprint.itemTypeNameEn, locale.value, '-', blueprint.itemTypeTranslations)
const statusValue = (blueprintId: string) => (statuses.value[blueprintId] === 'UNKNOWN' ? 'MISSING' : statuses.value[blueprintId] ?? 'MISSING')
const visibleSelectionLabel = computed(() => (allVisibleSelected.value ? t('blueprints.deselectVisible') : t('blueprints.selectVisible')))
const selectedBlueprints = computed(() => blueprints.value.filter(blueprint => selectedIds.value.has(blueprint.id)))
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
  const response = await api.get<{ statuses: Array<{ blueprintId: string; status: string }> }>('/blueprints/me/statuses')
  statuses.value = Object.fromEntries(response.statuses.map(status => [status.blueprintId, status.status]))
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
      ...Object.fromEntries(blueprintIds.map(blueprintId => [blueprintId, status])),
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

onBeforeUnmount(() => {
  mobileLayoutQuery?.removeEventListener('change', updateMobileLayout)
  mobileLayoutQuery = null
})
</script>

<template>
  <section class="page" :class="{ 'has-mobile-bulk-action': user && isMobileLayout && selectedCount > 0 }">
    <div class="page-header">
      <div>
        <h1 class="page-title">{{ t('blueprints.title') }}</h1>
        <p class="page-subtitle">{{ t('blueprints.subtitle', { count: blueprints.length }) }}</p>
      </div>
      <AppTooltip :text="t('tooltips.blueprints')" />
    </div>

    <section class="panel toolbar-panel">
      <div class="filters">
        <label>
          {{ t('blueprints.search') }}
          <input id="blueprint-search" v-model="q" name="blueprintSearch" :placeholder="t('blueprints.searchPlaceholder')" @keyup.enter="loadBlueprints" />
        </label>
        <label>
          {{ t('blueprints.slot') }}
          <select id="blueprint-slot-filter" v-model="slotGroup" name="blueprintSlotFilter" @change="loadBlueprints">
            <option value="">{{ t('blueprints.all') }}</option>
            <option v-for="option in slotOptions" :key="option" :value="option">{{ enumLabel('slot', option) }}</option>
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
      <div v-if="user && selectedCount > 0" class="bulk-actionbar" aria-live="polite">
        <div class="bulk-summary">
          <strong>{{ t('blueprints.selected', { count: selectedCount }) }}</strong>
          <div v-if="selectedPreviewNames.length" class="selection-preview" :aria-label="t('blueprints.selectedPreview')">
            <span v-for="name in selectedPreviewNames" :key="name" class="data-chip">{{ name }}</span>
            <span v-if="selectedPreviewOverflow" class="data-chip">{{ t('blueprints.selectedPreviewMore', { count: selectedPreviewOverflow }) }}</span>
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
        <button class="icon-button" :disabled="bulkSaving" :title="t('blueprints.clearSelection')" :aria-label="t('blueprints.clearSelection')" @click="clearSelection">
          <X :size="16" />
        </button>
      </div>
    </section>

    <section class="panel">
      <div class="panel-header">
        <h2 class="panel-title">{{ t('blueprints.visible', { count: filtered.length }) }}</h2>
      </div>
      <div v-if="!isMobileLayout" class="table-wrap responsive-desktop-table" tabindex="0">
        <table>
          <thead>
            <tr>
              <th v-if="user" class="selection-cell">
                <button class="checkbox-button" :class="{ 'is-selected': allVisibleSelected }" :title="visibleSelectionLabel" :aria-label="visibleSelectionLabel" @click="toggleVisibleSelection">
                  <CheckSquare v-if="allVisibleSelected" :size="16" />
                  <Square v-else :size="16" />
                </button>
              </th>
              <th>{{ t('blueprints.name') }}</th>
              <th>{{ t('blueprints.system') }}</th>
              <th>{{ t('blueprints.type') }}</th>
              <th>{{ t('blueprints.slot') }}</th>
              <th>{{ t('blueprints.rarity') }}</th>
              <th v-if="user">{{ t('blueprints.myStatus') }}</th>
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
                <span :class="{ 'sirius-bp-name': isSiriusBlueprint(bp.canonicalName) }">{{ blueprintName(bp) }}</span>
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
                    <option v-for="option in statusOptions" :key="option" :value="option">{{ enumLabel('status', option) }}</option>
                  </select>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <div v-if="isMobileLayout" class="mobile-card-list blueprint-mobile-list" aria-live="polite">
        <article v-for="bp in filtered" :key="`mobile-${bp.id}`" class="mobile-card blueprint-mobile-card" :class="{ 'is-selected': selectedIds.has(bp.id) }">
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
              <h3 class="mobile-card-title" :class="{ 'sirius-bp-name': isSiriusBlueprint(bp.canonicalName) }">
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
              <option v-for="option in statusOptions" :key="option" :value="option">{{ enumLabel('status', option) }}</option>
            </select>
          </label>
        </article>
      </div>
    </section>
  </section>
</template>
