import type { Prisma, PrismaClient, SiriusAppearanceStatus, SiriusSpawnWindowStatus } from '../generated/prisma/client.js'

type SpawnWindowDb = PrismaClient | Prisma.TransactionClient

export type SiriusSpawnWindowDerivedStatus = 'ACTIVE_SOURCE' | 'WAITING_FOR_SPAWN' | 'OVERDUE' | 'RESOLVED' | 'CANCELLED'

const oneDayMs = 24 * 60 * 60 * 1000

export const defaultNextSpawnAt = (expiresAt: Date) => new Date(expiresAt.getTime() + oneDayMs)
export const nextSpawnAtForRing = (ring: number, expiresAt: Date) => (ring === 5 ? defaultNextSpawnAt(expiresAt) : null)

export const isValidNextSpawnAt = (expiresAt: Date, nextSpawnAt: Date | null | undefined) => !nextSpawnAt || nextSpawnAt.getTime() > expiresAt.getTime()

export const deriveSpawnWindowStatus = (input: {
  status: SiriusSpawnWindowStatus
  expectedAt: Date
  resolvedAppearanceId?: string | null
  sourceStatus: SiriusAppearanceStatus
  sourceExpiresAt: Date
  now?: Date
}): SiriusSpawnWindowDerivedStatus => {
  if (input.status === 'CANCELLED') return 'CANCELLED'
  if (input.status === 'RESOLVED' || input.resolvedAppearanceId) return 'RESOLVED'

  const now = input.now ?? new Date()
  if ((input.sourceStatus === 'ACTIVE' || input.sourceStatus === 'UPCOMING') && input.sourceExpiresAt.getTime() > now.getTime()) {
    return 'ACTIVE_SOURCE'
  }
  if (input.expectedAt.getTime() > now.getTime()) {
    return 'WAITING_FOR_SPAWN'
  }
  return 'OVERDUE'
}

export const syncSpawnWindowForAppearance = async (db: SpawnWindowDb, appearanceId: string, createdById?: string | null) => {
  const appearance = await db.siriusPlanetAppearance.findUnique({
    where: { id: appearanceId },
    select: {
      id: true,
      clanId: true,
      expiresAt: true,
      nextSpawnAt: true,
      createdById: true,
    },
  })

  if (!appearance) return null

  if (!appearance.nextSpawnAt) {
    await db.siriusSpawnWindow.updateMany({
      where: {
        sourceAppearanceId: appearance.id,
        status: 'PENDING',
      },
      data: {
        status: 'CANCELLED',
      },
    })
    return null
  }

  if (!isValidNextSpawnAt(appearance.expiresAt, appearance.nextSpawnAt)) {
    await db.siriusSpawnWindow.updateMany({
      where: {
        sourceAppearanceId: appearance.id,
        status: 'PENDING',
      },
      data: {
        status: 'CANCELLED',
      },
    })
    return null
  }

  return db.siriusSpawnWindow.upsert({
    where: { sourceAppearanceId: appearance.id },
    update: {
      clanId: appearance.clanId,
      expectedAt: appearance.nextSpawnAt,
    },
    create: {
      clanId: appearance.clanId,
      sourceAppearanceId: appearance.id,
      expectedAt: appearance.nextSpawnAt,
      createdById: createdById ?? appearance.createdById,
    },
  })
}

export const backfillSpawnWindowsForClan = async (db: SpawnWindowDb, clanId: string) => {
  const appearances = await db.siriusPlanetAppearance.findMany({
    where: {
      clanId,
      nextSpawnAt: { not: null },
    },
    select: { id: true, createdById: true },
    orderBy: [{ nextSpawnAt: 'asc' }],
  })

  let synced = 0
  for (const appearance of appearances) {
    const result = await syncSpawnWindowForAppearance(db, appearance.id, appearance.createdById)
    if (result) synced += 1
  }

  return { synced }
}

export const normalizeInvalidSpawnSchedulesForClan = async (db: SpawnWindowDb, clanId: string) => {
  const invalidAppearances = await db.siriusPlanetAppearance.findMany({
    where: {
      clanId,
      nextSpawnAt: { not: null },
    },
    select: {
      id: true,
      expiresAt: true,
      nextSpawnAt: true,
    },
  })

  let normalized = 0
  for (const appearance of invalidAppearances) {
    if (isValidNextSpawnAt(appearance.expiresAt, appearance.nextSpawnAt)) continue
    const correctedNextSpawnAt = defaultNextSpawnAt(appearance.expiresAt)
    await db.siriusPlanetAppearance.update({
      where: { id: appearance.id },
      data: { nextSpawnAt: correctedNextSpawnAt },
    })
    await db.siriusSpawnWindow.updateMany({
      where: {
        sourceAppearanceId: appearance.id,
        status: 'PENDING',
      },
      data: {
        expectedAt: correctedNextSpawnAt,
      },
    })
    normalized += 1
  }

  return { normalized }
}
