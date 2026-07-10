import type { BlueprintTranslation, Prisma, SiriusAppearanceStatus, SiriusSpawnWindowStatus } from '../generated/prisma/client.js'
import { prisma } from '../utils/prisma.js'
import { deriveSpawnWindowStatus } from '../sirius/spawn-windows.js'
import { editDiscordChannelMessage, pinDiscordChannelMessage, sendDiscordChannelMessage, type DiscordEmbedPayload, type DiscordMessagePayload } from './discord.js'

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
  status: SiriusSpawnWindowStatus
  sourcePlanetName: string
  sourceStatus: SiriusAppearanceStatus
  sourceExpiresAt: Date
  resolvedPlanetName: string | null
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
  statusLocale: DiscordStatusLocale
  journeyStops: StatusJourneyStop[]
  activeAppearances: StatusAppearance[]
  spawnWindows: StatusSpawnWindow[]
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

type DiscordStatusLocale = 'de' | 'en' | 'es'

const discordStatusLocales = ['de', 'en', 'es'] as const
const normalizeStatusLocale = (value: string | null | undefined): DiscordStatusLocale => (discordStatusLocales.includes(value as DiscordStatusLocale) ? (value as DiscordStatusLocale) : 'de')

const statusCopy: Record<
  DiscordStatusLocale,
  {
    unknownPlanet: string
    open: string
    more: string
    arrival: string
    departure: string
    timeOpen: string
    tentative: string
    bursts: string
    expired: string
    newSpawn: string
    expected: string
    overdue: string
    capturedAs: string
    roadmapTitleSuffix: string
    siriusTitleSuffix: string
    roadmapDescription: string
    siriusDescription: string
    currentField: string
    nextStationsField: string
    wantedBlueprintsField: string
    activePlanetsField: string
    spawnWindowsField: string
    wantedHitsField: string
    noCurrent: string
    noPlanned: string
    noRoadmapWanted: string
    noActivePlanets: string
    noSpawnWindows: string
    noWantedHits: string
    roadmapFooter: string
    siriusFooter: string
    roadmapContentPrefix: string
    siriusContentPrefix: string
    statuses: Record<string, string>
  }
