import type { NotificationType, Prisma } from '../generated/prisma/client.js'
import { prisma } from '../utils/prisma.js'
import { sendDiscordChannelMessage } from './discord.js'

type CreateNotificationInput = {
  userId: string
  clanId?: string
  type: NotificationType
  title: string
  body: string
  payloadJson?: unknown
}

const shouldSendDiscordForType = (
  type: NotificationType,
  preferences: {
    discordEnabled: boolean
    missingBpAlerts: boolean
    wantedBpAlerts: boolean
    planetExpiryAlerts: boolean
  }
) => {
  if (!preferences.discordEnabled) return false
  if (type === 'BLUEPRINT_MISSING_ACTIVE') return preferences.missingBpAlerts
  if (type === 'BLUEPRINT_WANTED_ACTIVE') return preferences.wantedBpAlerts
  if (type === 'PLANET_EXPIRING') return preferences.planetExpiryAlerts
  return true
}

export const createNotification = async (input: CreateNotificationInput) => {
  const user = await prisma.user.findUnique({
    where: { id: input.userId },
    include: { notificationPrefs: true },
  })

  if (!user) {
    return null
  }

  const preferences =
    user.notificationPrefs ??
    (await prisma.notificationPreference.create({
      data: { userId: user.id },
    }))

  const notification = await prisma.notification.create({
    data: {
      userId: user.id,
      type: input.type,
      title: input.title,
      body: input.body,
      payloadJson: input.payloadJson === undefined ? undefined : (input.payloadJson as Prisma.InputJsonValue),
      readAt: preferences.inAppEnabled ? undefined : new Date(),
    },
  })

  if (!input.clanId || !shouldSendDiscordForType(input.type, preferences)) {
    return notification
  }

  const settings = await prisma.clanDiscordSettings.findUnique({ where: { clanId: input.clanId } })
  if (!settings?.enabled) {
    return notification
  }

  const mention = user.discordUserId ? `<@${user.discordUserId}> ` : ''
  const result = await sendDiscordChannelMessage(settings.notificationChannelId, {
    content: `${mention}**${input.title}**\n${input.body}`,
    allowed_mentions: user.discordUserId ? { users: [user.discordUserId], parse: [] } : { parse: [] },
  })

  await prisma.notificationDelivery.create({
    data: {
      notificationId: notification.id,
      channel: 'DISCORD',
      status: result.ok ? 'SENT' : result.skipped ? 'SKIPPED' : 'FAILED',
      target: settings.notificationChannelId,
      error: result.ok ? null : result.error,
      sentAt: result.ok ? new Date() : null,
    },
  })

  return notification
}
