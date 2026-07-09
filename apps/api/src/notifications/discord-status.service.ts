import type { Prisma } from '../generated/prisma/client.js'
import { prisma } from '../utils/prisma.js'
import {
  editDiscordChannelMessage,
  pinDiscordChannelMessage,
  sendDiscordChannelMessage,
  type DiscordEmbedPayload,
  type DiscordMessagePayload,
} from './discord.js'

type StatusUser = {
  id: string
  displayName: string
  discordUserId: string | null
}

type StatusBlueprint = {
  id: string
  name: string
  wantedUsers: StatusUser[]
  missingUsers: StatusUser[]
}

type StatusSlot = {
  blueprint: StatusBlueprint | null
}

type StatusAppearance = {
  id: string
  planetName: string
  ring: number
  observedAt: Date
  expiresAt: Date
  nextSpawnAt: Date | null
  status: string
  slots: StatusSlot[]
}

type StatusJourneyStop = {
  id: string
  planetName: string | null
  ring: number
  arriveAt: Date | null
  departAt: Date | null
  status: string
  certainty: string
  updatedAt: Date
  appearance: StatusAppearance | null
}

type StatusSpawnWindow = {
  id: string
  expectedAt: Date
  status: string
  sourcePlanetName: string
  sourceExpiresAt: Date
  resolvedPlanetName: string | null
}

type StatusAuditEntry = {
  action: string
  summary: string | null
  createdAt: Date
}

type ClanStatusSnapshot = {
  clan: {
    id: string
    name: string
  }
  generatedAt: Date
  statusChannelId: string
  roadmapMessageId: string | null
  planetsMessageId: string | null
  pinMessages: boolean
  journeyStops: StatusJourneyStop[]
  activeAppearances: StatusAppearance[]
  spawnWindows: StatusSpawnWindow[]
  auditEntries: StatusAuditEntry[]
}

type PublishOptions = {
  recreateMessages?: boolean
}

export type DiscordStatusPublishResult = {
  published: boolean
  roadmapMessageId: string | null
  planetsMessageId: string | null
  warnings: string[]
}

const colors = {
  info: 0x6bb6c8,
  ok: 0x2f855a,
  warning: 0xd69e2e,
}

const truncate = (value: string, limit: number) => (value.length <= limit ? value : `${value.slice(0, Math.max(0, limit - 3))}...`)

const timestamp = (date: Date | null | undefined, style: 'f' | 'R' = 'f') =>
  date ? `<t:${Math.floor(date.getTime() / 1000)}:${style}>` : 'offen'

const mentionOrName = (user: StatusUser) => (user.discordUserId ? `<@${user.discordUserId}>` : user.displayName)

const formatPlanetTitle = (planetName: string | null, ring: number) => `${planetName ?? 'Unbekannter Planet'} - ${ring}. Ring`

const formatStopLine = (stop: StatusJourneyStop) => {
  const title = formatPlanetTitle(stop.planetName ?? stop.appearance?.planetName ?? null, stop.ring)
  const timing = [
    stop.arriveAt ? `Ankunft ${timestamp(stop.arriveAt, 'f')} (${timestamp(stop.arriveAt, 'R')})` : null,
    stop.departAt ? `Weiterflug ${timestamp(stop.departAt, 'f')} (${timestamp(stop.departAt, 'R')})` : null,
  ].filter(Boolean)
  const suffix = timing.length ? `\n${timing.join(' · ')}` : '\nZeit noch offen'
  return `**${title}** · ${stop.status.toLowerCase()}${stop.certainty === 'TENTATIVE' ? ' · unsicher' : ''}${suffix}`
}

const formatAppearanceLine = (appearance: StatusAppearance) => {
  const nextSpawn = appearance.nextSpawnAt ? ` · neu ${timestamp(appearance.nextSpawnAt, 'f')} (${timestamp(appearance.nextSpawnAt, 'R')})` : ''
  return `**${formatPlanetTitle(appearance.planetName, appearance.ring)}** · platzt ${timestamp(appearance.expiresAt, 'f')} (${timestamp(
    appearance.expiresAt,
    'R'
  )})${nextSpawn}`
}