> = {
  de: {
    unknownPlanet: 'Unbekannter Planet',
    open: 'offen',
    more: 'weitere',
    arrival: 'Ankunft',
    departure: 'Weiterflug',
    timeOpen: 'Zeit noch offen',
    tentative: 'unsicher',
    bursts: 'platzt',
    expired: 'geplatzt',
    newSpawn: 'spawnt neu',
    expected: 'erwartet',
    overdue: 'überfällig',
    capturedAs: 'erfasst als',
    roadmapTitleSuffix: 'Roadmap',
    siriusTitleSuffix: 'Sirius-Status',
    roadmapDescription: '📍 {current} aktuell · 🧭 {planned} geplant · 🎯 {wanted} Wunsch-BPs · aktualisiert {updated}.',
    siriusDescription: '🪐 {active} aktiv · ⏳ {windows} Spawn-Fenster · 🎯 {wanted} Wunsch-Treffer · aktualisiert {updated}.',
    currentField: '📍 Aktuell',
    nextStationsField: '🧭 Nächste Stationen',
    wantedBlueprintsField: '🎯 Wunsch-BPs',
    activePlanetsField: '🪐 Aktive Planeten',
    spawnWindowsField: '⏳ Nächste Spawn-Fenster',
    wantedHitsField: '⭐ Wunsch-Treffer',
    noCurrent: 'Keine aktuelle Station gesetzt.',
    noPlanned: 'Keine geplanten Stationen.',
    noRoadmapWanted: 'Keine Wunsch-BPs auf den nächsten Roadmap-Stationen.',
    noActivePlanets: 'Keine aktiven Sirius-Planeten.',
    noSpawnWindows: 'Keine offenen Spawn-Fenster.',
    noWantedHits: 'Keine Wunsch-Treffer auf aktiven Planeten.',
    roadmapFooter: 'BP Tracker · Statuskanal ohne Pings',
    siriusFooter: 'BP Tracker · Zeiten nutzen Discord-Zeitstempel',
    roadmapContentPrefix: 'BP Tracker Status',
    siriusContentPrefix: 'BP Tracker Status',
    statuses: {
      CURRENT: 'aktuell',
      PLANNED: 'geplant',
      COMPLETED: 'abgeschlossen',
      SKIPPED: 'übersprungen',
      CANCELLED: 'abgesagt',
    },
  },
  en: {
    unknownPlanet: 'Unknown planet',
    open: 'open',
    more: 'more',
    arrival: 'Arrival',
    departure: 'Departure',
    timeOpen: 'Time still open',
    tentative: 'tentative',
    bursts: 'expires',
    expired: 'expired',
    newSpawn: 'respawns',
    expected: 'expected',
    overdue: 'overdue',
    capturedAs: 'captured as',
    roadmapTitleSuffix: 'Roadmap',
    siriusTitleSuffix: 'Sirius status',
    roadmapDescription: '📍 {current} current · 🧭 {planned} planned · 🎯 {wanted} wanted BPs · updated {updated}.',
    siriusDescription: '🪐 {active} active · ⏳ {windows} spawn windows · 🎯 {wanted} wanted hits · updated {updated}.',
    currentField: '📍 Current',
    nextStationsField: '🧭 Next stations',
    wantedBlueprintsField: '🎯 Wanted BPs',
    activePlanetsField: '🪐 Active planets',
    spawnWindowsField: '⏳ Next spawn windows',
    wantedHitsField: '⭐ Wanted hits',
    noCurrent: 'No current station set.',
    noPlanned: 'No planned stations.',
    noRoadmapWanted: 'No wanted BPs on the next roadmap stations.',
    noActivePlanets: 'No active Sirius planets.',
    noSpawnWindows: 'No open spawn windows.',
    noWantedHits: 'No wanted hits on active planets.',
    roadmapFooter: 'BP Tracker · Status channel without pings',
    siriusFooter: 'BP Tracker · Times use Discord timestamps',
    roadmapContentPrefix: 'BP Tracker Status',
    siriusContentPrefix: 'BP Tracker Status',
    statuses: {
      CURRENT: 'current',
      PLANNED: 'planned',
      COMPLETED: 'completed',
      SKIPPED: 'skipped',
      CANCELLED: 'cancelled',
    },
  },
  es: {
    unknownPlanet: 'Planeta desconocido',
    open: 'abierto',
    more: 'más',
    arrival: 'Llegada',
    departure: 'Salida',
    timeOpen: 'Hora aún abierta',
    tentative: 'tentativo',
    bursts: 'expira',
    expired: 'expiró',
    newSpawn: 'reaparece',
    expected: 'esperado',
    overdue: 'vencida',
    capturedAs: 'registrado como',
    roadmapTitleSuffix: 'Ruta',
    siriusTitleSuffix: 'Estado Sirius',
    roadmapDescription: '📍 {current} actual · 🧭 {planned} planificadas · 🎯 {wanted} BPs deseados · actualizado {updated}.',
    siriusDescription: '🪐 {active} activos · ⏳ {windows} ventanas · 🎯 {wanted} deseados · actualizado {updated}.',
    currentField: '📍 Actual',
    nextStationsField: '🧭 Siguientes estaciones',
    wantedBlueprintsField: '🎯 BPs deseados',
    activePlanetsField: '🪐 Planetas activos',
    spawnWindowsField: '⏳ Próximas ventanas',
    wantedHitsField: '⭐ Deseados activos',
    noCurrent: 'No hay estación actual.',
    noPlanned: 'No hay estaciones planificadas.',
    noRoadmapWanted: 'No hay BPs deseados en las siguientes estaciones.',
    noActivePlanets: 'No hay planetas Sirius activos.',
    noSpawnWindows: 'No hay ventanas de spawn abiertas.',
    noWantedHits: 'No hay deseados en planetas activos.',
    roadmapFooter: 'BP Tracker · Canal de estado sin pings',
    siriusFooter: 'BP Tracker · Los tiempos usan marcas de tiempo de Discord',
    roadmapContentPrefix: 'Estado BP Tracker',
    siriusContentPrefix: 'Estado BP Tracker',
    statuses: {
      CURRENT: 'actual',
      PLANNED: 'planificado',
      COMPLETED: 'completado',
      SKIPPED: 'omitido',
      CANCELLED: 'cancelado',
    },
  },
}

