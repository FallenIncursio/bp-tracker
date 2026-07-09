import { Router } from 'express'
import {
  createClanJourneyStopSchema,
  createSiriusAppearanceSchema,
  replaceSiriusSlotsSchema,
  reorderClanJourneyStopsSchema,
  updateClanJourneyStopSchema,
  updateSiriusAppearanceSchema,
  upsertSiriusSlotSchema,
} from '@bp-tracker/contracts'
import type { BlueprintSlotGroup, Prisma, SiriusAppearanceStatus, SiriusEnemyType, SiriusPlanetAppearance } from '../generated/prisma/client.js'
import { prisma } from '../utils/prisma.js'
import { asyncHandler, HttpError, routeParam } from '../utils/http.js'
import { hasClanRole, requireClanRole, requireUser } from '../auth/auth.middleware.js'
import { slotGroupsForRing, techTierForRing, validateSiriusSlotShape } from './sirius.rules.js'
import { blueprintSummaryInclude, serializeBlueprintSummary } from '../blueprints/blueprint.dto.js'
import { backfillDropEventsForClan, syncDropEventsForAppearance } from './drop-events.js'
import {
  backfillSpawnWindowsForClan,
  deriveSpawnWindowStatus,
  isValidNextSpawnAt,
  nextSpawnAtForRing,
  normalizeInvalidSpawnSchedulesForClan,
  syncSpawnWindowForAppearance,
} from './spawn-windows.js'
import { scheduleClanDiscordStatusPublish } from '../notifications/discord-status.service.js'

export const siriusRouter = Router()

type SlotStatusUser = {
  userId: string
  displayName: string
}

type SlotCountSummary = {
  owned: number
  missing: number
  wanted: number
  unknown: number
  users: {
    missing: SlotStatusUser[]
    wanted: SlotStatusUser[]
  }
}

const stringQuery = (value: unknown) => (typeof value === 'string' && value.trim() ? value.trim() : undefined)
const intQuery = (value: unknown) => {
  const parsed = typeof value === 'string' ? Number(value) : Number.NaN
  return Number.isInteger(parsed) ? parsed : undefined
}
const visibleAppearanceStatuses: SiriusAppearanceStatus[] = ['ACTIVE', 'UPCOMING']

const statusForAppearance = (observedAt: Date, expiresAt: Date): SiriusAppearanceStatus => {
  const now = new Date()
  if (expiresAt <= now) return 'EXPIRED'
  return observedAt > now ? 'UPCOMING' : 'ACTIVE'
}

const ensureValidSiriusTimeline = (input: { observedAt: Date; expiresAt: Date; nextSpawnAt?: Date | null }) => {
  if (input.expiresAt.getTime() <= input.observedAt.getTime()) {
    throw new HttpError(400, 'Sirius expiry time must be after the observed/start time.')
  }
  if (!isValidNextSpawnAt(input.expiresAt, input.nextSpawnAt)) {
    throw new HttpError(400, 'Sirius next spawn time must be after the planet expiry time.')
  }
}

const syncAppearanceStatuses = async () => {
  const now = new Date()
  await prisma.siriusPlanetAppearance.updateMany({
    where: {
      status: { in: visibleAppearanceStatuses },
      expiresAt: { lte: now },
    },
    data: { status: 'EXPIRED' },
  })
  await prisma.siriusPlanetAppearance.updateMany({
    where: {
      status: 'UPCOMING',
      observedAt: { lte: now },
      expiresAt: { gt: now },
    },
    data: { status: 'ACTIVE' },
  })
}

const ensureSlotAllowedForAppearance = async (
  appearance: Pick<SiriusPlanetAppearance, 'ring'>,
  input: { slotGroup: BlueprintSlotGroup; enemyType?: SiriusEnemyType | null; blueprintId: string }
) => {
  validateSiriusSlotShape(appearance.ring, input)

  const rule = await prisma.siriusBlueprintDropRule.findFirst({
    where: {
      ring: appearance.ring,
      slotGroup: input.slotGroup,
      blueprintId: input.blueprintId,
      OR: [{ enemyType: input.enemyType ?? null }, { enemyType: null }],
    },
  })

  if (!rule) {
    throw new HttpError(400, 'This blueprint cannot drop in the selected Sirius ring and slot.')
  }
}

const resolveAppearancePlanet = async (input: { planetId?: string; planetName?: string; ring: number }) => {
  if (input.planetId) {
    const planet = await prisma.siriusPlanet.update({
      where: { id: input.planetId },
      data: { ring: input.ring, isKnown: true },
    })
    return planet
  }

  const name = input.planetName!.trim()
  return prisma.siriusPlanet.upsert({
    where: { name },
    update: { ring: input.ring, isKnown: true },
    create: { name, ring: input.ring, isKnown: true },
  })
}

const ensureCanEditAppearance = async (req: Parameters<typeof hasClanRole>[0], appearanceId: string) => {
  const appearance = await prisma.siriusPlanetAppearance.findUnique({ where: { id: appearanceId } })
  if (!appearance) {
    throw new HttpError(404, 'Sirius appearance not found.')
  }
  if (!hasClanRole(req, appearance.clanId, 'COMMANDER')) {
    throw new HttpError(403, 'Commander role required for this clan.')
  }
  return appearance
}

