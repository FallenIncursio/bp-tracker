<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute } from 'vue-router'
import { ArrowDown, ArrowUp, CalendarClock, CheckCircle2, GripVertical, MoreHorizontal, Pencil, PlayCircle, Plus, RefreshCw, Route, Save, Trash2, X } from '@lucide/vue'
import { api } from '../services/api'
import AppTooltip from '../components/AppTooltip.vue'
import BlueprintCombobox from '../components/BlueprintCombobox.vue'
import CountdownTimer from '../components/CountdownTimer.vue'
import { useClans } from '../composables/useClans'
import { dateTimeInputToSourceIso, formatSourceDateTime, nullableTrimmedText, sourceDateTimeToInput } from '../utils/journey'
import { formatDateTime, localizedName } from '../utils/labels'

type Planet = { id: string; name: string; ring: number | null }
type Blueprint = {
  id: string
  canonicalName: string
  nameDe: string
  nameEn: string | null
  translations?: Array<{ locale: string; name: string }> | null
  systemName: string | null
  slotGroup: string | null
  partsRequired: number | null
  siriusRing: number | null
  siriusTechTier: string | null
  rarity: string
}
type SlotRow = { slotGroup: string; enemyType: string | null; blueprintId: string; partsRequired: number | null }
type Appearance = {
  id: string
  planet: Planet
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
    blueprint: Blueprint | null
  }>
}
type HistoryRow = {
  blueprint: Blueprint
  totalDrops: number
  lastDropAt: string | null
  lastObservedAt: string | null
  lastExpiresAt: string | null
  lastAppearanceId: string | null
  lastPlanet: { id: string; name: string; ring: number | null } | null
  lastStatus: string | null
  lastSlotGroup: string | null
  lastEnemyType: string | null
  lastPartsRequired: number | null
  lastSourceType: string | null
  lastSourceRef: string | null
  lastSeenAt: string | null
  evidenceCount: number
  active: boolean
}
type SpawnWindow = {
  id: string
  expectedAt: string
  status: string
  derivedStatus: 'ACTIVE_SOURCE' | 'WAITING_FOR_SPAWN' | 'OVERDUE' | 'RESOLVED' | 'CANCELLED'
  notes: string | null
  sourceAppearance: {
    id: string
    ring: number
    techTier: string | null
    observedAt: string
    expiresAt: string
    nextSpawnAt: string | null
    status: string
    planet: Planet
  }
  resolvedAppearance: {
    id: string
    ring: number
    techTier: string | null
    observedAt: string
    expiresAt: string
    nextSpawnAt: string | null
    status: string
    planet: Planet
  } | null
}
type JourneyStopStatus = 'PLANNED' | 'CURRENT' | 'COMPLETED' | 'SKIPPED' | 'CANCELLED'
type JourneyStopCertainty = 'CONFIRMED' | 'TENTATIVE'
type JourneyStop = {
  id: string
  appearanceId: string | null
  planetId: string | null
  planetName: string | null
  ring: number
  arriveAt: string | null
  departAt: string | null
  status: JourneyStopStatus
  certainty: JourneyStopCertainty
  sortOrder: number
  notes: string | null
  warnings: string[]
  metrics: {
    owned: number
    missing: number
    wanted: number
  }
  planet: Planet | null
  appearance: {
    id: string
    ring: number
    techTier: string | null
    observedAt: string
    expiresAt: string
    nextSpawnAt: string | null
    status: string
    planet: Planet
  } | null
}

const { selectedClanId, canEditSelectedClan, canViewSelectedClanDetails, loadClans } = useClans()
const { t, te, locale } = useI18n()
const route = useRoute()
const planets = ref<Planet[]>([])
const appearances = ref<Appearance[]>([])
const historyRows = ref<HistoryRow[]>([])
const spawnWindows = ref<SpawnWindow[]>([])
const journeyStops = ref<JourneyStop[]>([])
const historyQuery = ref('')
const historyVisibleCount = ref(120)
const dropRuleBlueprints = ref<Record<string, Blueprint[]>>({})
const appearanceForm = ref({ planetId: '', planetName: '', ring: 5, expiresAt: '', notes: '' })
const journeyForm = ref({
  appearanceId: '',
  planetName: '',
  ring: 5,
  arriveAt: '',
  departAt: '',
  status: 'PLANNED' as JourneyStopStatus,
  certainty: 'CONFIRMED' as JourneyStopCertainty,
  notes: '',
})
const editingJourneyStopId = ref('')
const journeyFormOpen = ref(false)
const journeyError = ref('')
const journeyBusy = ref(false)
const journeyReorderBusy = ref(false)
const spawnPlanError = ref('')
const cancelingSpawnWindowId = ref('')
const slotSaveMessage = ref('')
const slotSaveError = ref('')
const draggedJourneyStopId = ref('')
const dragOverJourneyStopId = ref('')
const resolvingSpawnWindowId = ref('')
const selectedAppearanceId = ref('')
const slotRows = ref<SlotRow[]>([])
const loading = ref(false)
const saveSlotsBusy = ref(false)
const timerRefreshQueued = ref(false)
const isMobileLayout = ref(false)
const ringOptions = [1, 2, 3, 4, 5] as const
const enemyOptions = ['SORIS', 'AMARNA', 'GIZA'] as const
const resourcePartTemplatesByRing: Record<number, number[]> = {
  1: [24, 16, 6],
  2: [23, 15, 6],
  3: [22, 15, 6],
  4: [21, 14, 6],
}
const partsRequiredBySlotGroup: Record<string, number | null> = {
  SLOT_18: 18,
  SLOT_14: 14,
  SLOT_12: 12,
  SLOT_5: 5,
  SLOT_2: 2,
  RESOURCE: null,
}
let mobileLayoutQuery: MediaQueryList | null = null

