import { Router } from 'express'
import bcrypt from 'bcryptjs'
import { z } from 'zod'
import { updateMyProfileSchema } from '@bp-tracker/contracts'
import { prisma } from '../utils/prisma.js'
import { asyncHandler, routeParam } from '../utils/http.js'
import { requireAdmin, requireUser } from '../auth/auth.middleware.js'

export const usersRouter = Router()

const updateUserSchema = z.object({
  displayName: z.string().min(2).max(120).optional(),
  email: z.string().email().nullable().optional(),
  isActive: z.boolean().optional(),
  globalRole: z.enum(['USER', 'ADMIN']).optional(),
  discordUserId: z.string().max(120).nullable().optional(),
  newPassword: z.string().min(8).max(200).optional(),
})

const serializeUser = (user: {
  id: string
  username: string
  displayName: string
  email: string | null
  globalRole: 'USER' | 'ADMIN'
  isActive: boolean
  discordUserId: string | null
  discordUsername: string | null
  discordGlobalName: string | null
}) => ({
  id: user.id,
  username: user.username,
  displayName: user.displayName,
  email: user.email,
  globalRole: user.globalRole,
  isActive: user.isActive,
  discordUserId: user.discordUserId,
  discordUsername: user.discordUsername,
  discordGlobalName: user.discordGlobalName,
})

usersRouter.patch(
  '/me',
  requireUser,
  asyncHandler(async (req, res) => {
    const input = updateMyProfileSchema.parse(req.body)
    const user = await prisma.user.update({
      where: { id: req.auth!.user.id },
      data: { displayName: input.displayName.trim() },
    })

    await prisma.auditLog.create({
      data: {
        actorUserId: user.id,
        action: 'user.update_profile',
        entityType: 'User',
        entityId: user.id,
        afterJson: { displayName: user.displayName },
      },
    })

    res.json({ profile: { displayName: user.displayName } })
  })
)

usersRouter.get(
  '/',
  requireAdmin,
  asyncHandler(async (_req, res) => {
    const users = await prisma.user.findMany({
      include: {
        memberships: { include: { clan: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 500,
    })

    res.json({
      users: users.map(user => ({
        id: user.id,
        username: user.username,
        displayName: user.displayName,
        email: user.email,
        globalRole: user.globalRole,
        isActive: user.isActive,
        discordUserId: user.discordUserId,
        discordUsername: user.discordUsername,
        discordGlobalName: user.discordGlobalName,
        memberships: user.memberships.map(membership => ({
          clanId: membership.clanId,
          clanName: membership.clan.name,
          role: membership.role,
          status: membership.status,
        })),
      })),
    })
  })
)

usersRouter.patch(
  '/:userId',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const input = updateUserSchema.parse(req.body)
    const userId = routeParam(req, 'userId')
    const { newPassword, ...userInput } = input
    const passwordHash = newPassword ? await bcrypt.hash(newPassword, 12) : undefined

    const user = await prisma.user.update({
      where: { id: userId },
      data: {
        ...userInput,
        ...(passwordHash ? { passwordHash } : {}),
      },
    })

    if (passwordHash) {
      await prisma.session.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: new Date() },
      })

      await prisma.auditLog.create({
        data: {
          actorUserId: req.auth!.user.id,
          action: 'user.reset_password',
          entityType: 'User',
          entityId: userId,
        },
      })
    }

    res.json({ user: serializeUser(user) })
  })
)
