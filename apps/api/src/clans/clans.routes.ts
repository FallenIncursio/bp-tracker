import { Router } from 'express'
import { z } from 'zod'
import {
  approveMembershipSchema,
  createClanSchema,
  discordStatusLocales,
  publishClanDiscordStatusSchema,
  updateClanDiscordSettingsSchema,
  updateMembershipRoleSchema,
  updateMembershipTrackingSchema,
  type ClanDiscordSettingsDto,
  type DiscordGuildChannelDto,
} from '@bp-tracker/contracts'
import { prisma } from '../utils/prisma.js'
import { asyncHandler, HttpError, routeParam } from '../utils/http.js'
import { canSetClanRole, getActiveClanRole, hasClanRole, requireAdmin, requireClanRole, requireUser } from '../auth/auth.middleware.js'
import { env } from '../utils/env.js'
import {
  formatDiscordChannelName,
  getDiscordChannel,
  listDiscordGuildChannels,
  sendDiscordChannelMessage,
  type DiscordGuildChannel,
} from '../notifications/discord.js'
import { createNotification } from '../notifications/notification.service.js'
import { publishClanDiscordStatus } from '../notifications/discord-status.service.js'
import { logAudit } from '../utils/audit.js'
import { serializeClanMember } from './clan-member.dto.js'

export const clansRouter = Router()

const normalizeDiscordStatusLocale = (value: string | null | undefined): ClanDiscordSettingsDto['statusLocale'] =>
  discordStatusLocales.includes(value as ClanDiscordSettingsDto['statusLocale']) ? (value as ClanDiscordSettingsDto['statusLocale']) : 'de'

const serializeDiscordSettings = (
  clanId: string,
  settings?: {
    guildId: string | null
    notificationChannelId: string | null
    notificationChannelName: string | null
    enabled: boolean
    statusEnabled: boolean
    statusChannelId: string | null
    statusChannelName: string | null
    statusRoadmapMessageId: string | null
    statusPlanetsMessageId: string | null
    statusPinMessages: boolean
    statusLocale: string | null
    statusLastPublishedAt: Date | string | null
    statusLastError: string | null
  } | null,
): ClanDiscordSettingsDto => ({
  clanId,
  guildId: settings?.guildId ?? null,
  notificationChannelId: settings?.notificationChannelId ?? null,
  notificationChannelName: settings?.notificationChannelName ?? null,
  enabled: settings?.enabled ?? false,
  statusEnabled: settings?.statusEnabled ?? false,
  statusChannelId: settings?.statusChannelId ?? null,
  statusChannelName: settings?.statusChannelName ?? null,
  statusRoadmapMessageId: settings?.statusRoadmapMessageId ?? null,
  statusPlanetsMessageId: settings?.statusPlanetsMessageId ?? null,
  statusPinMessages: settings?.statusPinMessages ?? true,
  statusLocale: normalizeDiscordStatusLocale(settings?.statusLocale),
  statusLastPublishedAt: settings?.statusLastPublishedAt ? new Date(settings.statusLastPublishedAt).toISOString() : null,
  statusLastError: settings?.statusLastError ?? null,
})

const serializeDiscordChannel = (channel: DiscordGuildChannel): DiscordGuildChannelDto => ({
  id: channel.id,
  name: channel.name,
  displayName: formatDiscordChannelName(channel),
  type: channel.type,
  guildId: channel.guildId,
  parentId: channel.parentId,
})

const ensureAllowedDiscordGuild = (guildId: string | null | undefined) => {
  if (guildId && env.discordAllowedGuildIds.length > 0 && !env.discordAllowedGuildIds.includes(guildId)) {
    throw new HttpError(403, 'Discord guild is not allowed for this instance.')
  }
}

const discordChannelsQuerySchema = z.object({
  guildId: z
    .string()
    .trim()
    .regex(/^\d{17,20}$/)
    .optional()
    .or(z.literal('')),
})