const copyFor = (locale: DiscordStatusLocale) => statusCopy[locale]
const collatorLocaleFor = (locale: DiscordStatusLocale) => (locale === 'de' ? 'de' : locale === 'es' ? 'es' : 'en')

const truncateLine = (value: string, limit: number) => {
  if (value.length <= limit) return value
  const sliced = value.slice(0, limit)
  const boundary = Math.max(sliced.lastIndexOf(' '), sliced.lastIndexOf(' · '), sliced.lastIndexOf(','))
  return sliced.slice(0, boundary > Math.floor(limit * 0.6) ? boundary : limit).trimEnd()
}

const truncateFieldValue = (value: string, limit: number) => {
  if (value.length <= limit) return value
  const suffix = '...'
  const max = Math.max(0, limit - suffix.length)
  const lines = value.split('\n')
  const kept: string[] = []
  let length = 0

  for (const line of lines) {
    const nextLength = length + (kept.length > 0 ? 1 : 0) + line.length
    if (nextLength <= max) {
      kept.push(line)
      length = nextLength
      continue
    }

    if (kept.length === 0) {
      return `${truncateLine(line, max)}${suffix}`
    }
    break
  }

  return `${kept.join('\n')}${suffix}`
}

const timestamp = (date: Date | null | undefined, style: 'f' | 'R' = 'f') => (date ? `<t:${Math.floor(date.getTime() / 1000)}:${style}>` : copyFor('de').open)

const mentionOrName = (user: StatusUser) => (user.discordUserId ? `<@${user.discordUserId}>` : user.displayName)

const timestampFor = (date: Date | null | undefined, locale: DiscordStatusLocale, style: 'f' | 'R' = 'f') => (date ? timestamp(date, style) : copyFor(locale).open)

const replaceTokens = (template: string, tokens: Record<string, string | number>) => Object.entries(tokens).reduce((result, [key, value]) => result.replaceAll(`{${key}}`, String(value)), template)

const localizedBlueprintName = (
  blueprint: {
    canonicalName?: string | null
    nameDe?: string | null
    nameEn?: string | null
    translations?: BlueprintTranslation[] | null
  },
  locale: DiscordStatusLocale,
) => {
  const normalizedLocale = locale.toLowerCase()
  const exact = blueprint.translations?.find(translation => translation.locale.toLowerCase() === normalizedLocale)?.name.trim()
  if (exact) return exact

  const mappedLocale = locale === 'de' ? 'de' : 'en'
  const mapped = blueprint.translations?.find(translation => translation.locale.toLowerCase() === mappedLocale)?.name.trim()
  if (mapped) return mapped

  const de = blueprint.nameDe?.trim() || blueprint.canonicalName?.trim()
  const en = blueprint.nameEn?.trim()
  return mappedLocale === 'en' ? en || de || '-' : de || en || '-'
}

const formatPlanetTitle = (planetName: string | null, ring: number, locale: DiscordStatusLocale) => `${planetName ?? copyFor(locale).unknownPlanet} - ${ring}. Ring`

const compactPlanetTitle = (appearance: StatusAppearance, locale: DiscordStatusLocale) => `${appearance.planetName ?? copyFor(locale).unknownPlanet} ${appearance.ring}. Ring`

const shortPlanetTitle = (appearance: Pick<StatusAppearance, 'planetName' | 'ring'>, locale: DiscordStatusLocale) => `${appearance.planetName ?? copyFor(locale).unknownPlanet} ${appearance.ring}R`

const expiryIconFor = (expiresAt: Date, generatedAt: Date) => {
  const hoursLeft = (expiresAt.getTime() - generatedAt.getTime()) / 3_600_000
  if (hoursLeft <= 0) return '🔴'
  if (hoursLeft <= 6) return '🟡'
  return '🟢'
}

const stopStatusIcon = (stop: StatusJourneyStop) => {
  if (stop.status === 'CURRENT') return '🟢'
  if (stop.certainty === 'TENTATIVE') return '🟡'
  return '🧭'
}

