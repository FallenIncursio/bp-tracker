import { Router } from 'express'
import type { Response } from 'express'
import type { Prisma } from '../generated/prisma/client.js'
import { checkerRequestSchema } from '@bp-tracker/contracts'
import { prisma } from '../utils/prisma.js'
import { asyncHandler, HttpError, routeParam } from '../utils/http.js'
import { blueprintSummaryInclude, serializeBlueprintSummary } from '../blueprints/blueprint.dto.js'

export const checkerRouter = Router()

const normalizeCheckStatus = (status: string | null | undefined) => (status === 'OWNED' || status === 'WANTED' ? status : 'MISSING')
const includeExcludedFromQuery = (value: unknown) => value === 'true' || value === '1'
const siriusScopeFromQuery = (value: unknown) => (value === 'all-ring5' ? 'all-ring5' : 'own')

const siriusRingFiveSystems = ['Vega', 'Antares', 'Gemini', 'Mizar', 'Sol', 'Draconis', 'Sirius'] as const
const siriusRingFiveSlotGroups = ['SLOT_18', 'SLOT_14', 'SLOT_12', 'SLOT_5', 'SLOT_2'] as const
const siriusResourceTechTiers = ['OOLYTE', 'DOLOMYTE', 'CLAY', 'KENYTE'] as const

const siriusResourcesWhere = {
  system: { name: 'Sirius' },
  slotGroup: 'RESOURCE',
  siriusTechTier: { in: [...siriusResourceTechTiers] },
  rarity: { not: 'COSMETIC' },
} satisfies Prisma.BlueprintWhereInput

const siriusOwnRingFiveWhere = {
  system: { name: 'Sirius' },
  slotGroup: { in: [...siriusRingFiveSlotGroups] },
  rarity: { not: 'COSMETIC' },
} satisfies Prisma.BlueprintWhereInput

const siriusAllRingFiveWhere = {
  system: { name: { in: [...siriusRingFiveSystems] } },
  slotGroup: { in: [...siriusRingFiveSlotGroups] },
  rarity: { not: 'COSMETIC' },
} satisfies Prisma.BlueprintWhereInput

type SiriusCheckerScope = 'own' | 'all-ring5'

const siriusCheckerWhere = (scope: SiriusCheckerScope, includeResources: boolean): Prisma.BlueprintWhereInput => {
  const ringFiveWhere = scope === 'all-ring5' ? siriusAllRingFiveWhere : siriusOwnRingFiveWhere
  return includeResources ? { OR: [ringFiveWhere, siriusResourcesWhere] } : ringFiveWhere
}

const siriusCheckerCounts = async () => {
  const [ownRingFive, allRingFive, resources] = await Promise.all([
    prisma.blueprint.count({ where: siriusOwnRingFiveWhere }),
    prisma.blueprint.count({ where: siriusAllRingFiveWhere }),
    prisma.blueprint.count({ where: siriusResourcesWhere }),
  ])

  return {
    ownRingFive,
    ownWithResources: ownRingFive + resources,
    allRingFive,
    allRingFiveWithResources: allRingFive + resources,
    resources,
  }
}

const specialGroups = [
  {
    id: 'ungrouped',
    nameDe: 'Rest / unzugeordnet',
    nameEn: 'Other / unassigned',
    where: { systemId: null, rarity: { not: 'COSMETIC' } },
  },
] satisfies Array<{
  id: string
  nameDe: string
  nameEn: string
  where: Prisma.BlueprintWhereInput
}>

checkerRouter.get(
  '/ships',
  asyncHandler(async (_req, res) => {
    const ships = await prisma.ship.findMany({
      include: {
        system: true,
        requirements: true,
      },
      orderBy: [{ system: { sortOrder: 'asc' } }, { name: 'asc' }],
    })
    res.json({
      ships: ships.map(ship => ({
        id: ship.id,
        name: ship.name,
        className: ship.className,
        systemName: ship.system?.name ?? null,
        requirementCount: ship.requirements.length,
      })),
    })
  })
)

checkerRouter.get(
  '/systems',
  asyncHandler(async (_req, res) => {
    const [systems, siriusCounts] = await Promise.all([
      prisma.gameSystem.findMany({
        include: {
          blueprints: {
            where: { rarity: { not: 'COSMETIC' } },
            select: { id: true },
          },
        },
        orderBy: { sortOrder: 'asc' },
      }),
      siriusCheckerCounts(),
    ])

    res.json({
      systems: systems
        .filter(system => system.blueprints.length > 0 || system.name === 'Sirius')
        .map(system => ({
          id: system.id,
          name: system.name,
          blueprintCount: system.name === 'Sirius' ? siriusCounts.ownRingFive : system.blueprints.length,
          siriusCounts: system.name === 'Sirius' ? siriusCounts : undefined,
        })),
    })
  })
)

checkerRouter.get(
  '/systems/:systemId/check',
  asyncHandler(async (req, res) => {
    const systemId = routeParam(req, 'systemId')
    const clanId = typeof req.query.clanId === 'string' ? req.query.clanId : undefined
    if (!clanId) {
      throw new HttpError(400, 'clanId query parameter is required.')
    }
    const includeExcluded = includeExcludedFromQuery(req.query.includeExcluded)
    const includeSiriusResources = includeExcludedFromQuery(req.query.includeSiriusResources)
    const siriusScope = siriusScopeFromQuery(req.query.siriusScope)

    const system = await prisma.gameSystem.findUnique({ where: { id: systemId }, select: { name: true } })
    if (!system) {
      throw new HttpError(404, 'System not found.')
    }
    const where =
      system.name === 'Sirius'
        ? siriusCheckerWhere(siriusScope, includeSiriusResources)
        : ({ systemId, rarity: { not: 'COSMETIC' } } satisfies Prisma.BlueprintWhereInput)

    const blueprints = await prisma.blueprint.findMany({
      where,
      select: { id: true },
      orderBy: [{ slotGroup: 'asc' }, { canonicalName: 'asc' }],
    })

    if (blueprints.length === 0) {
      throw new HttpError(404, 'No blueprints found for this system.')
    }

    return runCheck({ clanId, blueprintIds: blueprints.map(blueprint => blueprint.id), includeExcluded }, res)
  })
)