const resolveDiscordChannel = async (input: { guildId: string | null; channelId: string | null; channelName: string | null }) => {
  if (!input.channelId || !env.discordBotToken) {
    ensureAllowedDiscordGuild(input.guildId)
    return {
      guildId: input.guildId,
      channelId: input.channelId,
      channelName: input.channelName,
    }
  }

  const result = await getDiscordChannel(input.channelId)
  if (!result.ok) {
    throw new HttpError(result.skipped ? 503 : 502, result.error)
  }

  const channel = result.data
  if (input.guildId && channel.guildId !== input.guildId) {
    throw new HttpError(400, 'Discord channel does not belong to the configured server.')
  }

  ensureAllowedDiscordGuild(channel.guildId)
  return {
    guildId: channel.guildId,
    channelId: channel.id,
    channelName: formatDiscordChannelName(channel),
  }
}

clansRouter.get(
  '/',
  asyncHandler(async (_req, res) => {
    const clans = await prisma.clan.findMany({
      where: { isPublic: true },
      orderBy: { name: 'asc' },
      include: {
        memberships: {
          where: { status: 'ACTIVE' },
          select: { id: true },
        },
      },
    })

    res.json({
      clans: clans.map(clan => ({
        id: clan.id,
        name: clan.name,
        slug: clan.slug,
        isPublic: clan.isPublic,
        memberCount: clan.memberships.length,
      })),
    })
  }),
)

clansRouter.post(
  '/',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const input = createClanSchema.parse(req.body)
    const clan = await prisma.clan.create({
      data: {
        name: input.name.trim(),
        slug: input.slug,
        isPublic: input.isPublic,
      },
    })

    await prisma.auditLog.create({
      data: {
        actorUserId: req.auth!.user.id,
        action: 'clan.create',
        entityType: 'Clan',
        entityId: clan.id,
        afterJson: clan,
      },
    })

    res.status(201).json({ clan })
  }),
)

clansRouter.get(
  '/:clanId/discord-settings',
  requireClanRole('ADMIRAL'),
  asyncHandler(async (req, res) => {
    const clanId = routeParam(req, 'clanId')
    const settings = await prisma.clanDiscordSettings.findUnique({
      where: { clanId },
    })
    res.json({ settings: serializeDiscordSettings(clanId, settings) })
  }),
)

clansRouter.patch(
  '/:clanId/discord-settings',
  requireClanRole('ADMIRAL'),
  asyncHandler(async (req, res) => {
    const clanId = routeParam(req, 'clanId')
    const input = updateClanDiscordSettingsSchema.parse(req.body)
    const guildId = input.guildId?.trim() || null
    const notificationChannelId = input.notificationChannelId?.trim() || null
    const notificationChannelName = input.notificationChannelName?.trim() || null
    const statusChannelId = input.statusChannelId?.trim() || null
    const statusChannelName = input.statusChannelName?.trim() || null

    if (input.enabled && !notificationChannelId) {
      throw new HttpError(400, 'A Discord notification channel is required when Discord notifications are enabled.')
    }
    if (input.statusEnabled && !statusChannelId) {
      throw new HttpError(400, 'A Discord status channel is required when Discord status publishing is enabled.')
    }
    const resolvedNotification = await resolveDiscordChannel({
      guildId,
      channelId: notificationChannelId,
      channelName: notificationChannelName,
    })
    const resolvedStatus = await resolveDiscordChannel({
      guildId: resolvedNotification.guildId,
      channelId: statusChannelId,
      channelName: statusChannelName,
    })
    const resolvedGuildId = resolvedStatus.guildId ?? resolvedNotification.guildId ?? guildId

    const settings = await prisma.clanDiscordSettings.upsert({
      where: { clanId },
      update: {
        guildId: resolvedGuildId,
        notificationChannelId: resolvedNotification.channelId,
        notificationChannelName: resolvedNotification.channelName,
        enabled: input.enabled,
        statusEnabled: input.statusEnabled,
        statusChannelId: resolvedStatus.channelId,
        statusChannelName: resolvedStatus.channelName,
        statusPinMessages: input.statusPinMessages,
        statusLocale: input.statusLocale,
        statusLastError: input.statusEnabled ? undefined : null,
        updatedById: req.auth!.user.id,
      },
      create: {
        clanId,
        guildId: resolvedGuildId,
        notificationChannelId: resolvedNotification.channelId,
        notificationChannelName: resolvedNotification.channelName,
        enabled: input.enabled,
        statusEnabled: input.statusEnabled,
        statusChannelId: resolvedStatus.channelId,
        statusChannelName: resolvedStatus.channelName,
        statusPinMessages: input.statusPinMessages,
        statusLocale: input.statusLocale,
        updatedById: req.auth!.user.id,
      },
    })

    await prisma.auditLog.create({
      data: {
        actorUserId: req.auth!.user.id,
        action: 'clan.discord_settings.update',
        entityType: 'Clan',
        entityId: clanId,
        afterJson: serializeDiscordSettings(clanId, settings),
      },
    })

    res.json({ settings: serializeDiscordSettings(clanId, settings) })
  }),
)