const selectedAppearance = computed(() => appearances.value.find(appearance => appearance.id === selectedAppearanceId.value) ?? null)
const selectedRing = computed(() => selectedAppearance.value?.ring ?? appearanceForm.value.ring)
const selectedTechTier = computed(() => selectedAppearance.value?.techTier ?? techTierForRing(selectedRing.value))
const slotOptions = computed(() => slotGroupsForRing(selectedRing.value))
const resourcePartOptions = computed(() => resourcePartTemplatesByRing[selectedRing.value] ?? [])
const filteredHistoryRows = computed(() => {
  const query = historyQuery.value.trim().toLowerCase()
  if (!query) return historyRows.value
  return historyRows.value.filter(row =>
    [blueprintName(row.blueprint), row.blueprint.canonicalName, row.blueprint.systemName, row.lastPlanet?.name].filter(Boolean).join(' ').toLowerCase().includes(query),
  )
})
const visibleHistoryRows = computed(() => filteredHistoryRows.value.slice(0, historyVisibleCount.value))
const canShowMoreHistory = computed(() => visibleHistoryRows.value.length < filteredHistoryRows.value.length)
const openSpawnWindows = computed(() => spawnWindows.value.filter(row => row.derivedStatus !== 'RESOLVED' && row.derivedStatus !== 'CANCELLED'))
const recentResolvedSpawnWindows = computed(() => spawnWindows.value.filter(row => row.derivedStatus === 'RESOLVED').slice(0, 8))
const resolvingSpawnWindow = computed(() => spawnWindows.value.find(row => row.id === resolvingSpawnWindowId.value) ?? null)
const visibleJourneyStops = computed(() => journeyStops.value.filter(stop => stop.status !== 'CANCELLED'))
const isEditingJourneyStop = computed(() => Boolean(editingJourneyStopId.value))
const currentJourneyStop = computed(() => visibleJourneyStops.value.find(stop => stop.status === 'CURRENT') ?? null)
const nextJourneyStop = computed(() => {
  const currentIndex = visibleJourneyStops.value.findIndex(stop => stop.status === 'CURRENT')
  const candidates = currentIndex >= 0 ? visibleJourneyStops.value.slice(currentIndex + 1) : visibleJourneyStops.value
  return candidates.find(stop => stop.status === 'PLANNED') ?? candidates.find(stop => stop.status !== 'COMPLETED' && stop.status !== 'SKIPPED') ?? null
})
const openJourneyStopCount = computed(() => visibleJourneyStops.value.filter(stop => stop.status === 'CURRENT' || stop.status === 'PLANNED').length)
const tentativeJourneyStopCount = computed(() => visibleJourneyStops.value.filter(stop => stop.certainty === 'TENTATIVE').length)
const dateTime = (value: string | null | undefined) => formatDateTime(value, locale.value)
const enumLabel = (scope: 'slot' | 'enemy' | 'techTier', value: string | null | undefined) => {
  if (!value) return '-'
  const key = `${scope}.${value}`
  return te(key) ? t(key) : value
}
const sourceLabel = (value: string | null | undefined) => {
  if (!value) return '-'
  const key = `sirius.sourceTypes.${value}`
  return te(key) ? t(key) : value
}
const spawnStatusLabel = (value: SpawnWindow['derivedStatus']) => t(`sirius.spawnStatuses.${value}`)
const spawnStatusClass = (value: SpawnWindow['derivedStatus']) => ({
  'status-chip-active': value === 'RESOLVED',
  'status-chip-warning': value === 'WAITING_FOR_SPAWN' || value === 'ACTIVE_SOURCE',
  'status-chip-danger': value === 'OVERDUE',
})
const showSpawnCountdown = (spawnWindow: SpawnWindow) => spawnWindow.derivedStatus !== 'RESOLVED' && spawnWindow.derivedStatus !== 'CANCELLED'
const canCaptureSpawnWindow = (spawnWindow: SpawnWindow) => spawnWindow.derivedStatus !== 'RESOLVED' && spawnWindow.derivedStatus !== 'CANCELLED' && spawnWindow.derivedStatus !== 'ACTIVE_SOURCE'
const canCancelSpawnWindow = (spawnWindow: SpawnWindow) => spawnWindow.derivedStatus !== 'RESOLVED' && spawnWindow.derivedStatus !== 'CANCELLED'
const journeyStopName = (stop: JourneyStop) => stop.planetName ?? stop.planet?.name ?? stop.appearance?.planet.name ?? t('sirius.unknownPlanet')
const journeyStatusLabel = (value: JourneyStopStatus) => t(`sirius.journeyStatuses.${value}`)
const journeyCertaintyLabel = (value: JourneyStopCertainty) => t(`sirius.journeyCertainties.${value}`)
const journeyWarningLabel = (value: string) => (te(`sirius.journeyWarnings.${value}`) ? t(`sirius.journeyWarnings.${value}`) : value)
const journeyStopClass = (stop: JourneyStop) => ({
  'journey-stop-completed': stop.status === 'COMPLETED',
  'journey-stop-current': stop.status === 'CURRENT',
  'journey-stop-planned': stop.status === 'PLANNED',
  'journey-stop-muted': stop.status === 'SKIPPED' || stop.status === 'CANCELLED',
  'journey-stop-warning': stop.warnings.length > 0,
  'journey-stop-tentative': stop.certainty === 'TENTATIVE',
  'journey-stop-dragging': draggedJourneyStopId.value === stop.id,
  'journey-stop-drag-over': dragOverJourneyStopId.value === stop.id && draggedJourneyStopId.value !== stop.id,
})
const journeyTimeLabel = (stop: JourneyStop) => {
  if (stop.arriveAt && stop.departAt) return `${formatSourceDateTime(stop.arriveAt, locale.value)} - ${formatSourceDateTime(stop.departAt, locale.value)}`
  if (stop.arriveAt) return t('sirius.arrivesAt', { date: formatSourceDateTime(stop.arriveAt, locale.value) })
  if (stop.departAt) return t('sirius.departsAt', { date: formatSourceDateTime(stop.departAt, locale.value) })
  return t('sirius.noJourneyTime')
}
const journeySourceLabel = (stop: JourneyStop) => (stop.appearanceId ? t('sirius.linkedJourneyStop') : t('sirius.freeJourneyStop'))
const journeyOpenSummary = computed(() =>
  tentativeJourneyStopCount.value > 0
    ? t('sirius.openJourneySummaryWithTentative', { count: openJourneyStopCount.value, tentative: tentativeJourneyStopCount.value })
    : t('sirius.openJourneySummary', { count: openJourneyStopCount.value }),
)

function techTierForRing(ring: number) {
  if (ring === 1) return 'OOLYTE'
  if (ring === 2) return 'DOLOMYTE'
  if (ring === 3) return 'CLAY'
  if (ring === 4) return 'KENYTE'
  return 'ANCIENT'
}

function slotGroupsForRing(ring: number) {
  return ring === 5 ? ['SLOT_18', 'SLOT_14', 'SLOT_12', 'SLOT_5', 'SLOT_2'] : ['RESOURCE']
}

function dropRuleKey(ring: number, slotGroup: string) {
  return `${ring}:${slotGroup}`
}

function isSiriusBlueprint(name: string | null | undefined) {
  return Boolean(name?.toLowerCase().startsWith('sirius '))
}

const blueprintName = (blueprint: Blueprint | null | undefined) => localizedName(blueprint, locale.value)
const slotPartsLabel = (partsRequired: number | null | undefined) => (partsRequired ? `${partsRequired}er` : '-')
const slotLabel = (slotGroup: string | null | undefined, partsRequired?: number | null) => (slotGroup === 'RESOURCE' && partsRequired ? slotPartsLabel(partsRequired) : enumLabel('slot', slotGroup))
const enemyLabel = (slot: Appearance['slots'][number]) => slot.locationName ?? enumLabel('enemy', slot.enemyType)
const appearanceBlueprintName = (slot: Appearance['slots'][number]) => (slot.blueprint ? blueprintName(slot.blueprint) : (slot.rawBlueprintName ?? '-'))

function relativeAge(value: string | null | undefined) {
  if (!value) return t('sirius.neverDropped')
  const diffMs = Date.now() - new Date(value).getTime()
  if (diffMs < 0) return t('sirius.futureDrop')
  const hours = Math.floor(diffMs / 3_600_000)
  if (hours < 1) return t('sirius.lessThanOneHour')
  if (hours < 48) return t('sirius.hoursAgo', { count: hours })
  return t('sirius.daysAgo', { count: Math.floor(hours / 24) })
}

function defaultRowsForAppearance(appearance: Appearance): SlotRow[] {
  if (appearance.slots.length > 0) {
    return appearance.slots.map(slot => ({
      slotGroup: slot.slotGroup,
      enemyType: slot.enemyType,
      blueprintId: slot.blueprint?.id ?? '',
      partsRequired: slot.blueprint?.partsRequired ?? partsRequiredBySlotGroup[slot.slotGroup] ?? null,
    }))
  }

  if (appearance.ring !== 5) {
    return (resourcePartTemplatesByRing[appearance.ring] ?? [6]).map(partsRequired => ({
      slotGroup: 'RESOURCE',
      enemyType: null,
      blueprintId: '',
      partsRequired,
    }))
  }

  return [
    { slotGroup: 'SLOT_18', enemyType: null, blueprintId: '', partsRequired: 18 },
    { slotGroup: 'SLOT_14', enemyType: null, blueprintId: '', partsRequired: 14 },
    { slotGroup: 'SLOT_12', enemyType: null, blueprintId: '', partsRequired: 12 },
    { slotGroup: 'SLOT_5', enemyType: null, blueprintId: '', partsRequired: 5 },
    ...enemyOptions.flatMap(enemyType => Array.from({ length: 3 }, () => ({ slotGroup: 'SLOT_2', enemyType, blueprintId: '', partsRequired: 2 }))),
  ]
}

const loadPlanets = async () => {
  const response = await api.get<{ planets: Planet[] }>('/sirius/planets')
  planets.value = response.planets
  appearanceForm.value.planetId = appearanceForm.value.planetId || response.planets[0]?.id || '__new'
}

const loadAppearances = async (preferredAppearanceId?: string) => {
  if (!selectedClanId.value) return
  loading.value = true
  try {
    const response = await api.get<{ appearances: Appearance[] }>(`/sirius/clans/${selectedClanId.value}/active`)
    appearances.value = response.appearances
    const preferredId = preferredAppearanceId && response.appearances.find(appearance => appearance.id === preferredAppearanceId)?.id
    selectedAppearanceId.value = preferredId ?? response.appearances.find(appearance => appearance.id === selectedAppearanceId.value)?.id ?? response.appearances[0]?.id ?? ''
  } finally {
    loading.value = false
  }
}