checkerRouter.get(
  '/groups',
  asyncHandler(async (_req, res) => {
    const groups = await Promise.all(
      specialGroups.map(async group => ({
        id: group.id,
        nameDe: group.nameDe,
        nameEn: group.nameEn,
        blueprintCount: await prisma.blueprint.count({ where: group.where }),
      }))
    )

    res.json({ groups: groups.filter(group => group.blueprintCount > 0) })
  })
)

checkerRouter.get(
  '/groups/:groupId/check',
  asyncHandler(async (req, res) => {
    const groupId = routeParam(req, 'groupId')
    const clanId = typeof req.query.clanId === 'string' ? req.query.clanId : undefined
    if (!clanId) {
      throw new HttpError(400, 'clanId query parameter is required.')
    }
    const includeExcluded = includeExcludedFromQuery(req.query.includeExcluded)

    const group = specialGroups.find(item => item.id === groupId)
    if (!group) {
      throw new HttpError(404, 'Checker group not found.')
    }

    const blueprints = await prisma.blueprint.findMany({
      where: group.where,
      select: { id: true },
      orderBy: [{ slotGroup: 'asc' }, { canonicalName: 'asc' }],
    })

    if (blueprints.length === 0) {
      throw new HttpError(404, 'No blueprints found for this checker group.')
    }

    return runCheck({ clanId, blueprintIds: blueprints.map(blueprint => blueprint.id), includeExcluded }, res)
  })
)

checkerRouter.get(
  '/ships/:shipId',
  asyncHandler(async (req, res) => {
    const shipId = routeParam(req, 'shipId')
    const ship = await prisma.ship.findUnique({
      where: { id: shipId },
      include: {
        system: true,
        requirements: {
          include: {
            blueprint: {
              include: blueprintSummaryInclude,
            },
          },
          orderBy: { blueprint: { canonicalName: 'asc' } },
        },
      },
    })

    if (!ship) {
      throw new HttpError(404, 'Ship not found.')
    }

    res.json({ ship })
  })
)

checkerRouter.get(
  '/ships/:shipId/check',
  asyncHandler(async (req, res) => {
    const shipId = routeParam(req, 'shipId')
    const clanId = typeof req.query.clanId === 'string' ? req.query.clanId : undefined
    if (!clanId) {
      throw new HttpError(400, 'clanId query parameter is required.')
    }
    const includeExcluded = includeExcludedFromQuery(req.query.includeExcluded)

    const ship = await prisma.ship.findUnique({
      where: { id: shipId },
      include: { requirements: true },
    })
    if (!ship) {
      throw new HttpError(404, 'Ship not found.')
    }

    req.body = {
      clanId,
      blueprintIds: ship.requirements.map(requirement => requirement.blueprintId),
      includeExcluded,
    }
    return runCheck(req.body, res)
  })
)

checkerRouter.post(
  '/check',
  asyncHandler(async (req, res) => runCheck(req.body, res))
)

const runCheck = async (body: unknown, res: Response) => {
  const input = checkerRequestSchema.parse(body)
  const memberships = await prisma.clanMembership.findMany({
    where: {
      clanId: input.clanId,
      status: 'ACTIVE',
      ...(input.includeExcluded ? {} : { trackingExcluded: false }),
      ...(input.userIds?.length ? { userId: { in: input.userIds } } : {}),
    },
    include: { user: true },
    orderBy: { user: { displayName: 'asc' } },
  })

  const statuses = await prisma.userBlueprintStatus.findMany({
    where: {
      userId: { in: memberships.map(membership => membership.userId) },
      blueprintId: { in: input.blueprintIds },
    },
  })

  const blueprints = await prisma.blueprint.findMany({
    where: { id: { in: input.blueprintIds }, rarity: { not: 'COSMETIC' } },
    include: blueprintSummaryInclude,
    orderBy: [{ slotGroup: 'asc' }, { canonicalName: 'asc' }],
  })

  const statusByUserAndBlueprint = new Map<string, string>()
  for (const status of statuses) {
    statusByUserAndBlueprint.set(`${status.userId}:${status.blueprintId}`, normalizeCheckStatus(status.status))
  }

  const rows = memberships.map(membership => {
    const blueprintStatuses = blueprints.map(blueprint => ({
      ...serializeBlueprintSummary(blueprint),
      blueprintId: blueprint.id,
      status: statusByUserAndBlueprint.get(`${membership.userId}:${blueprint.id}`) ?? 'MISSING',
    }))

    return {
      userId: membership.userId,
      displayName: membership.user.displayName,
      role: membership.role,
      trackingExcluded: membership.trackingExcluded,
      trackingExcludedReason: membership.trackingExcludedReason,
      owned: blueprintStatuses.filter(item => item.status === 'OWNED').length,
      missing: blueprintStatuses.filter(item => item.status === 'MISSING').length,
      wanted: blueprintStatuses.filter(item => item.status === 'WANTED').length,
      blueprints: blueprintStatuses,
    }
  })

  res.json({
    blueprints: blueprints.map(serializeBlueprintSummary),
    rows,
  })
}
