<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { X } from '@lucide/vue'
import { localizedName } from '../utils/labels'

type BlueprintOption = {
  id: string
  canonicalName: string
  nameDe: string
  nameEn: string | null
  translations?: Array<{ locale: string; name: string }> | null
  systemName: string | null
  partsRequired?: number | null
}

const props = defineProps<{
  id: string
  name: string
  modelValue: string
  blueprints: BlueprintOption[]
  placeholder?: string
}>()

const emit = defineEmits<{
  'update:modelValue': [value: string]
}>()

const { t, locale } = useI18n()
const inputValue = ref('')
const isOpen = ref(false)
const activeIndex = ref(0)
let blurTimer: ReturnType<typeof window.setTimeout> | null = null

const normalize = (value: string) =>
  value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()

const displayName = (blueprint: BlueprintOption) => localizedName(blueprint, locale.value)
const selectedBlueprint = computed(() => props.blueprints.find(blueprint => blueprint.id === props.modelValue) ?? null)
const searchText = (blueprint: BlueprintOption) =>
  normalize(
    [
      displayName(blueprint),
      blueprint.canonicalName,
      blueprint.nameDe,
      blueprint.nameEn,
      ...(blueprint.translations?.map(translation => translation.name) ?? []),
      blueprint.systemName,
      blueprint.partsRequired ? `${blueprint.partsRequired}er` : null,
    ]
      .filter(Boolean)
      .join(' ')
  )

const filteredBlueprints = computed(() => {
  const query = normalize(inputValue.value.trim())
  const source = query ? props.blueprints.filter(blueprint => searchText(blueprint).includes(query)) : props.blueprints
  return source.slice(0, 80)
})

const groupedBlueprints = computed(() => {
  const groups = new Map<string, BlueprintOption[]>()
  for (const blueprint of filteredBlueprints.value) {
    const key = blueprint.systemName ?? t('sirius.noSystem')
    groups.set(key, [...(groups.get(key) ?? []), blueprint])
  }
  return Array.from(groups, ([systemName, blueprints]) => ({ systemName, blueprints }))
})

const activeBlueprintId = computed(() => filteredBlueprints.value[activeIndex.value]?.id ?? null)

watch(
  () => [props.modelValue, props.blueprints, locale.value] as const,
  () => {
    if (isOpen.value && !props.modelValue) return
    inputValue.value = selectedBlueprint.value ? displayName(selectedBlueprint.value) : ''
  },
  { immediate: true }
)

const open = () => {
  if (blurTimer) window.clearTimeout(blurTimer)
  isOpen.value = true
  activeIndex.value = Math.max(
    0,
    filteredBlueprints.value.findIndex(blueprint => blueprint.id === props.modelValue)
  )
}

const close = () => {
  isOpen.value = false
  inputValue.value = selectedBlueprint.value ? displayName(selectedBlueprint.value) : ''
}

const selectBlueprint = (blueprint: BlueprintOption) => {
  emit('update:modelValue', blueprint.id)
  inputValue.value = displayName(blueprint)
  isOpen.value = false
}

const clearSelection = () => {
  emit('update:modelValue', '')
  inputValue.value = ''
  isOpen.value = true
}

const onInput = (event: Event) => {
  inputValue.value = (event.target as HTMLInputElement).value
  if (props.modelValue) emit('update:modelValue', '')
  isOpen.value = true
  activeIndex.value = 0
}

const onBlur = () => {
  blurTimer = window.setTimeout(close, 120)
}

const onKeydown = (event: KeyboardEvent) => {
  if (event.key === 'ArrowDown') {
    event.preventDefault()
    isOpen.value = true
    activeIndex.value = Math.min(activeIndex.value + 1, Math.max(filteredBlueprints.value.length - 1, 0))
  }
  if (event.key === 'ArrowUp') {
    event.preventDefault()
    activeIndex.value = Math.max(activeIndex.value - 1, 0)
  }
  if (event.key === 'Enter' && isOpen.value) {
    event.preventDefault()
    const blueprint = filteredBlueprints.value[activeIndex.value]
    if (blueprint) selectBlueprint(blueprint)
  }
  if (event.key === 'Escape') {
    event.preventDefault()
    close()
  }
}
</script>

<template>
  <div class="blueprint-combobox">
    <input
      :id="id"
      :name="name"
      :value="inputValue"
      :placeholder="placeholder"
      role="combobox"
      autocomplete="off"
      :aria-expanded="isOpen"
      :aria-controls="`${id}-listbox`"
      :aria-activedescendant="activeBlueprintId ? `${id}-option-${activeBlueprintId}` : undefined"
      @focus="open"
      @input="onInput"
      @blur="onBlur"
      @keydown="onKeydown"
    />
    <button
      v-if="modelValue"
      type="button"
      class="combobox-clear"
      :aria-label="t('app.actions.clear')"
      :title="t('app.actions.clear')"
      @mousedown.prevent="clearSelection"
    >
      <X :size="14" />
    </button>
    <div v-if="isOpen" :id="`${id}-listbox`" class="combobox-menu" role="listbox">
      <template v-if="groupedBlueprints.length">
        <div v-for="group in groupedBlueprints" :key="group.systemName" class="combobox-group">
          <div class="combobox-group-label">{{ group.systemName }}</div>
          <button
            v-for="blueprint in group.blueprints"
            :id="`${id}-option-${blueprint.id}`"
            :key="blueprint.id"
            type="button"
            class="combobox-option"
            :class="{ active: activeBlueprintId === blueprint.id }"
            role="option"
            :aria-selected="modelValue === blueprint.id"
            @mousedown.prevent="selectBlueprint(blueprint)"
          >
            <span>{{ displayName(blueprint) }}</span>
            <small>
              <span v-if="blueprint.partsRequired">{{ blueprint.partsRequired }}er</span>
              <span v-if="blueprint.partsRequired && blueprint.systemName"> · </span>
              <span v-if="blueprint.systemName">{{ blueprint.systemName }}</span>
            </small>
          </button>
        </div>
      </template>
      <div v-else class="combobox-empty">{{ t('sirius.noBlueprintMatches') }}</div>
    </div>
  </div>
</template>
