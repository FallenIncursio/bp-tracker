import { Router } from 'express'
import { prisma } from '../utils/prisma.js'
import { asyncHandler, routeParam } from '../utils/http.js'
import { requireUser } from '../auth/auth.middleware.js'

export const notificationsRouter = Router()

const getPreferences = async (userId: string) =>
  prisma.notificationPreference.upsert({
    where: { userId },
    update: {},
    create: { userId },
  })

notificationsRouter.get(
  '/',
  requireUser,
  asyncHandler(async (req, res) => {
    const notifications = await prisma.notification.findMany({
      where: { userId: req.auth!.user.id },
      orderBy: { createdAt: 'desc' },
      take: 100,
    })
    res.json({ notifications })
  })
)

notificationsRouter.get(
  '/preferences',
  requireUser,
  asyncHandler(async (req, res) => {
    const preferences = await getPreferences(req.auth!.user.id)
    res.json({ preferences })
  })
)

notificationsRouter.patch(
  '/:notificationId/read',
  requireUser,
  asyncHandler(async (req, res) => {
    const notificationId = routeParam(req, 'notificationId')
    await prisma.notification.updateMany({
      where: { id: notificationId, userId: req.auth!.user.id },
      data: { readAt: new Date() },
    })
    const notification = await prisma.notification.findFirst({
      where: { id: notificationId, userId: req.auth!.user.id },
    })
    res.json({ notification })
  })
)

notificationsRouter.patch(
  '/preferences',
  requireUser,
  asyncHandler(async (req, res) => {
    const preferences = await prisma.notificationPreference.upsert({
      where: { userId: req.auth!.user.id },
      update: {
        inAppEnabled: typeof req.body.inAppEnabled === 'boolean' ? req.body.inAppEnabled : undefined,
        discordEnabled: typeof req.body.discordEnabled === 'boolean' ? req.body.discordEnabled : undefined,
        missingBpAlerts: typeof req.body.missingBpAlerts === 'boolean' ? req.body.missingBpAlerts : undefined,
        wantedBpAlerts: typeof req.body.wantedBpAlerts === 'boolean' ? req.body.wantedBpAlerts : undefined,
        planetExpiryAlerts: typeof req.body.planetExpiryAlerts === 'boolean' ? req.body.planetExpiryAlerts : undefined,
      },
      create: {
        userId: req.auth!.user.id,
        inAppEnabled: req.body.inAppEnabled ?? true,
        discordEnabled: req.body.discordEnabled ?? false,
        missingBpAlerts: req.body.missingBpAlerts ?? true,
        wantedBpAlerts: req.body.wantedBpAlerts ?? true,
        planetExpiryAlerts: req.body.planetExpiryAlerts ?? true,
      },
    })
    res.json({ preferences })
  })
)
