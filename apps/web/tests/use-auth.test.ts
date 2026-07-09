import { afterEach, describe, expect, it, vi } from 'vitest'

const loadUseAuth = async () => {
  const api = {
    get: vi.fn(),
    post: vi.fn(),
  }

  vi.doMock('../src/services/api', () => ({ api }))
  const { useAuth } = await import('../src/composables/useAuth')
  return { api, useAuth }
}

const memberUser = {
  id: 'user-1',
  username: 'member',
  displayName: 'Member',
  globalRole: 'USER',
  memberships: [],
}

const adminUser = {
  ...memberUser,
  id: 'admin-1',
  username: 'admin',
  displayName: 'Admin',
  globalRole: 'ADMIN',
}

describe('useAuth', () => {
  afterEach(() => {
    vi.resetModules()
    vi.restoreAllMocks()
    vi.clearAllMocks()
  })

  it('loads the current user once and exposes admin state', async () => {
    const { api, useAuth } = await loadUseAuth()
    api.get.mockResolvedValue({ user: adminUser })

    const auth = useAuth()
    await auth.init()
    await auth.init()

    expect(api.get).toHaveBeenCalledTimes(1)
    expect(api.get).toHaveBeenCalledWith('/auth/me')
    expect(auth.user.value).toEqual(adminUser)
    expect(auth.loaded.value).toBe(true)
    expect(auth.isAdmin.value).toBe(true)
  })

  it('treats failed initialization as guest state', async () => {
    const { api, useAuth } = await loadUseAuth()
    api.get.mockRejectedValue(new Error('unauthorized'))

    const auth = useAuth()
    await auth.init()

    expect(auth.user.value).toBeNull()
    expect(auth.loaded.value).toBe(true)
    expect(auth.isAdmin.value).toBe(false)
  })

  it('logs in, logs out and refreshes the session', async () => {
    const { api, useAuth } = await loadUseAuth()
    api.post.mockResolvedValueOnce({ user: memberUser }).mockResolvedValueOnce(undefined)
    api.get.mockResolvedValue({ user: adminUser })

    const auth = useAuth()
    await auth.login('member', 'secret')

    expect(api.post).toHaveBeenCalledWith('/auth/login', { username: 'member', password: 'secret' })
    expect(auth.user.value).toEqual(memberUser)
    expect(auth.loaded.value).toBe(true)
    expect(auth.isAdmin.value).toBe(false)

    await auth.logout()
    expect(api.post).toHaveBeenLastCalledWith('/auth/logout')
    expect(auth.user.value).toBeNull()

    await auth.refresh()
    expect(api.get).toHaveBeenCalledWith('/auth/me')
    expect(auth.user.value).toEqual(adminUser)
  })
})