const formatStopLine = (stop: StatusJourneyStop, locale: DiscordStatusLocale) => {
  const copy = copyFor(locale)
  const title = formatPlanetTitle(stop.planetName ?? stop.appearance?.planetName ?? null, stop.ring, locale)
  const timing = [
    stop.arriveAt ? `🛬 ${copy.arrival} ${timestampFor(stop.arriveAt, locale, 'f')} · ${timestampFor(stop.arriveAt, locale, 'R')}` : null,
    stop.departAt ? `🛫 ${copy.departure} ${timestampFor(stop.departAt, locale, 'f')} · ${timestampFor(stop.departAt, locale, 'R')}` : null,
  ].filter(Boolean)
  const suffix = timing.length ? timing.join('\n') : `🕓 ${copy.timeOpen}`
  return `🪐 **${title}**\n${stopStatusIcon(stop)} ${copy.statuses[stop.status] ?? stop.status.toLowerCase()}${stop.certainty === 'TENTATIVE' ? ` · ${copy.tentative}` : ''}\n${suffix}`
}

const formatCompactAppearanceLine = (appearance: StatusAppearance, locale: DiscordStatusLocale, generatedAt: Date) => {
  const copy = copyFor(locale)
  const hasExpired = appearance.expiresAt <= generatedAt
  const expiryLabel = hasExpired ? copy.expired : copy.bursts
  const nextSpawn = hasExpired && appearance.nextSpawnAt ? ` · ${copy.newSpawn} ${timestampFor(appearance.nextSpawnAt, locale, 'R')}` : ''
  return `${expiryIconFor(appearance.expiresAt, generatedAt)} **${shortPlanetTitle(appearance, locale)}** · ${expiryLabel} ${timestampFor(appearance.expiresAt, locale, 'R')}${nextSpawn}`
}

const compactUserList = (users: StatusUser[], locale: DiscordStatusLocale, limit = 8) => {
  const visible = users.slice(0, limit).map(mentionOrName)
  const rest = users.length - visible.length
  return rest > 0 ? `${visible.join(', ')} +${rest} ${copyFor(locale).more}` : visible.join(', ')
}

const appendMoreLine = (lines: string[], total: number, locale: DiscordStatusLocale) => {
  const hidden = total - lines.length
  return hidden > 0 ? [...lines, `+${hidden} ${copyFor(locale).more}`] : lines
}

const blueprintIdsForAppearances = (appearances: StatusAppearance[]) =>
  new Set(appearances.flatMap(appearance => appearance.slots.map(slot => slot.blueprint?.id).filter((id): id is string => Boolean(id))))

const relevantRoadmapAppearancesForSnapshot = (snapshot: ClanStatusSnapshot) => {
  const current = snapshot.journeyStops.find(stop => stop.status === 'CURRENT') ?? null
  const planned = snapshot.journeyStops.filter(stop => stop.status === 'PLANNED')
  return [current?.appearance, ...planned.slice(0, 2).map(stop => stop.appearance)].filter((appearance): appearance is StatusAppearance => Boolean(appearance))
}

const wantedLinesForAppearances = (appearances: StatusAppearance[], locale: DiscordStatusLocale, maxLines = 10, excludedBlueprintIds = new Set<string>()) => {
  const byId = new Map<string, { blueprint: StatusBlueprint; locations: Set<string> }>()
  for (const appearance of appearances) {
    for (const slot of appearance.slots) {
      if (!slot.blueprint || slot.blueprint.wantedUsers.length === 0) continue
      if (excludedBlueprintIds.has(slot.blueprint.id)) continue
      const entry = byId.get(slot.blueprint.id) ?? {
        blueprint: slot.blueprint,
        locations: new Set<string>(),
      }
      entry.locations.add(compactPlanetTitle(appearance, locale))
      byId.set(slot.blueprint.id, entry)
    }
  }

  return Array.from(byId.values())
    .map(entry => entry.blueprint)
    .filter(blueprint => blueprint.wantedUsers.length > 0)
    .sort((left, right) => right.wantedUsers.length - left.wantedUsers.length || left.name.localeCompare(right.name, collatorLocaleFor(locale)))
    .slice(0, maxLines)
    .map(blueprint => {
      const locations = byId.get(blueprint.id)?.locations ?? new Set<string>()
      const locationText = locations.size > 0 ? ` · ${Array.from(locations).slice(0, 3).join(', ')}` : ''
      return `🎯 **${blueprint.name}** (${blueprint.wantedUsers.length})${locationText}\n${compactUserList(blueprint.wantedUsers, locale)}`
    })
}