const routeAppearanceId = () => (typeof route.query.appearanceId === 'string' ? route.query.appearanceId : '')
const shouldFocusDropEditor = () => route.query.focus === 'drops'

const scrollDropEditorIntoView = async () => {
  if (!canEditSelectedClan.value) return
  await nextTick()
  document.getElementById('sirius-drop-editor')?.scrollIntoView({ block: 'start', behavior: 'smooth' })
}

const applyRouteDropFocus = async () => {
  if (!shouldFocusDropEditor()) return
  const appearanceId = routeAppearanceId()
  if (appearanceId && !appearances.value.some(appearance => appearance.id === appearanceId)) {
    await loadAppearances(appearanceId)
  } else if (appearanceId) {
    selectedAppearanceId.value = appearanceId
  }
  await scrollDropEditorIntoView()
}

const loadHistory = async () => {
  if (!selectedClanId.value) return
  const response = await api.get<{ history: HistoryRow[] }>(`/sirius/clans/${selectedClanId.value}/history`)
  historyRows.value = response.history
}

const loadSpawnPlan = async () => {
  if (!selectedClanId.value) return
  const response = await api.get<{ spawnWindows: SpawnWindow[] }>(`/sirius/clans/${selectedClanId.value}/spawn-plan`)
  spawnWindows.value = response.spawnWindows
}

const cancelSpawnWindow = async (spawnWindow: SpawnWindow) => {
  if (!window.confirm(t('sirius.ignoreSpawnConfirm', { planet: spawnWindow.sourceAppearance.planet.name }))) return
  cancelingSpawnWindowId.value = spawnWindow.id
  spawnPlanError.value = ''
  try {
    await api.patch(`/sirius/spawn-windows/${spawnWindow.id}/cancel`)
    if (resolvingSpawnWindowId.value === spawnWindow.id) resolvingSpawnWindowId.value = ''
    await loadSpawnPlan()
  } catch (error) {
    spawnPlanError.value = error instanceof Error ? error.message : t('sirius.ignoreSpawnFailed')
  } finally {
    cancelingSpawnWindowId.value = ''
  }
}

const loadJourney = async () => {
  if (!selectedClanId.value || !canViewSelectedClanDetails.value) {
    journeyStops.value = []
    return
  }
  const response = await api.get<{ stops: JourneyStop[] }>(`/sirius/clans/${selectedClanId.value}/journey`)
  journeyStops.value = response.stops
}

const refreshSiriusData = async () => {
  await Promise.all([loadAppearances(), loadHistory(), loadSpawnPlan(), loadJourney()])
}

const scheduleTimerRefresh = () => {
  if (timerRefreshQueued.value) return
  timerRefreshQueued.value = true
  window.setTimeout(() => {
    void refreshSiriusData().finally(() => {
      timerRefreshQueued.value = false
    })
  }, 1000)
}

const loadDropRules = async (ring: number, slotGroup: string) => {
  const key = dropRuleKey(ring, slotGroup)
  if (dropRuleBlueprints.value[key]) return
  const params = new URLSearchParams({ ring: String(ring), slotGroup })
  const response = await api.get<{ blueprints: Blueprint[] }>(`/sirius/drop-rules?${params.toString()}`)
  dropRuleBlueprints.value = { ...dropRuleBlueprints.value, [key]: response.blueprints }
}

const loadDropRulesForSelected = async () => {
  const appearance = selectedAppearance.value
  if (!appearance) return
  await Promise.all(slotGroupsForRing(appearance.ring).map(slotGroup => loadDropRules(appearance.ring, slotGroup)))
}

const blueprintsForRow = (row: SlotRow) => {
  const blueprints = dropRuleBlueprints.value[dropRuleKey(selectedRing.value, row.slotGroup)] ?? []
  if (row.slotGroup === 'RESOURCE' && row.partsRequired) {
    return blueprints.filter(blueprint => blueprint.partsRequired === row.partsRequired)
  }
  return blueprints
}

const resetJourneyForm = () => {
  editingJourneyStopId.value = ''
  journeyError.value = ''
  journeyForm.value = {
    appearanceId: '',
    planetName: '',
    ring: 5,
    arriveAt: '',
    departAt: '',
    status: 'PLANNED',
    certainty: 'CONFIRMED',
    notes: '',
  }
}

const closeJourneyForm = () => {
  resetJourneyForm()
  journeyFormOpen.value = false
}

const openJourneyForm = () => {
  journeyFormOpen.value = true
}

const journeyPayload = () => ({
  appearanceId: journeyForm.value.appearanceId || undefined,
  planetName: journeyForm.value.appearanceId ? undefined : journeyForm.value.planetName.trim() || undefined,
  ring: journeyForm.value.ring,
  arriveAt: dateTimeInputToSourceIso(journeyForm.value.arriveAt),
  departAt: dateTimeInputToSourceIso(journeyForm.value.departAt),
  status: journeyForm.value.status,
  certainty: journeyForm.value.certainty,
  notes: nullableTrimmedText(journeyForm.value.notes),
})

const createAppearance = async () => {
  if (!selectedClanId.value) return
  const response = await api.post<{ appearance: Appearance }>(`/sirius/clans/${selectedClanId.value}/appearances`, {
    planetId: appearanceForm.value.planetId !== '__new' ? appearanceForm.value.planetId : undefined,
    planetName: appearanceForm.value.planetId === '__new' ? appearanceForm.value.planetName : undefined,
    ring: appearanceForm.value.ring,
    expiresAt: new Date(appearanceForm.value.expiresAt).toISOString(),
    resolvesSpawnWindowId: resolvingSpawnWindowId.value || undefined,
    notes: appearanceForm.value.notes || undefined,
  })
  appearanceForm.value.expiresAt = ''
  appearanceForm.value.notes = ''
  appearanceForm.value.planetName = ''
  resolvingSpawnWindowId.value = ''
  await Promise.all([loadPlanets(), loadAppearances(response.appearance.id), loadHistory(), loadSpawnPlan(), loadJourney()])
}

const saveJourneyStop = async () => {
  if (!selectedClanId.value) return
  journeyBusy.value = true
  journeyError.value = ''
  const payload = journeyPayload()
  try {
    if (editingJourneyStopId.value) {
      await api.patch(`/sirius/journey/${editingJourneyStopId.value}`, payload)
    } else {
      await api.post(`/sirius/clans/${selectedClanId.value}/journey`, payload)
    }
    resetJourneyForm()
    journeyFormOpen.value = false
    await loadJourney()
  } catch (error) {
    journeyError.value = error instanceof Error ? error.message : t('sirius.journeySaveFailed')
  } finally {
    journeyBusy.value = false
  }
}

const editJourneyStop = (stop: JourneyStop) => {
  editingJourneyStopId.value = stop.id
  journeyFormOpen.value = true
  journeyForm.value = {
    appearanceId: stop.appearanceId ?? '',
    planetName: stop.appearanceId ? '' : journeyStopName(stop),
    ring: stop.ring,
    arriveAt: sourceDateTimeToInput(stop.arriveAt),
    departAt: sourceDateTimeToInput(stop.departAt),
    status: stop.status,
    certainty: stop.certainty,
    notes: stop.notes ?? '',
  }
  window.setTimeout(() => document.getElementById('sirius-journey-form')?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }), 0)
}

const deleteJourneyStop = async (stop: JourneyStop) => {
  await api.delete(`/sirius/journey/${stop.id}`)
  if (editingJourneyStopId.value === stop.id) resetJourneyForm()
  await loadJourney()
}

const setJourneyStatus = async (stop: JourneyStop, status: JourneyStopStatus) => {
  await api.patch(`/sirius/journey/${stop.id}`, { status })
  await loadJourney()
}