const buildSlotCounts = async (clanId: string, blueprintIds: string[], includeStatusUsers = true) => {
  const uniqueIds = Array.from(new Set(blueprintIds))
  if (uniqueIds.length === 0) {
    return new Map<string, SlotCountSummary>()
  }
  const trackableBlueprints = await prisma.blueprint.findMany({
    where: { id: { in: uniqueIds }, rarity: { not: 'COSMETIC' } },
    select: { id: true },
  })
  const trackableIds = trackableBlueprints.map(blueprint => blueprint.id)
  if (trackableIds.length === 0) {
    return new Map<string, SlotCountSummary>()
  }

  const memberships = await prisma.clanMembership.findMany({
    where: { clanId, status: 'ACTIVE', trackingExcluded: false },
    select: { userId: true, user: { select: { displayName: true } } },
    orderBy: { user: { displayName: 'asc' } },
  })
  const users = memberships.map(membership => ({
    userId: membership.userId,
    displayName: membership.user.displayName,
  }))
  const userIds = users.map(user => user.userId)
  const statuses = await prisma.userBlueprintStatus.findMany({
    where: { userId: { in: userIds }, blueprintId: { in: trackableIds } },
    select: { userId: true, blueprintId: true, status: true },
  })

  const statusByUserAndBlueprint = new Map<string, string>()
  for (const status of statuses) {
    statusByUserAndBlueprint.set(`${status.userId}:${status.blueprintId}`, status.status)
  }

  const counts = new Map<string, SlotCountSummary>()
  for (const blueprintId of trackableIds) {
    const item: SlotCountSummary = {
      owned: 0,
      missing: 0,
      wanted: 0,
      unknown: 0,
      users: {
        missing: [],
        wanted: [],
      },
    }

    for (const user of users) {
      const status = statusByUserAndBlueprint.get(`${user.userId}:${blueprintId}`)
      if (status === 'OWNED') {
        item.owned += 1
      } else if (status === 'WANTED') {
        item.wanted += 1
        if (includeStatusUsers) item.users.wanted.push(user)
      } else {
        item.missing += 1
        if (includeStatusUsers) item.users.missing.push(user)
      }
    }

    counts.set(blueprintId, item)
  }

  return counts
}

const getTrackingMemberCounts = async (clanId: string) => {
  const [counted, excluded] = await prisma.$transaction([
    prisma.clanMembership.count({ where: { clanId, status: 'ACTIVE', trackingExcluded: false } }),
    prisma.clanMembership.count({ where: { clanId, status: 'ACTIVE', trackingExcluded: true } }),
  ])

  return {
    counted,
    excluded,
    active: counted + excluded,
  }
}

const journeyStopInclude = {
  planet: true,
  appearance: {
    include: {
      planet: true,
      slots: {
        select: {
          blueprintId: true,
        },
      },
    },
  },
} satisfies Prisma.ClanJourneyStopInclude

type JourneyStopWithRelations = Prisma.ClanJourneyStopGetPayload<{ include: typeof journeyStopInclude }>
type JourneyWarning =
  | 'UNLINKED_PLANET'
  | 'ARRIVAL_OVERDUE'
  | 'DEPARTURE_OVERDUE'
  | 'PLANET_EXPIRED'
  | 'ARRIVES_AFTER_EXPIRY'

const ensureValidJourneyTimes = (input: { arriveAt?: Date | null; departAt?: Date | null }) => {
  if (input.arriveAt && input.departAt && input.departAt.getTime() <= input.arriveAt.getTime()) {
    throw new HttpError(400, 'Journey departure time must be after the arrival time.')
  }
}

const normalizeNullableString = (value: string | null | undefined) => {
  if (value === null) return null
  const trimmed = value?.trim()
  return trimmed ? trimmed : undefined
}

const parseOptionalDate = (value: string | null | undefined) => {
  if (value === null) return null
  if (!value) return undefined
  return new Date(value)
}

const resolveJourneyTarget = async (input: { clanId: string; appearanceId?: string | null; planetId?: string | null; planetName?: string | null; ring: number }) => {
  if (input.appearanceId) {
    const appearance = await prisma.siriusPlanetAppearance.findUnique({
      where: { id: input.appearanceId },
      include: { planet: true },
    })
    if (!appearance) {
      throw new HttpError(404, 'Sirius appearance not found.')
    }
    if (appearance.clanId !== input.clanId) {
      throw new HttpError(403, 'Sirius appearance belongs to another clan.')
    }
    return {
      appearanceId: appearance.id,
      planetId: appearance.planetId,
      planetName: appearance.planet.name,
      ring: appearance.ring,
    }
  }

  if (input.planetId) {
    const planet = await prisma.siriusPlanet.findUnique({ where: { id: input.planetId } })
    if (!planet) {
      throw new HttpError(404, 'Sirius planet not found.')
    }
    return {
      appearanceId: null,
      planetId: planet.id,
      planetName: planet.name,
      ring: input.ring,
    }
  }

  return {
    appearanceId: null,
    planetId: null,
    planetName: normalizeNullableString(input.planetName) ?? null,
    ring: input.ring,
  }
}

const resolveJourneyStop = async (stopId: string) => {
  const stop = await prisma.clanJourneyStop.findUnique({
    where: { id: stopId },
    include: journeyStopInclude,
  })
  if (!stop) {
    throw new HttpError(404, 'Journey stop not found.')
  }
  return stop
}