const field = (name: string, lines: string[], fallback: string): NonNullable<DiscordEmbedPayload['fields']>[number] => ({
  name,
  value: truncateFieldValue(lines.length ? lines.join('\n') : fallback, 1024),
  inline: false,
})

export const buildClanRoadmapStatusEmbed = (snapshot: ClanStatusSnapshot): DiscordEmbedPayload => {
  const locale = snapshot.statusLocale
  const copy = copyFor(locale)
  const current = snapshot.journeyStops.find(stop => stop.status === 'CURRENT') ?? null
  const planned = snapshot.journeyStops.filter(stop => stop.status === 'PLANNED')
  const relevantAppearances = relevantRoadmapAppearancesForSnapshot(snapshot)
  const wantedLines = wantedLinesForAppearances(relevantAppearances, locale, 10)

  return {
    title: `${snapshot.clan.name} ${copy.roadmapTitleSuffix}`,
    description: replaceTokens(copy.roadmapDescription, {
      current: current ? 1 : 0,
      planned: planned.length,
      wanted: wantedLines.length,
      updated: timestampFor(snapshot.generatedAt, locale, 'R'),
    }),
    color: wantedLines.length > 0 ? colors.warning : colors.info,
    timestamp: snapshot.generatedAt.toISOString(),
    fields: [
      field(copy.currentField, current ? [formatStopLine(current, locale)] : [], copy.noCurrent),
      field(
        copy.nextStationsField,
        planned.slice(0, 5).map(stop => formatStopLine(stop, locale)),
        copy.noPlanned,
      ),
      field(copy.wantedBlueprintsField, wantedLines, copy.noRoadmapWanted),
    ],
    footer: { text: copy.roadmapFooter },
  }
}

export const buildClanPlanetsStatusEmbed = (snapshot: ClanStatusSnapshot): DiscordEmbedPayload => {
  const locale = snapshot.statusLocale
  const copy = copyFor(locale)
  const openSpawnWindows = snapshot.spawnWindows
    .filter(window => {
      const derivedStatus = deriveSpawnWindowStatus({
        status: window.status,
        expectedAt: window.expectedAt,
        resolvedAppearanceId: window.resolvedPlanetName,
        sourceStatus: window.sourceStatus,
        sourceExpiresAt: window.sourceExpiresAt,
        now: snapshot.generatedAt,
      })
      return derivedStatus === 'WAITING_FOR_SPAWN' || derivedStatus === 'OVERDUE'
    })
    .sort((left, right) => {
      const leftOverdue = left.expectedAt < snapshot.generatedAt ? 0 : 1
      const rightOverdue = right.expectedAt < snapshot.generatedAt ? 0 : 1
      return leftOverdue - rightOverdue || left.expectedAt.getTime() - right.expectedAt.getTime()
    })
  const spawnLines = appendMoreLine(
    openSpawnWindows.slice(0, 5).map(window => {
      const isOverdue = window.expectedAt < snapshot.generatedAt
      const icon = isOverdue ? '🔴' : '⏳'
      const label = isOverdue ? copy.overdue : copy.expected
      return `${icon} **${window.sourcePlanetName}** · ${label} ${timestampFor(window.expectedAt, locale, 'R')}`
    }),
    openSpawnWindows.length,
    locale,
  )

  const activeLines = appendMoreLine(
    snapshot.activeAppearances.slice(0, 8).map(appearance => formatCompactAppearanceLine(appearance, locale, snapshot.generatedAt)),
    snapshot.activeAppearances.length,
    locale,
  )
  const roadmapBlueprintIds = blueprintIdsForAppearances(relevantRoadmapAppearancesForSnapshot(snapshot))
  const wantedLines = wantedLinesForAppearances(snapshot.activeAppearances, locale, 8, roadmapBlueprintIds)

  return {
    title: `${snapshot.clan.name} ${copy.siriusTitleSuffix}`,
    description: replaceTokens(copy.siriusDescription, {
      active: snapshot.activeAppearances.length,
      windows: openSpawnWindows.length,
      wanted: wantedLines.length,
      updated: timestampFor(snapshot.generatedAt, locale, 'R'),
    }),
    color: openSpawnWindows.some(window => window.expectedAt < snapshot.generatedAt) ? colors.warning : colors.ok,
    timestamp: snapshot.generatedAt.toISOString(),
    fields: [
      field(copy.wantedHitsField, wantedLines, copy.noWantedHits),
      field(copy.activePlanetsField, activeLines, copy.noActivePlanets),
      field(copy.spawnWindowsField, spawnLines, copy.noSpawnWindows),
    ],
    footer: { text: copy.siriusFooter },
  }
}