const persistJourneyOrder = async (orderedVisibleStops: JourneyStop[]) => {
  if (!selectedClanId.value) return
  journeyReorderBusy.value = true
  journeyError.value = ''
  const orderedVisibleIds = new Set(orderedVisibleStops.map(stop => stop.id))
  const hiddenStops = journeyStops.value.filter(stop => !orderedVisibleIds.has(stop.id))
  journeyStops.value = [...orderedVisibleStops, ...hiddenStops]
  try {
    const response = await api.put<{ stops: JourneyStop[] }>(`/sirius/clans/${selectedClanId.value}/journey/reorder`, {
      stopIds: [...orderedVisibleStops, ...hiddenStops].map(stop => stop.id),
    })
    journeyStops.value = response.stops
  } catch (error) {
    journeyError.value = error instanceof Error ? error.message : t('sirius.reorderJourneyFailed')
    await loadJourney()
  } finally {
    journeyReorderBusy.value = false
  }
}

const moveJourneyStop = async (stop: JourneyStop, direction: -1 | 1) => {
  const stops = [...visibleJourneyStops.value]
  const index = stops.findIndex(item => item.id === stop.id)
  const targetIndex = index + direction
  if (index < 0 || targetIndex < 0 || targetIndex >= stops.length) return
  const [moved] = stops.splice(index, 1)
  stops.splice(targetIndex, 0, moved)
  await persistJourneyOrder(stops)
}

const handleJourneyDragStart = (event: DragEvent, stop: JourneyStop) => {
  if (!canEditSelectedClan.value || journeyReorderBusy.value) {
    event.preventDefault()
    return
  }
  draggedJourneyStopId.value = stop.id
  dragOverJourneyStopId.value = ''
  event.dataTransfer?.setData('text/plain', stop.id)
  if (event.dataTransfer) {
    event.dataTransfer.effectAllowed = 'move'
  }
}

const handleJourneyDragOver = (event: DragEvent, stop: JourneyStop) => {
  if (!draggedJourneyStopId.value || draggedJourneyStopId.value === stop.id || journeyReorderBusy.value) return
  event.preventDefault()
  dragOverJourneyStopId.value = stop.id
  if (event.dataTransfer) {
    event.dataTransfer.dropEffect = 'move'
  }
}

const handleJourneyDrop = async (event: DragEvent, targetStop: JourneyStop) => {
  event.preventDefault()
  const draggedId = event.dataTransfer?.getData('text/plain') || draggedJourneyStopId.value
  draggedJourneyStopId.value = ''
  dragOverJourneyStopId.value = ''
  if (!draggedId || draggedId === targetStop.id || journeyReorderBusy.value) return
  const stops = [...visibleJourneyStops.value]
  const draggedStop = stops.find(stop => stop.id === draggedId)
  if (!draggedStop) return
  const withoutDragged = stops.filter(stop => stop.id !== draggedId)
  const targetIndex = withoutDragged.findIndex(stop => stop.id === targetStop.id)
  if (targetIndex < 0) return
  const targetElement = event.currentTarget instanceof HTMLElement ? event.currentTarget : null
  const rect = targetElement?.getBoundingClientRect()
  const insertAfter = rect ? event.clientY > rect.top + rect.height / 2 : false
  withoutDragged.splice(targetIndex + (insertAfter ? 1 : 0), 0, draggedStop)
  await persistJourneyOrder(withoutDragged)
}

const handleJourneyDragEnd = () => {
  draggedJourneyStopId.value = ''
  dragOverJourneyStopId.value = ''
}

const closestJourneyActionMenu = (target: EventTarget | null) => (target instanceof Element ? target.closest<HTMLDetailsElement>('.journey-action-menu') : null)

const closeJourneyActionMenus = (except?: HTMLDetailsElement | null) => {
  document.querySelectorAll<HTMLDetailsElement>('.journey-action-menu[open]').forEach(menu => {
    if (menu !== except) menu.open = false
  })
}

const handleJourneyActionPointerDown = (event: PointerEvent) => {
  closeJourneyActionMenus(closestJourneyActionMenu(event.target))
}

const handleJourneyActionKeydown = (event: KeyboardEvent) => {
  if (event.key === 'Escape') closeJourneyActionMenus()
}

const handleJourneyActionMenuToggle = (event: Event) => {
  const menu = event.currentTarget
  if (menu instanceof HTMLDetailsElement && menu.open) closeJourneyActionMenus(menu)
}

const startResolveSpawnWindow = (spawnWindow: SpawnWindow) => {
  resolvingSpawnWindowId.value = spawnWindow.id
  appearanceForm.value.ring = spawnWindow.sourceAppearance.ring
  appearanceForm.value.planetId = '__new'
  appearanceForm.value.planetName = ''
  appearanceForm.value.expiresAt = ''
  window.scrollTo({ top: 0, behavior: 'smooth' })
}

const cancelResolveSpawnWindow = () => {
  resolvingSpawnWindowId.value = ''
}

const removeSlotRow = (index: number) => {
  slotRows.value.splice(index, 1)
}

const onSlotGroupChanged = (row: SlotRow) => {
  row.enemyType = row.slotGroup === 'SLOT_2' ? row.enemyType : null
  row.blueprintId = ''
  row.partsRequired = partsRequiredBySlotGroup[row.slotGroup] ?? null
  void loadDropRules(selectedRing.value, row.slotGroup)
}

const onResourcePartsChanged = (row: SlotRow) => {
  row.slotGroup = 'RESOURCE'
  row.enemyType = null
  row.blueprintId = ''
}

const showMoreHistory = () => {
  historyVisibleCount.value += 120
}

const saveSlots = async () => {
  const appearance = selectedAppearance.value
  if (!appearance) return
  saveSlotsBusy.value = true
  slotSaveMessage.value = ''
  slotSaveError.value = ''
  try {
    const slots = slotRows.value
      .filter(row => row.blueprintId)
      .map(row => ({
        slotGroup: row.slotGroup,
        enemyType: row.slotGroup === 'SLOT_2' ? row.enemyType : null,
        blueprintId: row.blueprintId,
      }))
    await api.put(`/sirius/appearances/${appearance.id}/slots`, { slots })
    await Promise.all([loadAppearances(appearance.id), loadHistory()])
    slotSaveMessage.value = t('sirius.dropsSaved', { count: slots.length })
  } catch (error) {
    slotSaveError.value = error instanceof Error ? error.message : t('sirius.dropsSaveFailed')
  } finally {
    saveSlotsBusy.value = false
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
  document.addEventListener('pointerdown', handleJourneyActionPointerDown)
  document.addEventListener('keydown', handleJourneyActionKeydown)
  await loadClans()
  await Promise.all([loadPlanets(), loadAppearances(routeAppearanceId()), loadHistory(), loadSpawnPlan(), loadJourney()])
  await applyRouteDropFocus()
})

onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', handleJourneyActionPointerDown)
  document.removeEventListener('keydown', handleJourneyActionKeydown)
  mobileLayoutQuery?.removeEventListener('change', updateMobileLayout)
  mobileLayoutQuery = null
})

watch([selectedClanId, canViewSelectedClanDetails], () => {
  void refreshSiriusData()
})

watch(
  () => [route.query.focus, route.query.appearanceId],
  () => {
    void applyRouteDropFocus()
  },
)

watch(historyQuery, () => {
  historyVisibleCount.value = 120
})

watch(
  () => journeyForm.value.appearanceId,
  appearanceId => {
    const appearance = appearances.value.find(item => item.id === appearanceId)
    if (!appearance) return
    journeyForm.value.ring = appearance.ring
    journeyForm.value.planetName = appearance.planet.name
  },
)

watch(
  selectedAppearance,
  async appearance => {
    if (!appearance) {
      slotRows.value = []
      return
    }
    slotRows.value = defaultRowsForAppearance(appearance)
    await loadDropRulesForSelected()
  },
  { immediate: true },
)
</script>