const ensureCanEditJourneyStop = async (req: Parameters<typeof hasClanRole>[0], stopId: string) => {
  const stop = await resolveJourneyStop(stopId)
  if (!hasClanRole(req, stop.clanId, 'COMMANDER')) {
    throw new HttpError(403, 'Commander role required for this clan.')
  }
  return stop
}

const getNextJourneySortOrder = async (clanId: string) => {
  const lastStop = await prisma.clanJourneyStop.findFirst({
    where: { clanId },
    orderBy: [{ sortOrder: 'desc' }, { createdAt: 'desc' }],
    select: { sortOrder: true },
  })
  return (lastStop?.sortOrder ?? 0) + 10
}

const normalizeCurrentJourneyStop = async (clanId: string, currentStopId: string) => {
  await prisma.clanJourneyStop.updateMany({
    where: {
      clanId,
      id: { not: currentStopId },
      status: 'CURRENT',
    },
    data: { status: 'COMPLETED' },
  })
}

const loadJourneyStopsForClan = async (clanId: string) =>
  prisma.clanJourneyStop.findMany({
    where: { clanId },
    include: journeyStopInclude,
    orderBy: [{ sortOrder: 'asc' }, { arriveAt: 'asc' }, { createdAt: 'asc' }],
  })

const journeyWarningsForStop = (stop: JourneyStopWithRelations, now = new Date()): JourneyWarning[] => {
  const warnings = new Set<JourneyWarning>()

  if (!stop.appearanceId) {
    warnings.add('UNLINKED_PLANET')
  }
  if (stop.status === 'PLANNED' && stop.arriveAt && stop.arriveAt < now) {
    warnings.add('ARRIVAL_OVERDUE')
  }
  if (stop.status === 'CURRENT' && stop.departAt && stop.departAt < now) {
    warnings.add('DEPARTURE_OVERDUE')
  }
  if (stop.appearance?.status === 'EXPIRED' && (stop.status === 'PLANNED' || stop.status === 'CURRENT')) {
    warnings.add('PLANET_EXPIRED')
  }
  if (stop.arriveAt && stop.appearance?.expiresAt && stop.arriveAt > stop.appearance.expiresAt) {
    warnings.add('ARRIVES_AFTER_EXPIRY')
  }

  return Array.from(warnings)
}

const serializeJourneyStop = (stop: JourneyStopWithRelations, countsByBlueprintId: Map<string, SlotCountSummary>) => {
  const planet = stop.planet ?? stop.appearance?.planet ?? null
  const linkedBlueprintIds = stop.appearance?.slots.map(slot => slot.blueprintId).filter((id): id is string => Boolean(id)) ?? []
  const metrics = linkedBlueprintIds.reduce(
    (summary, blueprintId) => {
      const counts = countsByBlueprintId.get(blueprintId)
      if (!counts) return summary
      summary.owned += counts.owned
      summary.missing += counts.missing
      summary.wanted += counts.wanted
      return summary
    },
    { owned: 0, missing: 0, wanted: 0 }
  )

  return {
    id: stop.id,
    clanId: stop.clanId,
    appearanceId: stop.appearanceId,
    planetId: stop.planetId,
    planetName: planet?.name ?? stop.planetName ?? null,
    ring: stop.ring,
    arriveAt: stop.arriveAt,
    departAt: stop.departAt,
    status: stop.status,
    certainty: stop.certainty,
    sortOrder: stop.sortOrder,
    notes: stop.notes,
    warnings: journeyWarningsForStop(stop),
    metrics,
    planet: planet
      ? {
          id: planet.id,
          name: planet.name,
          ring: planet.ring,
        }
      : null,
    appearance: stop.appearance
      ? {
          id: stop.appearance.id,
          ring: stop.appearance.ring,
          techTier: stop.appearance.techTier,
          observedAt: stop.appearance.observedAt,
          expiresAt: stop.appearance.expiresAt,
          nextSpawnAt: stop.appearance.nextSpawnAt,
          status: stop.appearance.status,
          planet: stop.appearance.planet,
        }
      : null,
    createdAt: stop.createdAt,
    updatedAt: stop.updatedAt,
  }
}

const listSerializedJourneyStops = async (clanId: string) => {
  const stops = await loadJourneyStopsForClan(clanId)
  const blueprintIds = stops.flatMap(stop => stop.appearance?.slots.map(slot => slot.blueprintId).filter((id): id is string => Boolean(id)) ?? [])
  const countsByBlueprintId = await buildSlotCounts(clanId, blueprintIds)
  return stops.map(stop => serializeJourneyStop(stop, countsByBlueprintId))
}

siriusRouter.get(
  '/planets',
  asyncHandler(async (_req, res) => {
    const planets = await prisma.siriusPlanet.findMany({ orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }] })
    res.json({ planets })
  })
)

siriusRouter.get(
  '/drop-rules',
  asyncHandler(async (req, res) => {
    const ring = intQuery(req.query.ring)
    if (!ring || ring < 1 || ring > 5) {
      throw new HttpError(400, 'ring query parameter must be between 1 and 5.')
    }

    const slotGroup = stringQuery(req.query.slotGroup) as BlueprintSlotGroup | undefined
    const rules = await prisma.siriusBlueprintDropRule.findMany({
      where: {
        ring,
        ...(slotGroup ? { slotGroup } : {}),
      },
      include: {
        blueprint: {
          include: blueprintSummaryInclude,
        },
      },
    })

    const seenBlueprintIds = new Set<string>()
    const blueprints = rules
      .filter(rule => {
        if (seenBlueprintIds.has(rule.blueprintId)) return false
        seenBlueprintIds.add(rule.blueprintId)
        return true
      })
      .map(rule => serializeBlueprintSummary(rule.blueprint))
      .sort((a, b) => a.nameDe.localeCompare(b.nameDe, 'de'))

    res.json({
      ring,
      techTier: techTierForRing(ring),
      slotGroups: slotGroupsForRing(ring),
      blueprints,
    })
  })
)