clansRouter.get(
  '/:clanId/discord-channels',
  requireClanRole('ADMIRAL'),
  asyncHandler(async (req, res) => {
    const clanId = routeParam(req, 'clanId')
    const input = discordChannelsQuerySchema.parse(req.query)
    const settings = await prisma.clanDiscordSettings.findUnique({
      where: { clanId },
    })
    const guildId = input.guildId?.trim() || settings?.guildId

    if (!guildId) {
      res.json({
        available: false,
        channels: [],
        error: 'Discord server ID is required to list channels.',
      })
      return
    }

    ensureAllowedDiscordGuild(guildId)
    const result = await listDiscordGuildChannels(guildId)
    if (!result.ok) {
      if (result.skipped) {
        res.json({ available: false, channels: [], error: result.error })
        return
      }
      throw new HttpError(502, result.error)
    }

    res.json({
      available: true,
      channels: result.data.map(serializeDiscordChannel),
    })
  }),
)

clansRouter.post(
  '/:clanId/discord-settings/test',
  requireClanRole('ADMIRAL'),
  asyncHandler(async (req, res) => {
    const clanId = routeParam(req, 'clanId')
    const clan = await prisma.clan.findUnique({ where: { id: clanId } })
    if (!clan) {
      throw new HttpError(404, 'Clan not found.')
    }

    const settings = await prisma.clanDiscordSettings.findUnique({
      where: { clanId },
    })
    if (!settings?.enabled || !settings.notificationChannelId) {
      throw new HttpError(400, 'Discord notifications are not enabled for this clan.')
    }

    ensureAllowedDiscordGuild(settings.guildId)
    const result = await sendDiscordChannelMessage(settings.notificationChannelId, {
      content: `**BP Tracker Test**\nDiscord notifications for ${clan.name} are configured.`,
      allowed_mentions: { parse: [] },
    })
    if (!result.ok) {
      throw new HttpError(result.skipped ? 503 : 502, result.error)
    }

    await prisma.auditLog.create({
      data: {
        actorUserId: req.auth!.user.id,
        action: 'clan.discord_settings.test',
        entityType: 'Clan',
        entityId: clanId,
      },
    })

    res.json({ ok: true })
  }),
)

