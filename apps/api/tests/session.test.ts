import { beforeEach, describe, expect, it, vi } from 'vitest'
import { env } from '../src/utils/env.js'

const prismaMock = vi.hoisted(() => ({
  session: {
    create: vi.fn(),
  },
}))

vi.mock('../src/utils/prisma.js', () => ({ prisma: prismaMock }))

describe('session helpers', () => {
  beforeEach(() => {
    prismaMock.session.create.mockReset()
  })

  it('hashes tokens with the configured secret', async () => {
    const { hashSessionToken } = await import('../src/auth/session.js')

    const hash = hashSessionToken('token-1')

    expect(hash).toHaveLength(64)
    expect(hash).toBe(hashSessionToken('token-1'))
    expect(hash).not.toBe(hashSessionToken('token-2'))
  })

  it('creates persisted sessions with expiring random tokens', async () => {
    const { createSession, hashSessionToken } = await import('../src/auth/session.js')

    const before = Date.now()
    const session = await createSession('user-1')
    const after = Date.now()

    expect(session.token).toHaveLength(43)
    expect(session.expiresAt.getTime()).toBeGreaterThan(before + 29 * 24 * 60 * 60 * 1000)
    expect(session.expiresAt.getTime()).toBeLessThanOrEqual(after + 30 * 24 * 60 * 60 * 1000)
    expect(prismaMock.session.create).toHaveBeenCalledWith({
      data: {
        userId: 'user-1',
        tokenHash: hashSessionToken(session.token),
        expiresAt: session.expiresAt,
      },
    })
  })

  it('sets and clears secure session cookies consistently', async () => {
    const { clearSessionCookie, setSessionCookie } = await import('../src/auth/session.js')
    const expiresAt = new Date('2026-07-09T20:00:00.000Z')
    const response = {
      cookie: vi.fn(),
      clearCookie: vi.fn(),
    }

    setSessionCookie(response as never, 'token-1', expiresAt)
    clearSessionCookie(response as never)

    const cookieOptions = {
      httpOnly: true,
      secure: false,
      sameSite: 'lax',
      path: '/',
    }
    expect(response.cookie).toHaveBeenCalledWith(env.cookieName, 'token-1', { ...cookieOptions, expires: expiresAt })
    expect(response.clearCookie).toHaveBeenCalledWith(env.cookieName, cookieOptions)
  })
})