siriusRouter.get(
  '/clans/:clanId/active',
  asyncHandler(async (req, res) => {
    await syncAppearanceStatuses()
    const clanId = routeParam(req, 'clanId')
    const appearances = await prisma.siriusPlanetAppearance.findMany({
      where: {
        clanId,
        status: { in: visibleAppearanceStatuses },
      },
      include: {
        planet: true,
        slots: {
          include: {
            blueprint: {
              include: blueprintSummaryInclude,
            },
          },
          orderBy: [{ phase: 'asc' }, { slotGroup: 'asc' }, { createdAt: 'asc' }],
        },
      },
      orderBy: [{ expiresAt: 'asc' }, { planet: { sortOrder: 'asc' } }],
    })

    const [counts, memberCounts] = await Promise.all([
      buildSlotCounts(
        clanId,
        appearances.flatMap(appearance => appearance.slots.map(slot => slot.blueprintId).filter((id): id is string => Boolean(id))),
        hasClanRole(req, clanId, 'MEMBER')
      ),
      getTrackingMemberCounts(clanId),
    ])

    res.json({
      memberCounts,
      appearances: appearances.map(appearance => ({
        id: appearance.id,
        planet: appearance.planet,
        ring: appearance.ring,
        techTier: appearance.techTier,
        observedAt: appearance.observedAt,
        expiresAt: appearance.expiresAt,
        nextSpawnAt: appearance.nextSpawnAt,
        status: appearance.status,
        notes: appearance.notes,
        slots: appearance.slots.map(slot => ({
          id: slot.id,
          phase: slot.phase,
          slotGroup: slot.slotGroup,
          enemyType: slot.enemyType,
          locationName: slot.locationName,
          rawBlueprintName: slot.rawBlueprintName,
          confidence: slot.confidence,
          blueprint: slot.blueprint ? serializeBlueprintSummary(slot.blueprint) : null,
          counts: slot.blueprintId ? counts.get(slot.blueprintId) : null,
        })),
      })),
    })
  })
)

siriusRouter.get(
  '/clans/:clanId/spawn-plan',
  asyncHandler(async (req, res) => {
    await syncAppearanceStatuses()
    const clanId = routeParam(req, 'clanId')
    await normalizeInvalidSpawnSchedulesForClan(prisma, clanId)
    await backfillSpawnWindowsForClan(prisma, clanId)

    const now = new Date()
    const recentResolvedSince = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
    const spawnWindows = await prisma.siriusSpawnWindow.findMany({
      where: {
        clanId,
        status: { not: 'CANCELLED' },
        OR: [{ status: 'PENDING' }, { expectedAt: { gte: recentResolvedSince } }],
      },
      include: {
        sourceAppearance: {
          include: {
            planet: true,
          },
        },
        resolvedAppearance: {
          include: {
            planet: true,
          },
        },
      },
      orderBy: [{ expectedAt: 'asc' }, { createdAt: 'asc' }],
    })

    const statusOrder = {
      OVERDUE: 0,
      WAITING_FOR_SPAWN: 1,
      ACTIVE_SOURCE: 2,
      RESOLVED: 3,
      CANCELLED: 4,
    }

    const rows = spawnWindows
      .map(spawnWindow => {
        const derivedStatus = deriveSpawnWindowStatus({
          status: spawnWindow.status,
          expectedAt: spawnWindow.expectedAt,
          resolvedAppearanceId: spawnWindow.resolvedAppearanceId,
          sourceStatus: spawnWindow.sourceAppearance.status,
          sourceExpiresAt: spawnWindow.sourceAppearance.expiresAt,
          now,
        })

        return {
          id: spawnWindow.id,
          expectedAt: spawnWindow.expectedAt,
          status: spawnWindow.status,
          derivedStatus,
          notes: spawnWindow.notes,
          sourceAppearance: {
            id: spawnWindow.sourceAppearance.id,
            ring: spawnWindow.sourceAppearance.ring,
            techTier: spawnWindow.sourceAppearance.techTier,
            observedAt: spawnWindow.sourceAppearance.observedAt,
            expiresAt: spawnWindow.sourceAppearance.expiresAt,
            nextSpawnAt: spawnWindow.sourceAppearance.nextSpawnAt,
            status: spawnWindow.sourceAppearance.status,
            planet: spawnWindow.sourceAppearance.planet,
          },
          resolvedAppearance: spawnWindow.resolvedAppearance
            ? {
                id: spawnWindow.resolvedAppearance.id,
                ring: spawnWindow.resolvedAppearance.ring,
                techTier: spawnWindow.resolvedAppearance.techTier,
                observedAt: spawnWindow.resolvedAppearance.observedAt,
                expiresAt: spawnWindow.resolvedAppearance.expiresAt,
                nextSpawnAt: spawnWindow.resolvedAppearance.nextSpawnAt,
                status: spawnWindow.resolvedAppearance.status,
                planet: spawnWindow.resolvedAppearance.planet,
              }
            : null,
        }
      })
      .sort((left, right) => {
        const statusDiff = statusOrder[left.derivedStatus] - statusOrder[right.derivedStatus]
        if (statusDiff !== 0) return statusDiff
        return new Date(left.expectedAt).getTime() - new Date(right.expectedAt).getTime()
      })

    res.json({ spawnWindows: rows })
  })
)