const formatAuditLine = (entry: StatusAuditEntry) => {
  const summary = entry.summary ? ` · ${entry.summary}` : ''
  return `${timestamp(entry.createdAt, 'R')} · \`${entry.action}\`${summary}`
}

const compactUserList = (users: StatusUser[], limit = 8) => {
  const visible = users.slice(0, limit).map(mentionOrName)
  const rest = users.length - visible.length
  return rest > 0 ? `${visible.join(', ')} +${rest} weitere` : visible.join(', ')
}

const uniqueBlueprintsForAppearances = (appearances: StatusAppearance[]) => {
  const byId = new Map<string, StatusBlueprint>()
  for (const appearance of appearances) {
    for (const slot of appearance.slots) {
      if (!slot.blueprint) continue
      const existing = byId.get(slot.blueprint.id)
      if (!existing) {
        byId.set(slot.blueprint.id, slot.blueprint)
      }
    }
  }
  return Array.from(byId.values())
}

const wantedLinesForAppearances = (appearances: StatusAppearance[], maxLines = 10) =>
  uniqueBlueprintsForAppearances(appearances)
    .filter(blueprint => blueprint.wantedUsers.length > 0)
    .sort((left, right) => right.wantedUsers.length - left.wantedUsers.length || left.name.localeCompare(right.name, 'de'))
    .slice(0, maxLines)
    .map(blueprint => `**${blueprint.name}** (${blueprint.wantedUsers.length}): ${compactUserList(blueprint.wantedUsers)}`)

const missingSummaryLinesForAppearances = (appearances: StatusAppearance[], maxLines = 8) =>
  uniqueBlueprintsForAppearances(appearances)
    .filter(blueprint => blueprint.missingUsers.length > 0)
    .sort((left, right) => right.missingUsers.length - left.missingUsers.length || left.name.localeCompare(right.name, 'de'))
    .slice(0, maxLines)
    .map(blueprint => `**${blueprint.name}**: ${blueprint.missingUsers.length} fehlen`)

const field = (name: string, lines: string[], fallback: string): NonNullable<DiscordEmbedPayload['fields']>[number] => ({
  name,
  value: truncate(lines.length ? lines.join('\n') : fallback, 1024),
  inline: false,
})

export const buildClanRoadmapStatusEmbed = (snapshot: ClanStatusSnapshot): DiscordEmbedPayload => {
  const current = snapshot.journeyStops.find(stop => stop.status === 'CURRENT') ?? null
  const planned = snapshot.journeyStops.filter(stop => stop.status === 'PLANNED')
  const relevantAppearances = [current?.appearance, ...planned.slice(0, 2).map(stop => stop.appearance)].filter(
    (appearance): appearance is StatusAppearance => Boolean(appearance)
  )
  const wantedLines = wantedLinesForAppearances(relevantAppearances, 10)

  return {
    title: `${snapshot.clan.name} Roadmap`,
    description: `Clan-Route und Wunsch-BPs. Aktualisiert ${timestamp(snapshot.generatedAt, 'R')}.`,
    color: wantedLines.length > 0 ? colors.warning : colors.info,
    timestamp: snapshot.generatedAt.toISOString(),
    fields: [
      field('Aktuell', current ? [formatStopLine(current)] : [], 'Keine aktuelle Station gesetzt.'),
      field('Nächste Stationen', planned.slice(0, 5).map(formatStopLine), 'Keine geplanten Stationen.'),
      field('Wunsch-BPs', wantedLines, 'Keine Wunsch-BPs auf den nächsten Roadmap-Stationen.'),
      field('Zuletzt bearbeitet', snapshot.auditEntries.map(formatAuditLine), 'Noch keine Roadmap-/Sirius-Änderungen.'),
    ],
    footer: { text: 'BP Tracker · Statuskanal ohne Pings' },
  }
}