<template>
  <section class="page">
    <div class="page-header">
      <div>
        <h1 class="page-title">{{ t('sirius.title') }}</h1>
        <p class="page-subtitle">{{ t('sirius.subtitle') }}</p>
      </div>
      <div class="page-actions">
        <AppTooltip :text="t('tooltips.sirius')" />
        <button class="secondary-button" :disabled="loading" @click="refreshSiriusData"><RefreshCw :size="16" /> {{ t('app.actions.refresh') }}</button>
      </div>
    </div>

    <div v-if="canEditSelectedClan" class="grid-2">
      <section id="sirius-drop-editor" class="panel drop-editor-panel">
        <h2 class="panel-title">{{ t('sirius.addPlanet') }}</h2>
        <div v-if="resolvingSpawnWindow" class="linked-notice">
          <div>
            <strong>{{ t('sirius.resolvingSpawn') }}</strong>
            <p>
              {{
                t('sirius.resolvingSpawnText', {
                  planet: resolvingSpawnWindow.sourceAppearance.planet.name,
                  date: dateTime(resolvingSpawnWindow.expectedAt),
                })
              }}
            </p>
          </div>
          <button class="secondary-button" type="button" @click="cancelResolveSpawnWindow">{{ t('sirius.cancelResolve') }}</button>
        </div>
        <form class="form-grid" @submit.prevent="createAppearance">
          <div class="filters">
            <label>
              {{ t('sirius.planet') }}
              <select id="sirius-appearance-planet-id" v-model="appearanceForm.planetId" name="siriusAppearancePlanetId">
                <option v-for="planet in planets" :key="planet.id" :value="planet.id">{{ planet.name }}</option>
                <option value="__new">{{ t('sirius.newPlanet') }}</option>
              </select>
            </label>
            <label v-if="appearanceForm.planetId === '__new'">
              {{ t('sirius.planetName') }}
              <input id="sirius-appearance-planet-name" v-model="appearanceForm.planetName" name="siriusAppearancePlanetName" />
            </label>
            <label>
              {{ t('sirius.ring') }}
              <select id="sirius-appearance-ring" v-model.number="appearanceForm.ring" name="siriusAppearanceRing">
                <option v-for="ring in ringOptions" :key="ring" :value="ring">{{ t('sirius.ringLabel', { ring }) }}</option>
              </select>
            </label>
            <label class="expires-field">
              {{ t('sirius.expiresAt') }}
              <input id="sirius-appearance-expires-at" v-model="appearanceForm.expiresAt" name="siriusAppearanceExpiresAt" type="datetime-local" />
            </label>
          </div>
          <p class="muted">{{ t('sirius.techTier') }}: {{ enumLabel('techTier', techTierForRing(appearanceForm.ring)) }}</p>
          <label>
            {{ t('sirius.notes') }}
            <textarea id="sirius-appearance-notes" v-model="appearanceForm.notes" name="siriusAppearanceNotes" />
          </label>
          <button class="primary-button" :disabled="!appearanceForm.expiresAt || (appearanceForm.planetId === '__new' && appearanceForm.planetName.trim().length < 2)">
            <Plus :size="16" /> {{ t('app.actions.save') }}
          </button>
        </form>
      </section>

      <section class="panel">
        <div class="panel-header">
          <div>
            <h2 class="panel-title">{{ t('sirius.editDrops') }}</h2>
            <p class="panel-subtitle">
              {{ selectedAppearance ? `${selectedAppearance.planet.name} · ${t('sirius.ringLabel', { ring: selectedAppearance.ring })}` : '-' }}
            </p>
          </div>
        </div>

        <label class="sirius-run-picker">
          {{ t('sirius.planetRun') }}
          <select id="sirius-selected-appearance-id" v-model="selectedAppearanceId" name="siriusSelectedAppearanceId">
            <option v-for="appearance in appearances" :key="appearance.id" :value="appearance.id">{{ appearance.planet.name }} - {{ dateTime(appearance.expiresAt) }}</option>
          </select>
        </label>

        <div v-if="selectedAppearance" class="slot-editor">
          <CountdownTimer
            class="sirius-editor-timer"
            :observed-at="selectedAppearance.observedAt"
            :expires-at="selectedAppearance.expiresAt"
            :next-spawn-at="selectedAppearance.nextSpawnAt"
            :status="selectedAppearance.status"
            @expired="scheduleTimerRefresh"
          />
          <div v-for="(row, index) in slotRows" :key="index" class="slot-editor-row" :class="{ 'slot-editor-row-with-enemy': row.slotGroup === 'SLOT_2' }">
            <label>
              {{ t('sirius.slot') }}
              <select v-if="selectedRing === 5" :id="`sirius-slot-${index}-group`" :name="`siriusSlot${index}Group`" v-model="row.slotGroup" @change="onSlotGroupChanged(row)">
                <option v-for="option in slotOptions" :key="option" :value="option">{{ enumLabel('slot', option) }}</option>
              </select>
              <select v-else :id="`sirius-slot-${index}-parts`" v-model.number="row.partsRequired" :name="`siriusSlot${index}Parts`" @change="onResourcePartsChanged(row)">
                <option v-for="partsRequired in resourcePartOptions" :key="partsRequired" :value="partsRequired">
                  {{ slotPartsLabel(partsRequired) }}
                </option>
              </select>
            </label>
            <label v-if="row.slotGroup === 'SLOT_2'">
              {{ t('sirius.enemy') }}
              <select :id="`sirius-slot-${index}-enemy`" v-model="row.enemyType" :name="`siriusSlot${index}Enemy`">
                <option :value="null">{{ t('sirius.enemyUnknown') }}</option>
                <option v-for="option in enemyOptions" :key="option" :value="option">{{ enumLabel('enemy', option) }}</option>
              </select>
            </label>
            <label class="slot-editor-bp">
              {{ t('sirius.blueprint') }}
              <BlueprintCombobox
                :id="`sirius-slot-${index}-blueprint-id`"
                v-model="row.blueprintId"
                :name="`siriusSlot${index}BlueprintId`"
                :blueprints="blueprintsForRow(row)"
                :placeholder="t('sirius.blueprintSearch')"
              />
            </label>
            <button class="icon-button" :title="t('app.actions.delete')" :aria-label="t('app.actions.delete')" @click="removeSlotRow(index)">
              <Trash2 :size="16" />
            </button>
          </div>
          <button class="primary-button" :disabled="saveSlotsBusy" @click="saveSlots"><Save :size="16" /> {{ t('sirius.saveDrops') }}</button>
          <p v-if="slotSaveMessage" class="success-text">{{ slotSaveMessage }}</p>
          <p v-if="slotSaveError" class="error-text">{{ slotSaveError }}</p>
        </div>
      </section>
    </div>

    <section v-if="canViewSelectedClanDetails" class="panel journey-roadmap-panel">
      <div class="panel-header">
        <div>
          <h2 class="panel-title"><Route :size="18" /> {{ t('sirius.journeyTitle') }}</h2>
          <p class="panel-subtitle">{{ t('sirius.journeySubtitle') }}</p>
        </div>
        <div class="journey-header-actions">
          <span class="muted">{{ t('sirius.journeyStopCount', { count: visibleJourneyStops.length }) }}</span>
          <button v-if="canEditSelectedClan" class="secondary-button" type="button" @click="journeyFormOpen ? closeJourneyForm() : openJourneyForm()">
            <X v-if="journeyFormOpen" :size="16" />
            <Plus v-else :size="16" />
            {{ journeyFormOpen ? t('sirius.hideJourneyForm') : t('sirius.planJourneyStop') }}
          </button>
        </div>
      </div>

      <div v-if="visibleJourneyStops.length" class="journey-overview" :aria-label="t('sirius.journeyOverview')">
        <article class="journey-overview-item journey-overview-current">
          <span>{{ t('sirius.journeyOverviewCurrent') }}</span>
          <strong>{{ currentJourneyStop ? journeyStopName(currentJourneyStop) : t('sirius.noCurrentJourneyStop') }}</strong>
          <small>{{ currentJourneyStop ? journeyTimeLabel(currentJourneyStop) : t('sirius.noJourneyTime') }}</small>
        </article>
        <article class="journey-overview-item">
          <span>{{ t('sirius.journeyOverviewNext') }}</span>
          <strong>{{ nextJourneyStop ? journeyStopName(nextJourneyStop) : t('sirius.noNextJourneyStop') }}</strong>
          <small>{{ nextJourneyStop ? journeyTimeLabel(nextJourneyStop) : t('sirius.noJourneyTime') }}</small>
        </article>
        <article class="journey-overview-item">
          <span>{{ t('sirius.journeyOverviewOpen') }}</span>
          <strong>{{ openJourneyStopCount }}</strong>
          <small>{{ journeyOpenSummary }}</small>
        </article>
      </div>

      <form v-if="canEditSelectedClan && journeyFormOpen" id="sirius-journey-form" class="journey-form" @submit.prevent="saveJourneyStop">
        <label>
          {{ t('sirius.journeyLinkedRun') }}
          <select id="sirius-journey-appearance-id" v-model="journeyForm.appearanceId" name="siriusJourneyAppearanceId">
            <option value="">{{ t('sirius.freeJourneyStop') }}</option>
            <option v-for="appearance in appearances" :key="appearance.id" :value="appearance.id">{{ appearance.planet.name }} - {{ t('sirius.ringLabel', { ring: appearance.ring }) }}</option>
          </select>
        </label>
        <label v-if="!journeyForm.appearanceId">
          {{ t('sirius.planet') }}
          <input id="sirius-journey-planet-name" v-model="journeyForm.planetName" name="siriusJourneyPlanetName" :placeholder="t('sirius.journeyPlanetPlaceholder')" />
        </label>
        <label>
          {{ t('sirius.ring') }}
          <select id="sirius-journey-ring" v-model.number="journeyForm.ring" name="siriusJourneyRing" :disabled="Boolean(journeyForm.appearanceId)">
            <option v-for="ring in ringOptions" :key="ring" :value="ring">{{ t('sirius.ringLabel', { ring }) }}</option>
          </select>
        </label>
        <label>
          {{ t('sirius.arriveAt') }}
          <input id="sirius-journey-arrive-at" v-model="journeyForm.arriveAt" name="siriusJourneyArriveAt" type="datetime-local" />
        </label>
        <label>
          {{ t('sirius.departAt') }}
          <input id="sirius-journey-depart-at" v-model="journeyForm.departAt" name="siriusJourneyDepartAt" type="datetime-local" />
        </label>
        <label>
          {{ t('sirius.journeyStatus') }}
          <select id="sirius-journey-status" v-model="journeyForm.status" name="siriusJourneyStatus">
            <option value="PLANNED">{{ journeyStatusLabel('PLANNED') }}</option>
            <option value="CURRENT">{{ journeyStatusLabel('CURRENT') }}</option>
            <option value="COMPLETED">{{ journeyStatusLabel('COMPLETED') }}</option>
            <option value="SKIPPED">{{ journeyStatusLabel('SKIPPED') }}</option>
          </select>
        </label>
        <label>
          {{ t('sirius.journeyCertainty') }}
          <select id="sirius-journey-certainty" v-model="journeyForm.certainty" name="siriusJourneyCertainty">
            <option value="CONFIRMED">{{ journeyCertaintyLabel('CONFIRMED') }}</option>
            <option value="TENTATIVE">{{ journeyCertaintyLabel('TENTATIVE') }}</option>
          </select>
        </label>
        <label class="journey-notes-field">
          {{ t('sirius.notes') }}
          <input id="sirius-journey-notes" v-model="journeyForm.notes" name="siriusJourneyNotes" />
        </label>
        <div class="journey-form-actions">
          <button class="primary-button" :disabled="journeyBusy"><Save :size="16" /> {{ isEditingJourneyStop ? t('app.actions.save') : t('sirius.addJourneyStop') }}</button>
          <button class="secondary-button" type="button" @click="closeJourneyForm">
            {{ isEditingJourneyStop ? t('sirius.cancelEdit') : t('app.actions.cancel') }}
          </button>
        </div>
        <p class="journey-form-hint">{{ t('sirius.journeyFreeHint') }}</p>
        <p v-if="journeyError" class="error-text journey-form-message">{{ journeyError }}</p>
      </form>

      <div v-if="visibleJourneyStops.length" class="journey-roadmap" :aria-label="t('sirius.journeyTitle')">
        <article
          v-for="(stop, index) in visibleJourneyStops"
          :key="stop.id"
          class="journey-stop"
          :class="journeyStopClass(stop)"
          @dragover="handleJourneyDragOver($event, stop)"
          @dragenter="handleJourneyDragOver($event, stop)"
          @drop="handleJourneyDrop($event, stop)"
        >
          <div class="journey-stop-rail">
            <div class="journey-stop-marker">{{ index + 1 }}</div>
            <button
              v-if="canEditSelectedClan && visibleJourneyStops.length > 1"
              class="journey-drag-handle"
              type="button"
              draggable="true"
              :title="t('sirius.dragJourneyStop')"
              :aria-label="t('sirius.dragJourneyStop')"
              @dragstart="handleJourneyDragStart($event, stop)"
              @dragend="handleJourneyDragEnd"
            >
              <GripVertical :size="16" />
            </button>
          </div>
          <div class="journey-stop-body">
            <header class="journey-stop-header">
              <div>
                <div class="journey-stop-kicker-row">
                  <span class="journey-stop-kicker">{{ journeyStatusLabel(stop.status) }}</span>
                  <span class="journey-source-chip">{{ journeySourceLabel(stop) }}</span>
                </div>
                <h3>{{ journeyStopName(stop) }} - {{ t('sirius.ringLabel', { ring: stop.ring }) }}</h3>
              </div>
              <div class="journey-stop-tools">
                <div class="journey-stop-chips">
                  <span v-if="stop.certainty === 'TENTATIVE'" class="status-chip status-chip-warning">{{ journeyCertaintyLabel(stop.certainty) }}</span>
                  <span v-if="stop.metrics.missing" class="metric metric-missing" :title="t('sirius.journeyMissingTitle', { count: stop.metrics.missing })">
                    <span>{{ t('dashboard.missing') }}</span>
                    {{ stop.metrics.missing }}
                  </span>
                  <span v-if="stop.metrics.wanted" class="metric metric-wanted" :title="t('sirius.journeyWantedTitle', { count: stop.metrics.wanted })">
                    <span>{{ t('dashboard.wanted') }}</span>
                    {{ stop.metrics.wanted }}
                  </span>
                </div>
                <details v-if="canEditSelectedClan" class="journey-action-menu" @toggle="handleJourneyActionMenuToggle">
                  <summary class="icon-button" :title="t('sirius.stopActions')" :aria-label="t('sirius.stopActions')">
                    <MoreHorizontal :size="16" />
                  </summary>
                  <div class="journey-action-popover" @click="closeJourneyActionMenus()">
                    <button class="menu-action" type="button" :disabled="index === 0 || journeyReorderBusy" @click="moveJourneyStop(stop, -1)"><ArrowUp :size="16" /> {{ t('sirius.moveUp') }}</button>
                    <button class="menu-action" type="button" :disabled="index === visibleJourneyStops.length - 1 || journeyReorderBusy" @click="moveJourneyStop(stop, 1)">
                      <ArrowDown :size="16" /> {{ t('sirius.moveDown') }}
                    </button>
                    <button v-if="stop.status !== 'CURRENT'" class="menu-action" type="button" @click="setJourneyStatus(stop, 'CURRENT')">
                      <PlayCircle :size="16" /> {{ t('sirius.setCurrent') }}
                    </button>
                    <button v-if="stop.status !== 'COMPLETED'" class="menu-action" type="button" @click="setJourneyStatus(stop, 'COMPLETED')">
                      <CheckCircle2 :size="16" /> {{ t('sirius.markCompleted') }}
                    </button>
                    <button class="menu-action" type="button" @click="editJourneyStop(stop)"><Pencil :size="16" /> {{ t('app.actions.edit') }}</button>
                    <button class="menu-action danger-action" type="button" @click="deleteJourneyStop(stop)"><Trash2 :size="16" /> {{ t('app.actions.delete') }}</button>
                  </div>
                </details>
              </div>
            </header>
            <div class="journey-stop-meta">
              <span>{{ journeyTimeLabel(stop) }}</span>
              <span v-if="stop.notes" class="journey-note">{{ stop.notes }}</span>
            </div>
            <div v-if="stop.warnings.length" class="journey-warning-list">
              <span v-for="warning in stop.warnings" :key="warning" class="status-chip status-chip-danger">
                {{ journeyWarningLabel(warning) }}
              </span>
            </div>
          </div>
        </article>
      </div>
      <div v-else class="empty-state">{{ t('sirius.noJourneyStops') }}</div>
    </section>

    <section class="panel">
      <div class="panel-header">
        <div>
          <h2 class="panel-title"><CalendarClock :size="18" /> {{ t('sirius.spawnPlanner') }}</h2>
          <p class="panel-subtitle">{{ t('sirius.spawnPlannerSubtitle') }}</p>
        </div>
        <span class="muted">{{ t('sirius.openSpawnCount', { count: openSpawnWindows.length }) }}</span>
      </div>
      <div v-if="spawnWindows.length && !isMobileLayout" class="table-wrap responsive-desktop-table" tabindex="0">
        <table>
          <thead>
            <tr>
              <th>{{ t('sirius.oldPlanet') }}</th>
              <th>{{ t('sirius.ring') }}</th>
              <th>{{ t('sirius.expiresAt') }}</th>
              <th>{{ t('sirius.expectedSpawn') }}</th>
              <th>{{ t('timer.remainingLabel') }}</th>
              <th>{{ t('sirius.spawnStatus') }}</th>
              <th>{{ t('sirius.resolvedPlanet') }}</th>
              <th v-if="canEditSelectedClan">{{ t('admin.action') }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="spawnWindow in spawnWindows" :key="spawnWindow.id">
              <td>{{ spawnWindow.sourceAppearance.planet.name }}</td>
              <td>{{ t('sirius.ringLabel', { ring: spawnWindow.sourceAppearance.ring }) }}</td>
              <td>{{ dateTime(spawnWindow.sourceAppearance.expiresAt) }}</td>
              <td>{{ dateTime(spawnWindow.expectedAt) }}</td>
              <td>
                <CountdownTimer
                  v-if="showSpawnCountdown(spawnWindow)"
                  compact
                  :show-next="false"
                  :expired-text="t('sirius.spawnOverdue')"
                  :observed-at="spawnWindow.sourceAppearance.expiresAt"
                  :expires-at="spawnWindow.expectedAt"
                  :status="spawnWindow.derivedStatus === 'ACTIVE_SOURCE' ? 'UPCOMING' : 'ACTIVE'"
                  @expired="scheduleTimerRefresh"
                />
                <span v-else class="status-chip" :class="spawnStatusClass(spawnWindow.derivedStatus)">
                  {{ spawnStatusLabel(spawnWindow.derivedStatus) }}
                </span>
              </td>
              <td>
                <span class="status-chip" :class="spawnStatusClass(spawnWindow.derivedStatus)">
                  {{ spawnStatusLabel(spawnWindow.derivedStatus) }}
                </span>
              </td>
              <td>
                <span v-if="spawnWindow.resolvedAppearance">
                  {{ spawnWindow.resolvedAppearance.planet.name }} -
                  {{ t('sirius.ringLabel', { ring: spawnWindow.resolvedAppearance.ring }) }}
                </span>
                <span v-else>-</span>
              </td>
              <td v-if="canEditSelectedClan">
                <div class="inline-actions">
                  <button v-if="canCaptureSpawnWindow(spawnWindow)" class="secondary-button" type="button" @click="startResolveSpawnWindow(spawnWindow)">
                    <Plus :size="16" /> {{ t('sirius.captureSpawn') }}
                  </button>
                  <span v-else-if="spawnWindow.derivedStatus === 'ACTIVE_SOURCE'" class="muted">{{ t('sirius.spawnNotReady') }}</span>
                  <span v-else-if="spawnWindow.derivedStatus === 'RESOLVED'" class="muted">{{ t('sirius.spawnResolved') }}</span>
                  <button v-if="canCancelSpawnWindow(spawnWindow)" class="danger-button" type="button" :disabled="cancelingSpawnWindowId === spawnWindow.id" @click="cancelSpawnWindow(spawnWindow)">
                    <X :size="16" /> {{ t('sirius.ignoreSpawn') }}
                  </button>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <div v-if="spawnWindows.length && isMobileLayout" class="mobile-card-list spawn-mobile-list">
        <article v-for="spawnWindow in spawnWindows" :key="`spawn-mobile-${spawnWindow.id}`" class="mobile-card">
          <header class="mobile-card-header">
            <div>
              <h3 class="mobile-card-title">{{ spawnWindow.sourceAppearance.planet.name }}</h3>
              <p class="mobile-card-subtitle">{{ t('sirius.ringLabel', { ring: spawnWindow.sourceAppearance.ring }) }}</p>
            </div>
            <span class="status-chip" :class="spawnStatusClass(spawnWindow.derivedStatus)">
              {{ spawnStatusLabel(spawnWindow.derivedStatus) }}
            </span>
          </header>
          <div class="mobile-card-meta-grid">
            <div class="mobile-label-row">
              <span>{{ t('sirius.expiresAt') }}</span>
              <strong>{{ dateTime(spawnWindow.sourceAppearance.expiresAt) }}</strong>
            </div>
            <div class="mobile-label-row">
              <span>{{ t('sirius.expectedSpawn') }}</span>
              <strong>{{ dateTime(spawnWindow.expectedAt) }}</strong>
            </div>
          </div>
          <CountdownTimer
            v-if="showSpawnCountdown(spawnWindow)"
            class="mobile-card-timer"
            :show-next="false"
            :expired-text="t('sirius.spawnOverdue')"
            :observed-at="spawnWindow.sourceAppearance.expiresAt"
            :expires-at="spawnWindow.expectedAt"
            :status="spawnWindow.derivedStatus === 'ACTIVE_SOURCE' ? 'UPCOMING' : 'ACTIVE'"
            @expired="scheduleTimerRefresh"
          />
          <div class="mobile-label-row">
            <span>{{ t('sirius.resolvedPlanet') }}</span>
            <strong v-if="spawnWindow.resolvedAppearance">
              {{ spawnWindow.resolvedAppearance.planet.name }} -
              {{ t('sirius.ringLabel', { ring: spawnWindow.resolvedAppearance.ring }) }}
            </strong>
            <strong v-else>-</strong>
          </div>
          <div v-if="canEditSelectedClan" class="mobile-card-actions">
            <button v-if="canCaptureSpawnWindow(spawnWindow)" class="secondary-button" type="button" @click="startResolveSpawnWindow(spawnWindow)">
              <Plus :size="16" /> {{ t('sirius.captureSpawn') }}
            </button>
            <span v-else-if="spawnWindow.derivedStatus === 'ACTIVE_SOURCE'" class="muted">{{ t('sirius.spawnNotReady') }}</span>
            <span v-else-if="spawnWindow.derivedStatus === 'RESOLVED'" class="muted">{{ t('sirius.spawnResolved') }}</span>
            <button v-if="canCancelSpawnWindow(spawnWindow)" class="danger-button" type="button" :disabled="cancelingSpawnWindowId === spawnWindow.id" @click="cancelSpawnWindow(spawnWindow)">
              <X :size="16" /> {{ t('sirius.ignoreSpawn') }}
            </button>
          </div>
        </article>
      </div>
      <div v-else class="empty-state">{{ t('sirius.noSpawnWindows') }}</div>
      <p v-if="spawnPlanError" class="error-text">{{ spawnPlanError }}</p>
      <div v-if="recentResolvedSpawnWindows.length" class="spawn-resolved-summary">
        <span class="muted">{{ t('sirius.recentResolvedSpawns') }}</span>
        <span v-for="spawnWindow in recentResolvedSpawnWindows" :key="spawnWindow.id" class="data-chip">
          {{ spawnWindow.sourceAppearance.planet.name }} -> {{ spawnWindow.resolvedAppearance?.planet.name ?? '-' }}
        </span>
      </div>
    </section>

    <section class="panel">
      <h2 class="panel-title">{{ t('sirius.activeEntries') }}</h2>
      <div v-if="!isMobileLayout" class="table-wrap responsive-desktop-table" tabindex="0">
        <table>
          <thead>
            <tr>
              <th>{{ t('sirius.planet') }}</th>
              <th>{{ t('sirius.ring') }}</th>
              <th>{{ t('dashboard.expires') }}</th>
              <th>{{ t('timer.remainingLabel') }}</th>
              <th>{{ t('sirius.slot') }}</th>
              <th>{{ t('sirius.enemy') }}</th>
              <th>{{ t('dashboard.blueprint') }}</th>
            </tr>
          </thead>
          <tbody>
            <template v-for="appearance in appearances" :key="appearance.id">
              <tr v-for="(slot, slotIndex) in appearance.slots" :key="slot.id">
                <td v-if="slotIndex === 0" :rowspan="appearance.slots.length">{{ appearance.planet.name }}</td>
                <td v-if="slotIndex === 0" :rowspan="appearance.slots.length">{{ t('sirius.ringLabel', { ring: appearance.ring }) }}</td>
                <td v-if="slotIndex === 0" :rowspan="appearance.slots.length">{{ dateTime(appearance.expiresAt) }}</td>
                <td v-if="slotIndex === 0" :rowspan="appearance.slots.length">
                  <CountdownTimer
                    compact
                    :show-next="false"
                    :observed-at="appearance.observedAt"
                    :expires-at="appearance.expiresAt"
                    :next-spawn-at="appearance.nextSpawnAt"
                    :status="appearance.status"
                    @expired="scheduleTimerRefresh"
                  />
                </td>
                <td>{{ slotLabel(slot.slotGroup, slot.blueprint?.partsRequired) }}</td>
                <td>{{ enemyLabel(slot) }}</td>
                <td>
                  <span :class="{ 'sirius-bp-name': isSiriusBlueprint(slot.blueprint?.canonicalName ?? slot.rawBlueprintName) }">
                    {{ appearanceBlueprintName(slot) }}
                  </span>
                </td>
              </tr>
            </template>
          </tbody>
        </table>
      </div>
      <div v-if="isMobileLayout" class="mobile-card-list sirius-active-mobile-list">
        <article v-for="appearance in appearances" :key="`active-mobile-${appearance.id}`" class="mobile-card">
          <header class="mobile-card-header">
            <div>
              <h3 class="mobile-card-title">{{ appearance.planet.name }} - {{ t('sirius.ringLabel', { ring: appearance.ring }) }}</h3>
              <p class="mobile-card-subtitle">{{ dateTime(appearance.expiresAt) }}</p>
            </div>
          </header>
          <CountdownTimer
            class="mobile-card-timer"
            :show-next="false"
            :observed-at="appearance.observedAt"
            :expires-at="appearance.expiresAt"
            :next-spawn-at="appearance.nextSpawnAt"
            :status="appearance.status"
            @expired="scheduleTimerRefresh"
          />
          <div class="mobile-slot-list">
            <div v-for="slot in appearance.slots" :key="slot.id" class="mobile-slot-row">
              <div class="mobile-slot-meta">
                <span class="data-chip">{{ slotLabel(slot.slotGroup, slot.blueprint?.partsRequired) }}</span>
                <span class="data-chip">{{ enemyLabel(slot) }}</span>
              </div>
              <strong :class="{ 'sirius-bp-name': isSiriusBlueprint(slot.blueprint?.canonicalName ?? slot.rawBlueprintName) }">
                {{ appearanceBlueprintName(slot) }}
              </strong>
            </div>
          </div>
        </article>
      </div>
    </section>

    <section class="panel">
      <div class="panel-header">
        <div>
          <h2 class="panel-title">{{ t('sirius.dropHistory') }}</h2>
          <p class="panel-subtitle">{{ t('sirius.dropHistorySubtitle') }}</p>
        </div>
        <label class="compact-filter">
          {{ t('app.actions.search') }}
          <input id="sirius-history-search" v-model="historyQuery" name="siriusHistorySearch" :placeholder="t('sirius.historySearch')" />
        </label>
      </div>
      <div v-if="!isMobileLayout" class="table-wrap responsive-desktop-table" tabindex="0">
        <table>
          <thead>
            <tr>
              <th>{{ t('dashboard.blueprint') }}</th>
              <th>{{ t('blueprints.system') }}</th>
              <th>{{ t('sirius.slot') }}</th>
              <th>{{ t('sirius.lastPlanet') }}</th>
              <th>{{ t('sirius.lastDrop') }}</th>
              <th>{{ t('sirius.age') }}</th>
              <th>{{ t('sirius.drops') }}</th>
              <th>{{ t('sirius.evidence') }}</th>
              <th>{{ t('sirius.lastSeen') }}</th>
              <th>{{ t('sirius.source') }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in visibleHistoryRows" :key="row.blueprint.id">
              <td>
                <span :class="{ 'sirius-bp-name': isSiriusBlueprint(row.blueprint.canonicalName) }">
                  {{ blueprintName(row.blueprint) }}
                </span>
              </td>
              <td>{{ row.blueprint.systemName ?? '-' }}</td>
              <td>
                {{ slotLabel(row.lastSlotGroup ?? row.blueprint.slotGroup, row.lastPartsRequired ?? row.blueprint.partsRequired) }}
              </td>
              <td>
                <span v-if="row.lastPlanet"> {{ row.lastPlanet.name }} - {{ t('sirius.ringLabel', { ring: row.lastPlanet.ring ?? '?' }) }} </span>
                <span v-else>-</span>
              </td>
              <td>{{ dateTime(row.lastDropAt) }}</td>
              <td>
                <span class="status-chip" :class="{ 'status-chip-active': row.active }">
                  {{ row.active ? t('sirius.currentlyActive') : relativeAge(row.lastDropAt) }}
                </span>
              </td>
              <td>{{ row.totalDrops }}</td>
              <td>{{ row.evidenceCount }}</td>
              <td>{{ dateTime(row.lastSeenAt) }}</td>
              <td>
                <span class="status-chip" :title="row.lastSourceRef ?? undefined">
                  {{ sourceLabel(row.lastSourceType) }}
                </span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <div v-if="isMobileLayout" class="mobile-card-list history-mobile-list">
        <article v-for="row in visibleHistoryRows" :key="`history-mobile-${row.blueprint.id}`" class="mobile-card">
          <header class="mobile-card-header">
            <div>
              <h3 class="mobile-card-title" :class="{ 'sirius-bp-name': isSiriusBlueprint(row.blueprint.canonicalName) }">
                {{ blueprintName(row.blueprint) }}
              </h3>
              <p class="mobile-card-subtitle">
                {{ row.blueprint.systemName ?? '-' }} ·
                {{ slotLabel(row.lastSlotGroup ?? row.blueprint.slotGroup, row.lastPartsRequired ?? row.blueprint.partsRequired) }}
              </p>
            </div>
            <span class="status-chip" :class="{ 'status-chip-active': row.active }">
              {{ row.active ? t('sirius.currentlyActive') : relativeAge(row.lastDropAt) }}
            </span>
          </header>
          <div class="mobile-card-meta-grid">
            <div class="mobile-label-row">
              <span>{{ t('sirius.lastPlanet') }}</span>
              <strong v-if="row.lastPlanet"> {{ row.lastPlanet.name }} - {{ t('sirius.ringLabel', { ring: row.lastPlanet.ring ?? '?' }) }} </strong>
              <strong v-else>-</strong>
            </div>
            <div class="mobile-label-row">
              <span>{{ t('sirius.lastDrop') }}</span>
              <strong>{{ dateTime(row.lastDropAt) }}</strong>
            </div>
            <div class="mobile-label-row">
              <span>{{ t('sirius.drops') }}</span>
              <strong>{{ row.totalDrops }}</strong>
            </div>
            <div class="mobile-label-row">
              <span>{{ t('sirius.evidence') }}</span>
              <strong>{{ row.evidenceCount }}</strong>
            </div>
            <div class="mobile-label-row">
              <span>{{ t('sirius.lastSeen') }}</span>
              <strong>{{ dateTime(row.lastSeenAt) }}</strong>
            </div>
            <div class="mobile-label-row">
              <span>{{ t('sirius.source') }}</span>
              <strong>{{ sourceLabel(row.lastSourceType) }}</strong>
            </div>
          </div>
        </article>
      </div>
      <div class="table-footer">
        <span>{{ t('sirius.historyVisible', { visible: visibleHistoryRows.length, total: filteredHistoryRows.length }) }}</span>
        <button v-if="canShowMoreHistory" class="secondary-button" @click="showMoreHistory">
          {{ t('sirius.showMoreHistory') }}
        </button>
      </div>
    </section>
  </section>
</template>