siriusRouter.get(
  '/clans/:clanId/journey',
  requireClanRole('MEMBER'),
  asyncHandler(async (req, res) => {
    await syncAppearanceStatuses()
    const clanId = routeParam(req, 'clanId')
    const stops = await listSerializedJourneyStops(clanId)
    res.json({ stops })
  })
)

siriusRouter.post(
  '/clans/:clanId/journey',
  requireClanRole('COMMANDER'),
  asyncHandler(async (req, res) => {
    const input = createClanJourneyStopSchema.parse(req.body)
    const clanId = routeParam(req, 'clanId')
    const target = await resolveJourneyTarget({
      clanId,
      appearanceId: input.appearanceId,
      planetId: input.planetId,
      planetName: input.planetName,
      ring: input.ring,
    })
    const arriveAt = parseOptionalDate(input.arriveAt)
    const departAt = parseOptionalDate(input.departAt)
    ensureValidJourneyTimes({ arriveAt, departAt })

    const stop = await prisma.clanJourneyStop.create({
      data: {
        clanId,
        appearanceId: target.appearanceId,
        planetId: target.planetId,
        planetName: target.planetName,
        ring: target.ring,
        arriveAt,
        departAt,
        status: input.status,
        certainty: input.certainty,
        sortOrder: input.sortOrder ?? (await getNextJourneySortOrder(clanId)),
        notes: normalizeNullableString(input.notes) ?? null,
        createdById: req.auth!.user.id,
      },
      include: journeyStopInclude,
    })

    if (stop.status === 'CURRENT') {
      await normalizeCurrentJourneyStop(clanId, stop.id)
    }

    await prisma.auditLog.create({
      data: {
        actorUserId: req.auth!.user.id,
        action: 'sirius.journey.create',
        entityType: 'ClanJourneyStop',
        entityId: stop.id,
        afterJson: stop,
      },
    })

    const blueprintIds = stop.appearance?.slots.map(slot => slot.blueprintId).filter((id): id is string => Boolean(id)) ?? []
    const countsByBlueprintId = await buildSlotCounts(clanId, blueprintIds)
    scheduleClanDiscordStatusPublish(clanId)
    res.status(201).json({ stop: serializeJourneyStop(stop, countsByBlueprintId) })
  })
)

siriusRouter.put(
  '/clans/:clanId/journey/reorder',
  requireClanRole('COMMANDER'),
  asyncHandler(async (req, res) => {
    const input = reorderClanJourneyStopsSchema.parse(req.body)
    const clanId = routeParam(req, 'clanId')
    const stops = await prisma.clanJourneyStop.findMany({
      where: { clanId, id: { in: input.stopIds } },
      select: { id: true },
    })

    if (stops.length !== input.stopIds.length) {
      throw new HttpError(404, 'One or more journey stops were not found for this clan.')
    }

    await prisma.$transaction(
      input.stopIds.map((stopId, index) =>
        prisma.clanJourneyStop.update({
          where: { id: stopId },
          data: { sortOrder: (index + 1) * 10 },
        })
      )
    )

    const serializedStops = await listSerializedJourneyStops(clanId)
    scheduleClanDiscordStatusPublish(clanId)
    res.json({ stops: serializedStops })
  })
)

