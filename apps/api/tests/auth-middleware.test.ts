import { beforeEach, describe, expect, it, vi } from 'vitest'
import { env } from '../src/utils/env.js'
import { HttpError } from '../src/utils/http.js'

const prismaMock = vi.hoisted(() => ({
  session: {
    findUnique: vi.fn(),
  },
}))

vi.mock('../src/utils/prisma.js', () => ({ prisma: prismaMock }))

const activeUser = {
  id: 'user-1',
  globalRole: 'USER',
  isActive: true,
  memberships: [{ clanId: 'clan-1', role: 'COMMANDER', status: 'ACTIVE' }],
}

const makeReq = (overrides: Record<string, unknown> = {}) =>
  ({
    params: { clanId: 'clan-1' },
    cookies: {},
    header: vi.fn(),
    ...overrides,
  }) as never

describe('auth middleware', () => {
  beforeEach(() => {
    prismaMock.session.findUnique.mockReset()
  })

  it('attaches valid cookie sessions', async () => {
    const { attachAuth } = await import('../src/auth/auth.middleware.js')
    const { hashSessionToken } = await import('../src/auth/session.js')
    const req = makeReq({ cookies: { [env.cookieName]: 'cookie-token' } }) as { auth?: unknown }
    const next = vi.fn()
    prismaMock.session.findUnique.mockResolvedValue({
      revokedAt: null,
      expiresAt: new Date(Date.now() + 1000),
      user: activeUser,
    })

    await attachAuth(req as never, {} as never, next)

    expect(prismaMock.session.findUnique).toHaveBeenCalledWith({
      where: { tokenHash: hashSessionToken('cookie-token') },
      include: { user: { include: { memberships: true } } },
    })
    expect(req.auth).toEqual({ user: activeUser, sessionToken: 'cookie-token' })
    expect(next).toHaveBeenCalledWith()
  })

  it('supports bearer tokens and ignores invalid sessions', async () => {
    const { attachAuth } = await import('../src/auth/auth.middleware.js')
    const req = makeReq({ header: vi.fn(() => 'Bearer api-token') }) as { auth?: unknown }
    const next = vi.fn()
    prismaMock.session.findUnique.mockResolvedValue({ revokedAt: new Date(), expiresAt: new Date(Date.now() + 1000), user: activeUser })

    await attachAuth(req as never, {} as never, next)

    expect(req.auth).toBeUndefined()
    expect(next).toHaveBeenCalledWith()
  })

  it('does nothing when no token is present', async () => {
    const { attachAuth } = await import('../src/auth/auth.middleware.js')
    const next = vi.fn()

    await attachAuth(makeReq() as never, {} as never, next)

    expect(prismaMock.session.findUnique).not.toHaveBeenCalled()
    expect(next).toHaveBeenCalledWith()
  })

  it('enforces user and admin requirements', async () => {
    const { requireAdmin, requireUser } = await import('../src/auth/auth.middleware.js')
    const next = vi.fn()

    requireUser(makeReq() as never, {} as never, next)
    expect(next.mock.calls[0][0]).toMatchObject({ status: 401, message: 'Login required.' } satisfies Partial<HttpError>)

    requireUser(makeReq({ auth: { user: activeUser } }) as never, {} as never, next)
    expect(next).toHaveBeenLastCalledWith()

    requireAdmin(makeReq({ auth: { user: activeUser } }) as never, {} as never, next)
    expect(next.mock.calls[2][0]).toMatchObject({ status: 403, message: 'Admin role required.' } satisfies Partial<HttpError>)

    requireAdmin(makeReq({ auth: { user: { ...activeUser, globalRole: 'ADMIN' } } }) as never, {} as never, next)
    expect(next).toHaveBeenLastCalledWith()
  })

  it('checks active clan role hierarchy and admin override', async () => {
    const { getActiveClanRole, hasClanRole, requireClanRole } = await import('../src/auth/auth.middleware.js')
    const req = makeReq({ auth: { user: activeUser } })

    expect(getActiveClanRole(req, 'clan-1')).toBe('COMMANDER')
    expect(hasClanRole(req, 'clan-1', 'MEMBER')).toBe(true)
    expect(hasClanRole(req, 'clan-1', 'ADMIRAL')).toBe(false)
    const adminReq = makeReq({ auth: { user: { ...activeUser, globalRole: 'ADMIN' } } })
    expect(getActiveClanRole(adminReq, 'clan-2')).toBe('ADMIN')
    expect(hasClanRole(adminReq, 'clan-2', 'ADMIRAL')).toBe(true)
    expect(getActiveClanRole(makeReq(), 'clan-1')).toBeNull()
    expect(hasClanRole(makeReq(), 'clan-1', 'MEMBER')).toBe(false)

    const next = vi.fn()
    requireClanRole('COMMANDER')(req, {} as never, next)
    expect(next).toHaveBeenCalledWith()

    requireClanRole('ADMIRAL')(req, {} as never, next)
    expect(next.mock.calls[1][0]).toMatchObject({ status: 403, message: 'ADMIRAL role required for this clan.' })
  })

  it('requires login before checking clan roles', async () => {
    const { requireClanRole } = await import('../src/auth/auth.middleware.js')
    const next = vi.fn()

    requireClanRole('MEMBER')(makeReq(), {} as never, next)

    expect(next.mock.calls[0][0]).toMatchObject({ status: 401, message: 'Login required.' })
  })
})