const statusAppearanceInclude = {
  planet: true,
  slots: {
    include: {
      blueprint: {
        include: {
          translations: {
            orderBy: { locale: 'asc' },
          },
        },
      },
    },
    orderBy: [{ slotGroup: 'asc' }, { enemyType: 'asc' }, { createdAt: 'asc' }],
  },
} satisfies Prisma.SiriusPlanetAppearanceInclude

type AppearanceWithSlots = Prisma.SiriusPlanetAppearanceGetPayload<{
  include: typeof statusAppearanceInclude
}>

const mapAppearance = (appearance: AppearanceWithSlots, blueprintUsers: Map<string, { wanted: StatusUser[]; missing: StatusUser[] }>, locale: DiscordStatusLocale): StatusAppearance => ({
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
          name: localizedBlueprintName(slot.blueprint, locale),
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
  const settings = await prisma.clanDiscordSettings.findUnique({
    where: { clanId },
    include: { clan: true },
  })
  if (!settings?.statusEnabled || !settings.statusChannelId) {
    throw new Error('Discord status channel is not enabled for this clan.')
  }
  const statusLocale = normalizeStatusLocale(settings.statusLocale)

  const [journeyStops, activeAppearances, spawnWindows] = await Promise.all([
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
      where: { clanId, status: 'PENDING' },
      include: {
        sourceAppearance: { include: { planet: true } },
        resolvedAppearance: { include: { planet: true } },
      },
      orderBy: [{ expectedAt: 'asc' }, { createdAt: 'asc' }],
      take: 12,
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
    statusLocale,
    journeyStops: journeyStops.map(stop => ({
      id: stop.id,
      planetName: stop.planet?.name ?? stop.appearance?.planet.name ?? stop.planetName,
      ring: stop.ring,
      arriveAt: stop.arriveAt,
      departAt: stop.departAt,
      status: stop.status,
      certainty: stop.certainty,
      updatedAt: stop.updatedAt,
      appearance: stop.appearance ? mapAppearance(stop.appearance, blueprintUsers, statusLocale) : null,
    })),
    activeAppearances: activeAppearances.map(appearance => mapAppearance(appearance, blueprintUsers, statusLocale)),
    spawnWindows: spawnWindows.map(window => ({
      id: window.id,
      expectedAt: window.expectedAt,
      status: window.status,
      sourcePlanetName: window.sourceAppearance.planet.name,
      sourceStatus: window.sourceAppearance.status,
      sourceExpiresAt: window.sourceAppearance.expiresAt,
      resolvedPlanetName: window.resolvedAppearance?.planet.name ?? null,
    })),
  }
}

const updateOrCreateStatusMessage = async (input: { channelId: string; messageId: string | null; recreate: boolean; pin: boolean; payload: DiscordMessagePayload }) => {
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
  const copy = copyFor(snapshot.statusLocale)
  const roadmapPayload: DiscordMessagePayload = {
    content: `${copy.roadmapContentPrefix}: ${snapshot.clan.name} ${copy.roadmapTitleSuffix}`,
    embeds: [buildClanRoadmapStatusEmbed(snapshot)],
    allowed_mentions: { parse: [] },
  }
  const planetsPayload: DiscordMessagePayload = {
    content: `${copy.siriusContentPrefix}: ${snapshot.clan.name} ${copy.siriusTitleSuffix}`,
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
