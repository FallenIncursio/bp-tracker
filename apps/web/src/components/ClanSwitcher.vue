<script setup lang="ts">
import { onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { Building2 } from '@lucide/vue'
import { useClans } from '../composables/useClans'

const { clans, selectedClanId, loadClans, setSelectedClan } = useClans()
const { t } = useI18n()

onMounted(loadClans)
</script>

<template>
  <label class="select-wrap" :title="t('auth.clan')">
    <Building2 :size="16" />
    <select id="selected-clan" name="selected-clan" :value="selectedClanId ?? ''" :aria-label="t('auth.clan')" @change="setSelectedClan(($event.target as HTMLSelectElement).value)">
      <option v-for="clan in clans" :key="clan.id" :value="clan.id">
        {{ clan.name }}
      </option>
    </select>
  </label>
</template>