siriusRouter.get(
  '/clans/:clanId/history',
  asyncHandler(async (req, res) => {
    await syncAppearanceStatuses()
    const clanId = routeParam(req, 'clanId')
    await backfillDropEventsForClan(prisma, clanId)
    const [rules, events] = await Promise.all([
      prisma.siriusBlueprintDropRule.findMany({
        include: {
          blueprint: {
            include: blueprintSummaryInclude,
          },
        },
      }),
      prisma.siriusDropEvent.findMany({
        where: {
          clanId,
          blueprintId: { not: null },
        },
        include: {
          blueprint: {
            include: blueprintSummaryInclude,
          },
          planet: true,
          appearance: true,
          evidences: {
            select: {
              id: true,
              sourceType: true,
              sourceRef: true,
              revisionId: true,
              seenAt: true,
            },
            orderBy: [{ seenAt: 'desc' }, { createdAt: 'desc' }],
          },
        },
        orderBy: [{ dropAt: 'desc' }, { createdAt: 'desc' }],
      }),
    ])

    type SiriusHistoryRow = {
      blueprint: ReturnType<typeof serializeBlueprintSummary>
      totalDrops: number
      lastDropAt: Date | null
      lastObservedAt: Date | null
      lastExpiresAt: Date | null
      lastAppearanceId: string | null
      lastPlanet: { id: string; name: string; ring: number | null } | null
      lastStatus: SiriusAppearanceStatus | null
      lastSlotGroup: BlueprintSlotGroup | null
      lastEnemyType: SiriusEnemyType | null
      lastPartsRequired: number | null
      lastSourceType: string | null
      lastSourceRef: string | null
      lastSeenAt: Date | null
      evidenceCount: number
      active: boolean
    }
    const historyRows = new Map<string, SiriusHistoryRow>()

    const ensureHistoryRow = (blueprint: (typeof rules)[number]['blueprint']): SiriusHistoryRow => {
      const existing = historyRows.get(blueprint.id)
      if (existing) return existing

      const created: SiriusHistoryRow = {
        blueprint: serializeBlueprintSummary(blueprint),
        totalDrops: 0,
        lastDropAt: null,
        lastObservedAt: null,
        lastExpiresAt: null,
        lastAppearanceId: null,
        lastPlanet: null,
        lastStatus: null,
        lastSlotGroup: null,
        lastEnemyType: null,
        lastPartsRequired: blueprint.partsRequired,
        lastSourceType: null,
        lastSourceRef: null,
        lastSeenAt: null,
        evidenceCount: 0,
        active: false,
      }
      historyRows.set(blueprint.id, created)
      return created
    }

    for (const rule of rules) {
      ensureHistoryRow(rule.blueprint)
    }

    for (const event of events) {
      if (!event.blueprint) continue
      const row = ensureHistoryRow(event.blueprint)
      const dropAt = event.dropAt
      const eventStatus =
        event.appearance?.status ?? (event.expiresAt ? statusForAppearance(event.observedAt ?? event.dropAt, event.expiresAt) : 'EXPIRED')
      row.totalDrops += 1
      row.evidenceCount += event.evidences.length
      if (visibleAppearanceStatuses.includes(eventStatus)) {
        row.active = true
      }
      if (!row.lastDropAt || dropAt.getTime() > row.lastDropAt.getTime()) {
        row.lastDropAt = dropAt
        row.lastObservedAt = event.observedAt
        row.lastExpiresAt = event.expiresAt
        row.lastAppearanceId = event.appearanceId
        row.lastPlanet = event.planet
          ? {
              id: event.planet.id,
              name: event.planet.name,
              ring: event.ring,
            }
          : event.rawPlanetName
            ? {
                id: event.id,
                name: event.rawPlanetName,
                ring: event.ring,
              }
            : null
        row.lastStatus = eventStatus
        row.lastSlotGroup = event.slotGroup
        row.lastEnemyType = event.enemyType
        row.lastPartsRequired = event.partsRequired ?? event.blueprint.partsRequired
        row.lastSourceType = event.sourceType
        row.lastSourceRef = event.sourceRef
        row.lastSeenAt = event.lastSeenAt ?? event.evidences[0]?.seenAt ?? null
      }
    }

    const history = Array.from(historyRows.values()).sort((a, b) => {
      const timeDiff = (b.lastDropAt?.getTime() ?? 0) - (a.lastDropAt?.getTime() ?? 0)
      if (timeDiff !== 0) return timeDiff
      return a.blueprint.nameDe.localeCompare(b.blueprint.nameDe, 'de')
    })

    res.json({ history })
  })
)

siriusRouter.patch(
  '/journey/:stopId',
  requireUser,
  asyncHandler(async (req, res) => {
    const stopId = routeParam(req, 'stopId')
    const existing = await ensureCanEditJourneyStop(req, stopId)
    const input = updateClanJourneyStopSchema.parse(req.body)
    const hasTargetChange = input.appearanceId !== undefined || input.planetId !== undefined || input.planetName !== undefined
    const target = hasTargetChange
      ? await resolveJourneyTarget({
          clanId: existing.clanId,
          appearanceId: input.appearanceId,
          planetId: input.planetId,
          planetName: input.planetName,
          ring: input.ring ?? existing.ring,
        })
      : null
    const arriveAt = input.arriveAt !== undefined ? parseOptionalDate(input.arriveAt) : existing.arriveAt
    const departAt = input.departAt !== undefined ? parseOptionalDate(input.departAt) : existing.departAt
    ensureValidJourneyTimes({ arriveAt, departAt })

    const stop = await prisma.clanJourneyStop.update({
      where: { id: existing.id },
      data: {
        appearanceId: target ? target.appearanceId : undefined,
        planetId: target ? target.planetId : undefined,
        planetName: target ? target.planetName : undefined,
        ring: target?.ring ?? input.ring,
        arriveAt: input.arriveAt !== undefined ? arriveAt : undefined,
        departAt: input.departAt !== undefined ? departAt : undefined,
        status: input.status,
        certainty: input.certainty,
        sortOrder: input.sortOrder,
        notes: input.notes === undefined ? undefined : normalizeNullableString(input.notes) ?? null,
      },
      include: journeyStopInclude,
    })

    if (stop.status === 'CURRENT') {
      await normalizeCurrentJourneyStop(stop.clanId, stop.id)
    }

    await prisma.auditLog.create({
      data: {
        actorUserId: req.auth!.user.id,
        action: 'sirius.journey.update',
        entityType: 'ClanJourneyStop',
        entityId: stop.id,
        beforeJson: existing,
        afterJson: stop,
      },
    })

    const blueprintIds = stop.appearance?.slots.map(slot => slot.blueprintId).filter((id): id is string => Boolean(id)) ?? []
    const countsByBlueprintId = await buildSlotCounts(stop.clanId, blueprintIds)
    scheduleClanDiscordStatusPublish(stop.clanId)
    res.json({ stop: serializeJourneyStop(stop, countsByBlueprintId) })
  })
)