export const buildClanPlanetsStatusEmbed = (snapshot: ClanStatusSnapshot): DiscordEmbedPayload => {
  const spawnLines = snapshot.spawnWindows.slice(0, 8).map(window => {
    const resolved = window.resolvedPlanetName ? ` · erfasst als **${window.resolvedPlanetName}**` : ''
    return `**${window.sourcePlanetName}** · erwartet ${timestamp(window.expectedAt, 'f')} (${timestamp(window.expectedAt, 'R')})${resolved}`
  })

  const wantedLines = wantedLinesForAppearances(snapshot.activeAppearances, 8)
  const missingLines = missingSummaryLinesForAppearances(snapshot.activeAppearances, 8)

  return {
    title: `${snapshot.clan.name} Sirius-Status`,
    description: `Aktive Planeten, Spawn-Fenster und kompakte BP-Signale. Aktualisiert ${timestamp(snapshot.generatedAt, 'R')}.`,
    color: snapshot.spawnWindows.some(window => window.expectedAt < snapshot.generatedAt && !window.resolvedPlanetName) ? colors.warning : colors.ok,
    timestamp: snapshot.generatedAt.toISOString(),
    fields: [
      field('Aktive Planeten', snapshot.activeAppearances.slice(0, 10).map(formatAppearanceLine), 'Keine aktiven Sirius-Planeten.'),
      field('Spawn-Fenster', spawnLines, 'Keine offenen Spawn-Fenster.'),
      field('Wunsch-Treffer', wantedLines, 'Keine Wunsch-Treffer auf aktiven Planeten.'),
      field('Fehlend kompakt', missingLines, 'Keine fehlenden Treffer auf aktiven Planeten.'),
    ],
    footer: { text: 'BP Tracker · Zeiten nutzen Discord-Zeitstempel' },
  }
}

const statusAppearanceInclude = {
  planet: true,
  slots: {
    include: {
      blueprint: true,
    },
    orderBy: [{ slotGroup: 'asc' }, { enemyType: 'asc' }, { createdAt: 'asc' }],
  },
} satisfies Prisma.SiriusPlanetAppearanceInclude

type AppearanceWithSlots = Prisma.SiriusPlanetAppearanceGetPayload<{ include: typeof statusAppearanceInclude }>

const mapAppearance = (appearance: AppearanceWithSlots, blueprintUsers: Map<string, { wanted: StatusUser[]; missing: StatusUser[] }>): StatusAppearance => ({
  id: appearance.id,
  planetName: appearance.planet.name,
  ring: appearance.ring,
  observedAt: appearance.observedAt,
  expiresAt: appearance.expiresAt,
  nextSpawnAt: appearance.nextSpawnAt,
  status: appearance.status,
  slots: appearance.slots.map(slot => ({
    blueprint: slot.blueprint
      ? {
          id: slot.blueprint.id,
          name: slot.blueprint.nameDe,
          wantedUsers: blueprintUsers.get(slot.blueprint.id)?.wanted ?? [],
          missingUsers: blueprintUsers.get(slot.blueprint.id)?.missing ?? [],
        }
      : null,
  })),
})

const buildBlueprintUsers = async (clanId: string, blueprintIds: string[]) => {
  const uniqueBlueprintIds = Array.from(new Set(blueprintIds))
  const result = new Map<string, { wanted: StatusUser[]; missing: StatusUser[] }>()
  if (uniqueBlueprintIds.length === 0) return result

  const memberships = await prisma.clanMembership.findMany({
    where: { clanId, status: 'ACTIVE', trackingExcluded: false },
    include: {
      user: {
        select: {
          id: true,
          displayName: true,
          discordUserId: true,
        },
      },
    },
    orderBy: { user: { displayName: 'asc' } },
  })
  const users = memberships.map(membership => membership.user)
  const statuses = await prisma.userBlueprintStatus.findMany({
    where: {
      userId: { in: users.map(user => user.id) },
      blueprintId: { in: uniqueBlueprintIds },
    },
    select: {
      userId: true,
      blueprintId: true,
      status: true,
    },
  })
  const statusByKey = new Map(statuses.map(status => [`${status.userId}:${status.blueprintId}`, status.status]))

  for (const blueprintId of uniqueBlueprintIds) {
    const item = { wanted: [] as StatusUser[], missing: [] as StatusUser[] }
    for (const user of users) {
      const status = statusByKey.get(`${user.id}:${blueprintId}`)
      if (status === 'WANTED') {
        item.wanted.push(user)
      } else if (status !== 'OWNED') {
        item.missing.push(user)
      }
    }
    result.set(blueprintId, item)
  }

  return result
}