clansRouter.post(
  '/:clanId/discord-settings/status/publish',
  requireClanRole('ADMIRAL'),
  asyncHandler(async (req, res) => {
    const clanId = routeParam(req, 'clanId')
    const input = publishClanDiscordStatusSchema.parse(req.body ?? {})
    const settings = await prisma.clanDiscordSettings.findUnique({
      where: { clanId },
    })
    if (!settings?.statusEnabled || !settings.statusChannelId) {
      throw new HttpError(400, 'Discord status publishing is not enabled for this clan.')
    }

    ensureAllowedDiscordGuild(settings.guildId)
    const result = await publishClanDiscordStatus(clanId, {
      recreateMessages: input.recreateMessages,
    })

    await prisma.auditLog.create({
      data: {
        actorUserId: req.auth!.user.id,
        clanId,
        action: input.recreateMessages ? 'clan.discord_status.recreate' : 'clan.discord_status.publish',
        entityType: 'Clan',
        entityId: clanId,
        summary: 'Discord status overview published.',
        afterJson: result,
      },
    })

    const nextSettings = await prisma.clanDiscordSettings.findUnique({
      where: { clanId },
    })
    res.json({
      result,
      settings: serializeDiscordSettings(clanId, nextSettings),
    })
  }),
)

clansRouter.get(
  '/:clanId/members',
  requireClanRole('MEMBER'),
  asyncHandler(async (req, res) => {
    const clanId = routeParam(req, 'clanId')
    const clan = await prisma.clan.findUnique({ where: { id: clanId } })
    if (!clan || !clan.isPublic) {
      throw new HttpError(404, 'Clan not found.')
    }

    const canManage = req.auth?.user.globalRole === 'ADMIN' || hasClanRole(req, clan.id, 'COMMANDER')
    const memberships = await prisma.clanMembership.findMany({
      where: {
        clanId: clan.id,
        status: canManage ? undefined : 'ACTIVE',
      },
      include: { user: true },
      orderBy: [{ status: 'asc' }, { user: { displayName: 'asc' } }],
    })

    res.json({
      members: memberships.map(membership => serializeClanMember(membership, canManage)),
    })
  }),
)

clansRouter.get(
  '/:clanId/registrations',
  requireClanRole('COMMANDER'),
  asyncHandler(async (req, res) => {
    const clanId = routeParam(req, 'clanId')
    const pending = await prisma.clanMembership.findMany({
      where: { clanId, status: 'PENDING' },
      include: { user: true },
      orderBy: { createdAt: 'asc' },
    })

    res.json({
      registrations: pending.map(membership => ({
        userId: membership.userId,
        displayName: membership.user.displayName,
        username: membership.user.username,
        email: membership.user.email,
        requestedAt: membership.createdAt,
      })),
    })
  }),
)

clansRouter.post(
  '/:clanId/registrations/:userId/approve',
  requireClanRole('COMMANDER'),
  asyncHandler(async (req, res) => {
    const input = approveMembershipSchema.parse(req.body)
    const clanId = routeParam(req, 'clanId')
    const userId = routeParam(req, 'userId')
    const actorRole = getActiveClanRole(req, clanId)
    const targetRole = actorRole === 'COMMANDER' ? 'MEMBER' : input.role

    if (!canSetClanRole(actorRole, targetRole) && actorRole !== 'COMMANDER') {
      throw new HttpError(403, 'You cannot assign this clan role.')
    }

    const membership = await prisma.clanMembership.update({
      where: { clanId_userId: { clanId, userId } },
      data: {
        status: 'ACTIVE',
        role: targetRole,
        approvedAt: new Date(),
        approvedById: req.auth!.user.id,
      },
      include: { user: true, clan: true },
    })

    await createNotification({
      userId: membership.userId,
      clanId: membership.clanId,
      type: 'MEMBERSHIP_APPROVED',
      title: 'Clan-Zugang freigeschaltet',
      body: `Dein Zugang fuer ${membership.clan.name} wurde freigeschaltet.`,
      payloadJson: { clanId: membership.clanId },
    })

    await prisma.auditLog.create({
      data: {
        actorUserId: req.auth!.user.id,
        action: 'clan.membership.approve',
        entityType: 'ClanMembership',
        entityId: membership.id,
        afterJson: {
          clanId: membership.clanId,
          userId: membership.userId,
          role: membership.role,
        },
      },
    })

    res.json({ membership })
  }),
)