siriusRouter.delete(
  '/journey/:stopId',
  requireUser,
  asyncHandler(async (req, res) => {
    const stopId = routeParam(req, 'stopId')
    const existing = await ensureCanEditJourneyStop(req, stopId)
    await prisma.clanJourneyStop.delete({ where: { id: existing.id } })
    await prisma.auditLog.create({
      data: {
        actorUserId: req.auth!.user.id,
        action: 'sirius.journey.delete',
        entityType: 'ClanJourneyStop',
        entityId: existing.id,
        beforeJson: existing,
      },
    })
    scheduleClanDiscordStatusPublish(existing.clanId)
    res.status(204).send()
  })
)

siriusRouter.post(
  '/clans/:clanId/appearances',
  requireClanRole('COMMANDER'),
  asyncHandler(async (req, res) => {
    const input = createSiriusAppearanceSchema.parse(req.body)
    const clanId = routeParam(req, 'clanId')
    const spawnWindowToResolve = input.resolvesSpawnWindowId
      ? await prisma.siriusSpawnWindow.findUnique({ where: { id: input.resolvesSpawnWindowId } })
      : null

    if (input.resolvesSpawnWindowId && !spawnWindowToResolve) {
      throw new HttpError(404, 'Sirius spawn window not found.')
    }
    if (spawnWindowToResolve?.clanId !== undefined && spawnWindowToResolve.clanId !== clanId) {
      throw new HttpError(403, 'Spawn window belongs to another clan.')
    }
    if (spawnWindowToResolve?.status === 'RESOLVED') {
      throw new HttpError(409, 'Sirius spawn window is already resolved.')
    }
    if (spawnWindowToResolve?.status === 'CANCELLED') {
      throw new HttpError(409, 'Sirius spawn window has been cancelled.')
    }

    const planet = await resolveAppearancePlanet(input)
    const observedAt = input.observedAt ? new Date(input.observedAt) : new Date()
    const expiresAt = new Date(input.expiresAt)
    const nextSpawnAt = nextSpawnAtForRing(input.ring, expiresAt)
    ensureValidSiriusTimeline({ observedAt, expiresAt, nextSpawnAt })

    const appearance = await prisma.siriusPlanetAppearance.create({
      data: {
        clanId,
        planetId: planet.id,
        ring: input.ring,
        techTier: techTierForRing(input.ring),
        observedAt,
        expiresAt,
        nextSpawnAt,
        status: statusForAppearance(observedAt, expiresAt),
        notes: input.notes,
        createdById: req.auth!.user.id,
      },
      include: { planet: true, slots: true },
    })

    if (spawnWindowToResolve) {
      await prisma.siriusSpawnWindow.update({
        where: { id: spawnWindowToResolve.id },
        data: {
          status: 'RESOLVED',
          resolvedAppearanceId: appearance.id,
        },
      })
    }

    await syncSpawnWindowForAppearance(prisma, appearance.id, req.auth!.user.id)

    await prisma.auditLog.create({
      data: {
        actorUserId: req.auth!.user.id,
        action: 'sirius.appearance.create',
        entityType: 'SiriusPlanetAppearance',
        entityId: appearance.id,
        afterJson: { appearance, resolvesSpawnWindowId: input.resolvesSpawnWindowId ?? null },
      },
    })

    scheduleClanDiscordStatusPublish(clanId)
    res.status(201).json({ appearance })
  })
)

siriusRouter.patch(
  '/appearances/:appearanceId',
  requireUser,
  asyncHandler(async (req, res) => {
    const appearanceId = routeParam(req, 'appearanceId')
    const existing = await ensureCanEditAppearance(req, appearanceId)
    const input = updateSiriusAppearanceSchema.parse(req.body)
    const planet =
      input.planetId || input.planetName
        ? await resolveAppearancePlanet({
            planetId: input.planetId,
            planetName: input.planetName,
            ring: input.ring ?? existing.ring,
          })
        : null
    const nextObservedAt = input.observedAt ? new Date(input.observedAt) : existing.observedAt
    const nextExpiresAt = input.expiresAt ? new Date(input.expiresAt) : existing.expiresAt
    const nextRing = input.ring ?? existing.ring
    const nextSpawnAt =
      nextRing === 5 ? (input.expiresAt || input.ring ? nextSpawnAtForRing(nextRing, nextExpiresAt) : existing.nextSpawnAt) : null
    ensureValidSiriusTimeline({ observedAt: nextObservedAt, expiresAt: nextExpiresAt, nextSpawnAt })

    const appearance = await prisma.siriusPlanetAppearance.update({
      where: { id: existing.id },
      data: {
        planetId: planet?.id,
        ring: input.ring,
        techTier: input.ring ? techTierForRing(input.ring) : undefined,
        observedAt: input.observedAt ? nextObservedAt : undefined,
        expiresAt: input.expiresAt ? nextExpiresAt : undefined,
        nextSpawnAt: input.expiresAt || input.ring ? nextSpawnAt : undefined,
        status: input.observedAt || input.expiresAt ? statusForAppearance(nextObservedAt, nextExpiresAt) : undefined,
        notes: input.notes,
      },
      include: { planet: true, slots: true },
    })

    await syncSpawnWindowForAppearance(prisma, appearance.id, req.auth!.user.id)

    scheduleClanDiscordStatusPublish(appearance.clanId)
    res.json({ appearance })
  })
)

