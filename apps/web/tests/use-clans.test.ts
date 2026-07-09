import { ref } from 'vue'
import { afterEach, describe, expect, it, vi } from 'vitest'

const clanA = { id: 'clan-a', name: 'Alpha', slug: 'alpha' }
const clanB = { id: 'clan-b', name: 'Beta', slug: 'beta' }

const loadUseClans = async (initialUser: unknown = null) => {
  const user = ref(initialUser)
  const api = {
    get: vi.fn(),
  }

  vi.doMock('../src/services/api', () => ({ api }))
  vi.doMock('../src/composables/useAuth', () => ({
    useAuth: () => ({ user }),
  }))

  const { useClans } = await import('../src/composables/useClans')
  return { api, user, useClans }
}

describe('useClans', () => {
  afterEach(() => {
    vi.resetModules()
    vi.restoreAllMocks()
    vi.clearAllMocks()
    localStorage.clear()
  })

  it('loads clans, selects the first clan and persists manual selection', async () => {
    const { api, useClans } = await loadUseClans()
    api.get.mockResolvedValue({ clans: [clanA, clanB] })

    const clans = useClans()
    await clans.loadClans()

    expect(api.get).toHaveBeenCalledWith('/clans')
    expect(clans.clans.value).toEqual([clanA, clanB])
    expect(clans.selectedClanId.value).toBe('clan-a')
    expect(clans.selectedClan.value).toEqual(clanA)
    expect(localStorage.getItem('bp-tracker:selected-clan')).toBe('clan-a')

    clans.setSelectedClan('clan-b')
    expect(clans.selectedClanId.value).toBe('clan-b')
    expect(clans.selectedClan.value).toEqual(clanB)
    expect(localStorage.getItem('bp-tracker:selected-clan')).toBe('clan-b')
  })

  it('keeps a stored selected clan and grants global admins full access', async () => {
    localStorage.setItem('bp-tracker:selected-clan', 'clan-b')
    const { api, useClans } = await loadUseClans({
      id: 'admin',
      globalRole: 'ADMIN',
      memberships: [],
    })
    api.get.mockResolvedValue({ clans: [clanA, clanB] })

    const clans = useClans()
    await clans.loadClans()

    expect(clans.selectedClanId.value).toBe('clan-b')
    expect(clans.canEditSelectedClan.value).toBe(true)
    expect(clans.canManageSelectedClan.value).toBe(true)
    expect(clans.canViewSelectedClanDetails.value).toBe(true)
  })

  it('derives clan permissions from active memberships', async () => {
    const { api, user, useClans } = await loadUseClans({
      id: 'member',
      globalRole: 'USER',
      memberships: [{ clanId: 'clan-a', role: 'COMMANDER', status: 'ACTIVE' }],
    })
    api.get.mockResolvedValue({ clans: [clanA] })

    const clans = useClans()
    await clans.loadClans()

    expect(clans.selectedMembership.value).toEqual({ clanId: 'clan-a', role: 'COMMANDER', status: 'ACTIVE' })
    expect(clans.canEditSelectedClan.value).toBe(true)
    expect(clans.canManageSelectedClan.value).toBe(true)
    expect(clans.canViewSelectedClanDetails.value).toBe(true)

    user.value = {
      id: 'member',
      globalRole: 'USER',
      memberships: [{ clanId: 'clan-a', role: 'MEMBER', status: 'ACTIVE' }],
    }
    expect(clans.canEditSelectedClan.value).toBe(false)
    expect(clans.canManageSelectedClan.value).toBe(false)
    expect(clans.canViewSelectedClanDetails.value).toBe(true)

    user.value = {
      id: 'member',
      globalRole: 'USER',
      memberships: [{ clanId: 'clan-a', role: 'ADMIRAL', status: 'PENDING' }],
    }
    expect(clans.canEditSelectedClan.value).toBe(false)
    expect(clans.canManageSelectedClan.value).toBe(false)
    expect(clans.canViewSelectedClanDetails.value).toBe(false)

    user.value = null
    clans.setSelectedClan('missing')
    expect(clans.selectedClan.value).toBeNull()
    expect(clans.selectedMembership.value).toBeNull()
    expect(clans.canEditSelectedClan.value).toBe(false)
    expect(clans.canManageSelectedClan.value).toBe(false)
    expect(clans.canViewSelectedClanDetails.value).toBe(false)
  })
})
