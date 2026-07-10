import { computed, ref } from 'vue'
import type { ClanDto } from '@bp-tracker/contracts'
import { api } from '../services/api'
import { useAuth } from './useAuth'

const clans = ref<ClanDto[]>([])
const selectedClanId = ref<string | null>(localStorage.getItem('bp-tracker:selected-clan'))

export const useClans = () => {
  const loadClans = async () => {
    const response = await api.get<{ clans: ClanDto[] }>('/clans')
    clans.value = response.clans
    if (!selectedClanId.value && response.clans[0]) {
      selectedClanId.value = response.clans[0].id
      localStorage.setItem('bp-tracker:selected-clan', response.clans[0].id)
    }
  }

  const setSelectedClan = (clanId: string) => {
    selectedClanId.value = clanId
    localStorage.setItem('bp-tracker:selected-clan', clanId)
  }

  const { user } = useAuth()

  const selectedClan = computed(() => clans.value.find(clan => clan.id === selectedClanId.value) ?? null)
  const selectedMembership = computed(() => user.value?.memberships.find(membership => membership.clanId === selectedClanId.value) ?? null)
  const canEditSelectedClan = computed(() => {
    if (user.value?.globalRole === 'ADMIN') return true
    return ['LIEUTENANT', 'COMMANDER', 'ADMIRAL'].includes(selectedMembership.value?.role ?? '') && selectedMembership.value?.status === 'ACTIVE'
  })
  const canManageSelectedClan = computed(() => {
    if (user.value?.globalRole === 'ADMIN') return true
    return ['COMMANDER', 'ADMIRAL'].includes(selectedMembership.value?.role ?? '') && selectedMembership.value?.status === 'ACTIVE'
  })
  const canViewSelectedClanDetails = computed(() => {
    if (user.value?.globalRole === 'ADMIN') return true
    return selectedMembership.value?.status === 'ACTIVE'
  })

  return {
    clans,
    selectedClanId,
    selectedClan,
    selectedMembership,
    canEditSelectedClan,
    canManageSelectedClan,
    canViewSelectedClanDetails,
    loadClans,
    setSelectedClan,
  }
}