siriusRouter.post(
  '/appearances/:appearanceId/slots',
  requireUser,
  asyncHandler(async (req, res) => {
    const appearanceId = routeParam(req, 'appearanceId')
    const appearance = await ensureCanEditAppearance(req, appearanceId)
    const input = upsertSiriusSlotSchema.parse(req.body)
    await ensureSlotAllowedForAppearance(appearance, input)

    const slot = await prisma.siriusPlanetBlueprintSlot.create({
      data: {
        appearanceId: appearance.id,
        phase: 'CURRENT',
        slotGroup: input.slotGroup,
        enemyType: input.enemyType ?? null,
        locationName: null,
        blueprintId: input.blueprintId,
        rawBlueprintName: null,
        confidence: 1,
        createdById: req.auth!.user.id,
      },
      include: { blueprint: true },
    })

    await prisma.auditLog.create({
      data: {
        actorUserId: req.auth!.user.id,
        action: 'sirius.slot.create',
        entityType: 'SiriusPlanetBlueprintSlot',
        entityId: slot.id,
        afterJson: slot,
      },
    })

    await syncDropEventsForAppearance(prisma, appearance.id)

    scheduleClanDiscordStatusPublish(appearance.clanId)
    res.status(201).json({ slot })
  })
)

siriusRouter.put(
  '/appearances/:appearanceId/slots',
  requireUser,
  asyncHandler(async (req, res) => {
    const appearanceId = routeParam(req, 'appearanceId')
    const appearance = await ensureCanEditAppearance(req, appearanceId)
    const input = replaceSiriusSlotsSchema.parse(req.body)

    for (const slot of input.slots) {
      await ensureSlotAllowedForAppearance(appearance, slot)
    }

    const slots = await prisma.$transaction(async tx => {
      await tx.siriusPlanetBlueprintSlot.deleteMany({ where: { appearanceId: appearance.id } })
      for (const slot of input.slots) {
        await tx.siriusPlanetBlueprintSlot.create({
          data: {
            appearanceId: appearance.id,
            phase: 'CURRENT',
            slotGroup: slot.slotGroup,
            enemyType: slot.enemyType ?? null,
            locationName: null,
            blueprintId: slot.blueprintId,
            rawBlueprintName: null,
            confidence: 1,
            createdById: req.auth!.user.id,
          },
        })
      }

      return tx.siriusPlanetBlueprintSlot.findMany({
        where: { appearanceId: appearance.id },
        include: { blueprint: true },
        orderBy: [{ slotGroup: 'asc' }, { enemyType: 'asc' }, { createdAt: 'asc' }],
      })
    })

    await syncDropEventsForAppearance(prisma, appearance.id)

    await prisma.auditLog.create({
      data: {
        actorUserId: req.auth!.user.id,
        action: 'sirius.slots.replace',
        entityType: 'SiriusPlanetAppearance',
        entityId: appearance.id,
        afterJson: { slotCount: slots.length },
      },
    })

    scheduleClanDiscordStatusPublish(appearance.clanId)
    res.json({ slots })
  })
)

siriusRouter.patch(
  '/slots/:slotId',
  requireUser,
  asyncHandler(async (req, res) => {
    const slotId = routeParam(req, 'slotId')
    const current = await prisma.siriusPlanetBlueprintSlot.findUnique({
      where: { id: slotId },
      include: { appearance: true },
    })
    if (!current) {
      throw new HttpError(404, 'Sirius slot not found.')
    }
    if (!hasClanRole(req, current.appearance.clanId, 'COMMANDER')) {
      throw new HttpError(403, 'Commander role required for this clan.')
    }

    const input = upsertSiriusSlotSchema.partial().parse(req.body)
    if (input.slotGroup || input.blueprintId || input.enemyType !== undefined) {
      await ensureSlotAllowedForAppearance(current.appearance, {
        slotGroup: input.slotGroup ?? current.slotGroup,
        blueprintId: input.blueprintId ?? current.blueprintId ?? '',
        enemyType: input.enemyType === undefined ? current.enemyType : input.enemyType,
      })
    }
    const slot = await prisma.siriusPlanetBlueprintSlot.update({
      where: { id: current.id },
      data: {
        slotGroup: input.slotGroup,
        enemyType: input.enemyType ?? undefined,
        blueprintId: input.blueprintId,
        locationName: null,
        rawBlueprintName: null,
        confidence: 1,
      },
      include: { blueprint: true },
    })

    await syncDropEventsForAppearance(prisma, current.appearanceId)

    scheduleClanDiscordStatusPublish(current.appearance.clanId)
    res.json({ slot })
  })
)

siriusRouter.delete(
  '/slots/:slotId',
  requireUser,
  asyncHandler(async (req, res) => {
    const slotId = routeParam(req, 'slotId')
    const current = await prisma.siriusPlanetBlueprintSlot.findUnique({
      where: { id: slotId },
      include: { appearance: true },
    })
    if (!current) {
      throw new HttpError(404, 'Sirius slot not found.')
    }
    if (!hasClanRole(req, current.appearance.clanId, 'COMMANDER')) {
      throw new HttpError(403, 'Commander role required for this clan.')
    }
    await prisma.siriusPlanetBlueprintSlot.delete({ where: { id: current.id } })
    await syncDropEventsForAppearance(prisma, current.appearanceId)
    scheduleClanDiscordStatusPublish(current.appearance.clanId)
    res.status(204).send()
  })
)
