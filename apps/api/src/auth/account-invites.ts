import crypto from 'node:crypto'
import { prisma } from '../utils/prisma.js'
import { env } from '../utils/env.js'

const accountInviteTtlMs = 7 * 24 * 60 * 60 * 1000

export const hashAccountInviteToken = (token: string) => crypto.createHmac('sha256', env.sessionSecret).update(`account-invite:${token}`).digest('hex')

export const buildAccountInviteUrl = (token: string) => `${env.publicBaseUrl.replace(/\/$/, '')}/claim/${token}`

export const isAccountInviteUsable = (invite: { expiresAt: Date; usedAt: Date | null; revokedAt: Date | null }, now = new Date()) =>
  !invite.usedAt && !invite.revokedAt && invite.expiresAt > now

export const createAccountInvite = async ({ userId, clanId, createdById }: { userId: string; clanId: string; createdById: string }) => {
  const token = crypto.randomBytes(32).toString('base64url')
  const tokenHash = hashAccountInviteToken(token)
  const expiresAt = new Date(Date.now() + accountInviteTtlMs)
  const revokedAt = new Date()

  const [, invite] = await prisma.$transaction([
    prisma.accountInvite.updateMany({
      where: {
        userId,
        type: 'ACCOUNT_CLAIM',
        usedAt: null,
        revokedAt: null,
      },
      data: { revokedAt },
    }),
    prisma.accountInvite.create({
      data: {
        userId,
        clanId,
        createdById,
        tokenHash,
        type: 'ACCOUNT_CLAIM',
        expiresAt,
      },
    }),
  ])

  return {
    id: invite.id,
    token,
    claimUrl: buildAccountInviteUrl(token),
    expiresAt,
  }
}