clansRouter.post(
  '/:clanId/registrations/:userId/reject',
  requireClanRole('COMMANDER'),
  asyncHandler(async (req, res) => {
    const clanId = routeParam(req, 'clanId')
    const userId = routeParam(req, 'userId')
    const membership = await prisma.clanMembership.update({
      where: { clanId_userId: { clanId, userId } },
      data: { status: 'REJECTED' },
    })

    await prisma.auditLog.create({
      data: {
        actorUserId: req.auth!.user.id,
        action: 'clan.membership.reject',
        entityType: 'ClanMembership',
        entityId: membership.id,
      },
    })

    res.json({ membership })
  }),
)

clansRouter.patch(
  '/:clanId/members/:userId/role',
  requireUser,
  asyncHandler(async (req, res) => {
    const input = updateMembershipRoleSchema.parse(req.body)
    const clanId = routeParam(req, 'clanId')
    const userId = routeParam(req, 'userId')
    const actorRole = getActiveClanRole(req, clanId)
    if (!canSetClanRole(actorRole, input.role)) {
      throw new HttpError(403, 'You cannot assign this clan role.')
    }

    const membership = await prisma.clanMembership.update({
      where: { clanId_userId: { clanId, userId } },
      data: { role: input.role },
    })

    await prisma.auditLog.create({
      data: {
        actorUserId: req.auth!.user.id,
        action: 'clan.membership.role',
        entityType: 'ClanMembership',
        entityId: membership.id,
        afterJson: { role: membership.role },
      },
    })

    res.json({ membership })
  }),
)

clansRouter.patch(
  '/:clanId/members/:userId/tracking',
  requireClanRole('COMMANDER'),
  asyncHandler(async (req, res) => {
    const input = updateMembershipTrackingSchema.parse(req.body)
    const clanId = routeParam(req, 'clanId')
    const userId = routeParam(req, 'userId')
    const before = await prisma.clanMembership.findUnique({
      where: { clanId_userId: { clanId, userId } },
      include: { user: true },
    })

    if (!before) {
      throw new HttpError(404, 'Clan membership not found.')
    }

    const reason = input.reason?.trim() || null
    const membership = await prisma.clanMembership.update({
      where: { clanId_userId: { clanId, userId } },
      data: input.trackingExcluded
        ? {
            trackingExcluded: true,
            trackingExcludedAt: new Date(),
            trackingExcludedById: req.auth!.user.id,
            trackingExcludedReason: reason,
          }
        : {
            trackingExcluded: false,
            trackingExcludedAt: null,
            trackingExcludedById: null,
            trackingExcludedReason: null,
          },
      include: { user: true },
    })

    await logAudit({
      req,
      clanId,
      action: input.trackingExcluded ? 'clan.membership.tracking_exclude' : 'clan.membership.tracking_include',
      entityType: 'ClanMembership',
      entityId: membership.id,
      before: {
        userId: before.userId,
        displayName: before.user.displayName,
        trackingExcluded: before.trackingExcluded,
        trackingExcludedReason: before.trackingExcludedReason,
      },
      after: {
        userId: membership.userId,
        displayName: membership.user.displayName,
        trackingExcluded: membership.trackingExcluded,
        trackingExcludedReason: membership.trackingExcludedReason,
      },
    })

    res.json({
      membership: {
        userId: membership.userId,
        displayName: membership.user.displayName,
        username: membership.user.username,
        role: membership.role,
        status: membership.status,
        trackingExcluded: membership.trackingExcluded,
        trackingExcludedAt: membership.trackingExcludedAt,
        trackingExcludedReason: membership.trackingExcludedReason,
        approvedAt: membership.approvedAt,
      },
    })
  }),
)
