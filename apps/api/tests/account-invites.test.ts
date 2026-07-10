import { beforeEach, describe, expect, it, vi } from 'vitest'
import { env } from '../src/utils/env.js'

const prismaMock = vi.hoisted(() => ({
  $transaction: vi.fn(async (operations) => operations),
  accountInvite: {
    updateMany: vi.fn(),
    create: vi.fn(),
  },
}))

vi.mock('../src/utils/prisma.js', () => ({ prisma: prismaMock }))

describe('account invite helpers', () => {
  beforeEach(() => {
    prismaMock.$transaction.mockClear()
    prismaMock.accountInvite.updateMany.mockReset()
    prismaMock.accountInvite.create.mockReset()
  })

  it('hashes account invite tokens deterministically without storing the token itself', async () => {
    const { hashAccountInviteToken } = await import('../src/auth/account-invites.js')

    const hash = hashAccountInviteToken('invite-token-1')

    expect(hash).toHaveLength(64)
    expect(hash).toBe(hashAccountInviteToken('invite-token-1'))
    expect(hash).not.toBe(hashAccountInviteToken('invite-token-2'))
    expect(hash).not.toContain('invite-token-1')
  })

  it('revokes older open invites and returns a one-time claim URL', async () => {
    const { createAccountInvite, hashAccountInviteToken } = await import('../src/auth/account-invites.js')
    prismaMock.accountInvite.updateMany.mockReturnValue({ count: 1 })
    prismaMock.accountInvite.create.mockImplementation(({ data }) => ({
      id: 'invite-1',
      ...data,
    }))

    const before = Date.now()
    const invite = await createAccountInvite({
      userId: 'user-1',
      clanId: 'clan-1',
      createdById: 'admin-1',
    })
    const after = Date.now()

    expect(invite.id).toBe('invite-1')
    expect(invite.token).toHaveLength(43)
    expect(invite.claimUrl).toBe(`${env.publicBaseUrl.replace(/\/$/, '')}/claim/${invite.token}`)
    expect(invite.expiresAt.getTime()).toBeGreaterThan(before + 6 * 24 * 60 * 60 * 1000)
    expect(invite.expiresAt.getTime()).toBeLessThanOrEqual(after + 7 * 24 * 60 * 60 * 1000)
    expect(prismaMock.accountInvite.updateMany).toHaveBeenCalledWith({
      where: {
        userId: 'user-1',
        type: 'ACCOUNT_CLAIM',
        usedAt: null,
        revokedAt: null,
      },
      data: { revokedAt: expect.any(Date) },
    })
    expect(prismaMock.accountInvite.create).toHaveBeenCalledWith({
      data: {
        userId: 'user-1',
        clanId: 'clan-1',
        createdById: 'admin-1',
        tokenHash: hashAccountInviteToken(invite.token),
        type: 'ACCOUNT_CLAIM',
        expiresAt: invite.expiresAt,
      },
    })
    expect(prismaMock.$transaction).toHaveBeenCalled()
  })

  it('recognizes usable and expired invites', async () => {
    const { isAccountInviteUsable } = await import('../src/auth/account-invites.js')
    const now = new Date('2026-07-10T12:00:00.000Z')

    expect(isAccountInviteUsable({ expiresAt: new Date('2026-07-10T12:01:00.000Z'), usedAt: null, revokedAt: null }, now)).toBe(true)
    expect(isAccountInviteUsable({ expiresAt: new Date('2026-07-10T11:59:00.000Z'), usedAt: null, revokedAt: null }, now)).toBe(false)
    expect(isAccountInviteUsable({ expiresAt: new Date('2026-07-10T12:01:00.000Z'), usedAt: now, revokedAt: null }, now)).toBe(false)
    expect(isAccountInviteUsable({ expiresAt: new Date('2026-07-10T12:01:00.000Z'), usedAt: null, revokedAt: now }, now)).toBe(false)
  })
})