export const collectClanDiscordStatusSnapshot = async (clanId: string): Promise<ClanStatusSnapshot> => {
  const settings = await prisma.clanDiscordSettings.findUnique({ where: { clanId }, include: { clan: true } })
  if (!settings?.statusEnabled || !settings.statusChannelId) {
    throw new Error('Discord status channel is not enabled for this clan.')
  }

  const [journeyStops, activeAppearances, spawnWindows, auditEntries] = await Promise.all([
    prisma.clanJourneyStop.findMany({
      where: { clanId, status: { in: ['CURRENT', 'PLANNED'] } },
      include: {
        planet: true,
        appearance: {
          include: statusAppearanceInclude,
        },
      },
      orderBy: [{ sortOrder: 'asc' }, { arriveAt: 'asc' }, { createdAt: 'asc' }],
      take: 12,
    }),
    prisma.siriusPlanetAppearance.findMany({
      where: { clanId, status: { in: ['ACTIVE', 'UPCOMING'] } },
      include: statusAppearanceInclude,
      orderBy: [{ expiresAt: 'asc' }, { planet: { sortOrder: 'asc' } }],
      take: 16,
    }),
    prisma.siriusSpawnWindow.findMany({
      where: { clanId, status: { not: 'CANCELLED' } },
      include: {
        sourceAppearance: { include: { planet: true } },
        resolvedAppearance: { include: { planet: true } },
      },
      orderBy: [{ expectedAt: 'asc' }, { createdAt: 'asc' }],
      take: 12,
    }),
    prisma.auditLog.findMany({
      where: {
        clanId,
        OR: [{ action: { startsWith: 'sirius.' } }, { action: { startsWith: 'clan.discord' } }],
      },
      orderBy: { createdAt: 'desc' },
      take: 5,
    }),
  ])

  const blueprintIds = [
    ...journeyStops.flatMap(stop => stop.appearance?.slots.map(slot => slot.blueprintId).filter((id): id is string => Boolean(id)) ?? []),
    ...activeAppearances.flatMap(appearance => appearance.slots.map(slot => slot.blueprintId).filter((id): id is string => Boolean(id))),
  ]
  const blueprintUsers = await buildBlueprintUsers(clanId, blueprintIds)

  return {
    clan: { id: settings.clan.id, name: settings.clan.name },
    generatedAt: new Date(),
    statusChannelId: settings.statusChannelId,
    roadmapMessageId: settings.statusRoadmapMessageId,
    planetsMessageId: settings.statusPlanetsMessageId,
    pinMessages: settings.statusPinMessages,
    journeyStops: journeyStops.map(stop => ({
      id: stop.id,
      planetName: stop.planet?.name ?? stop.appearance?.planet.name ?? stop.planetName,
      ring: stop.ring,
      arriveAt: stop.arriveAt,
      departAt: stop.departAt,
      status: stop.status,
      certainty: stop.certainty,
      updatedAt: stop.updatedAt,
      appearance: stop.appearance ? mapAppearance(stop.appearance, blueprintUsers) : null,
    })),
    activeAppearances: activeAppearances.map(appearance => mapAppearance(appearance, blueprintUsers)),
    spawnWindows: spawnWindows.map(window => ({
      id: window.id,
      expectedAt: window.expectedAt,
      status: window.status,
      sourcePlanetName: window.sourceAppearance.planet.name,
      sourceExpiresAt: window.sourceAppearance.expiresAt,
      resolvedPlanetName: window.resolvedAppearance?.planet.name ?? null,
    })),
    auditEntries: auditEntries.map(entry => ({
      action: entry.action,
      summary: entry.summary,
      createdAt: entry.createdAt,
    })),
  }
}

const updateOrCreateStatusMessage = async (input: {
  channelId: string
  messageId: string | null
  recreate: boolean
  pin: boolean
  payload: DiscordMessagePayload
}) => {
  const warnings: string[] = []
  if (input.messageId && !input.recreate) {
    const editResult = await editDiscordChannelMessage(input.channelId, input.messageId, input.payload)
    if (editResult.ok) {
      return { messageId: input.messageId, warnings }
    }
    if (!('status' in editResult) || editResult.status !== 404) {
      throw new Error(editResult.error)
    }
    warnings.push('Stored Discord status message was not found and has been recreated.')
  }

  const sendResult = await sendDiscordChannelMessage(input.channelId, input.payload)
  if (!sendResult.ok) {
    throw new Error(sendResult.error)
  }
  if (!sendResult.messageId) {
    throw new Error('Discord did not return a message id for the status message.')
  }

  if (input.pin) {
    const pinResult = await pinDiscordChannelMessage(input.channelId, sendResult.messageId)
    if (!pinResult.ok) {
      warnings.push(`Status message was created but could not be pinned: ${pinResult.error}`)
    }
  }

  return { messageId: sendResult.messageId, warnings }
}

export const publishClanDiscordStatus = async (clanId: string, options: PublishOptions = {}): Promise<DiscordStatusPublishResult> => {
  const snapshot = await collectClanDiscordStatusSnapshot(clanId)
  const roadmapPayload: DiscordMessagePayload = {
    content: `BP Tracker Status: ${snapshot.clan.name} Roadmap`,
    embeds: [buildClanRoadmapStatusEmbed(snapshot)],
    allowed_mentions: { parse: [] },
  }
  const planetsPayload: DiscordMessagePayload = {
    content: `BP Tracker Status: ${snapshot.clan.name} Sirius`,
    embeds: [buildClanPlanetsStatusEmbed(snapshot)],
    allowed_mentions: { parse: [] },
  }

  const warnings: string[] = []
  try {
    const roadmap = await updateOrCreateStatusMessage({
      channelId: snapshot.statusChannelId,
      messageId: snapshot.roadmapMessageId,
      recreate: options.recreateMessages ?? false,
      pin: snapshot.pinMessages,
      payload: roadmapPayload,
    })
    warnings.push(...roadmap.warnings)
    const planets = await updateOrCreateStatusMessage({
      channelId: snapshot.statusChannelId,
      messageId: snapshot.planetsMessageId,
      recreate: options.recreateMessages ?? false,
      pin: snapshot.pinMessages,
      payload: planetsPayload,
    })
    warnings.push(...planets.warnings)

    await prisma.clanDiscordSettings.update({
      where: { clanId },
      data: {
        statusRoadmapMessageId: roadmap.messageId,
        statusPlanetsMessageId: planets.messageId,
        statusLastPublishedAt: new Date(),
        statusLastError: warnings.length ? warnings.join('\n') : null,
      },
    })

    return {
      published: true,
      roadmapMessageId: roadmap.messageId,
      planetsMessageId: planets.messageId,
      warnings,
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Discord status publish failed.'
    await prisma.clanDiscordSettings.update({
      where: { clanId },
      data: {
        statusLastError: message,
      },
    })
    throw error
  }
}

const scheduledPublishes = new Map<string, ReturnType<typeof setTimeout>>()

export const scheduleClanDiscordStatusPublish = (clanId: string, delayMs = 10_000) => {
  if (scheduledPublishes.has(clanId)) return
  const timeout = setTimeout(() => {
    scheduledPublishes.delete(clanId)
    prisma.clanDiscordSettings
      .findUnique({
        where: { clanId },
        select: { statusEnabled: true, statusChannelId: true },
      })
      .then(settings => {
        if (!settings?.statusEnabled || !settings.statusChannelId) return undefined
        return publishClanDiscordStatus(clanId)
      })
      .catch(async error => {
        const message = error instanceof Error ? error.message : 'Discord status publish failed.'
        await prisma.clanDiscordSettings
          .update({
            where: { clanId },
            data: { statusLastError: message },
          })
          .catch(() => undefined)
      })
  }, delayMs)
  timeout.unref?.()
  scheduledPublishes.set(clanId, timeout)
}
