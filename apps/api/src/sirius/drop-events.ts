import type {
  BlueprintSlotGroup,
  ImportSourceType,
  Prisma,
  PrismaClient,
  SiriusEnemyType,
  SiriusTechTier,
} from '../generated/prisma/client.js'

type DropEventDb = PrismaClient | Prisma.TransactionClient

export type RecordSiriusDropEventInput = {
  clanId: string
  planetId?: string | null
  appearanceId?: string | null
  blueprintId?: string | null
  planetName: string
  blueprintName: string
  ring: number
  techTier?: SiriusTechTier | null
  dropAt: Date
  observedAt?: Date | null
  expiresAt?: Date | null
  nextSpawnAt?: Date | null
  slotGroup: BlueprintSlotGroup
  enemyType?: SiriusEnemyType | null
  partsRequired?: number | null
  sourceType: ImportSourceType
  sourceRef?: string | null
  confidence?: number
  evidence?: {
    evidenceKey?: string
    importRunId?: string | null
    revisionId?: string | null
    revisionModifiedAt?: Date | null
    snapshotFile?: string | null
    sourceSection?: string | null
    rowIndex?: number | null
    columnIndex?: number | null
    seenAt?: Date | null
    rawJson?: Prisma.InputJsonValue
  }
}

const normalizeKeyPart = (value: string | null | undefined) =>
  (value ?? '-')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')

const minDate = (left: Date | null | undefined, right: Date | null | undefined) => {
  if (!left) return right ?? null
  if (!right) return left
  return left.getTime() <= right.getTime() ? left : right
}

const maxDate = (left: Date | null | undefined, right: Date | null | undefined) => {
  if (!left) return right ?? null
  if (!right) return left
  return left.getTime() >= right.getTime() ? left : right
}

export const buildSiriusDropEventKey = (input: {
  clanId: string
  planetName: string
  blueprintName: string
  ring: number
  dropAt: Date
  slotGroup: BlueprintSlotGroup
  enemyType?: SiriusEnemyType | null
}) =>
  [
    input.clanId,
    normalizeKeyPart(input.planetName),
    input.ring,
    input.dropAt.toISOString(),
    input.slotGroup,
    input.enemyType ?? '-',
    normalizeKeyPart(input.blueprintName),
  ].join('|')

export const recordSiriusDropEvent = async (db: DropEventDb, input: RecordSiriusDropEventInput) => {
  const eventKey = buildSiriusDropEventKey(input)
  const evidenceSeenAt = input.evidence?.seenAt ?? input.observedAt ?? input.dropAt
  const evidenceKey = input.evidence?.evidenceKey ?? `${input.sourceRef ?? input.sourceType}:${eventKey}`
  const confidence = input.confidence ?? 1
  const existing = await db.siriusDropEvent.findUnique({ where: { eventKey } })

  const dropEvent = existing
    ? await db.siriusDropEvent.update({
        where: { id: existing.id },
        data: {
          planetId: input.planetId ?? existing.planetId,
          appearanceId: input.appearanceId ?? existing.appearanceId,
          blueprintId: input.blueprintId ?? existing.blueprintId,
          techTier: input.techTier ?? existing.techTier,
          observedAt: input.observedAt ?? existing.observedAt,
          expiresAt: input.expiresAt ?? existing.expiresAt,
          nextSpawnAt: input.nextSpawnAt ?? existing.nextSpawnAt,
          enemyType: input.enemyType ?? existing.enemyType,
          partsRequired: input.partsRequired ?? existing.partsRequired,
          rawPlanetName: input.planetId ? existing.rawPlanetName : input.planetName,
          rawBlueprintName: input.blueprintId ? existing.rawBlueprintName : input.blueprintName,
          sourceType: input.sourceType,
          sourceRef: input.sourceRef,
          confidence: Math.max(existing.confidence, confidence),
          firstSeenAt: minDate(existing.firstSeenAt, evidenceSeenAt),
          lastSeenAt: maxDate(existing.lastSeenAt, evidenceSeenAt),
        },
      })
    : await db.siriusDropEvent.create({
        data: {
          eventKey,
          clanId: input.clanId,
          planetId: input.planetId ?? null,
          appearanceId: input.appearanceId ?? null,
          blueprintId: input.blueprintId ?? null,
          ring: input.ring,
          techTier: input.techTier ?? null,
          dropAt: input.dropAt,
          observedAt: input.observedAt ?? null,
          expiresAt: input.expiresAt ?? null,
          nextSpawnAt: input.nextSpawnAt ?? null,
          slotGroup: input.slotGroup,
          enemyType: input.enemyType ?? null,
          partsRequired: input.partsRequired ?? null,
          rawPlanetName: input.planetId ? null : input.planetName,
          rawBlueprintName: input.blueprintId ? null : input.blueprintName,
          sourceType: input.sourceType,
          sourceRef: input.sourceRef ?? null,
          confidence,
          firstSeenAt: evidenceSeenAt,
          lastSeenAt: evidenceSeenAt,
        },
      })

  await db.siriusDropEvidence.upsert({
    where: { evidenceKey },
    update: {
      importRunId: input.evidence?.importRunId ?? null,
      sourceType: input.sourceType,
      sourceRef: input.sourceRef ?? null,
      revisionId: input.evidence?.revisionId ?? null,
      revisionModifiedAt: input.evidence?.revisionModifiedAt ?? null,
      snapshotFile: input.evidence?.snapshotFile ?? null,
      sourceSection: input.evidence?.sourceSection ?? null,
      rowIndex: input.evidence?.rowIndex ?? null,
      columnIndex: input.evidence?.columnIndex ?? null,
      seenAt: evidenceSeenAt,
      rawJson: input.evidence?.rawJson ?? undefined,
    },
    create: {
      evidenceKey,
      dropEventId: dropEvent.id,
      importRunId: input.evidence?.importRunId ?? null,
      sourceType: input.sourceType,
      sourceRef: input.sourceRef ?? null,
      revisionId: input.evidence?.revisionId ?? null,
      revisionModifiedAt: input.evidence?.revisionModifiedAt ?? null,
      snapshotFile: input.evidence?.snapshotFile ?? null,
      sourceSection: input.evidence?.sourceSection ?? null,
      rowIndex: input.evidence?.rowIndex ?? null,
      columnIndex: input.evidence?.columnIndex ?? null,
      seenAt: evidenceSeenAt,
      rawJson: input.evidence?.rawJson ?? undefined,
    },
  })

  return dropEvent
}

export const syncDropEventsForAppearance = async (
  db: DropEventDb,
  appearanceId: string,
  options: {
    sourceType?: ImportSourceType
    sourceRef?: string
    importRunId?: string | null
    revisionId?: string | null
    revisionModifiedAt?: Date | null
    snapshotFile?: string | null
  } = {}
) => {
  const appearance = await db.siriusPlanetAppearance.findUnique({
    where: { id: appearanceId },
    include: {
      planet: true,
      slots: {
        include: { blueprint: true },
        orderBy: [{ phase: 'asc' }, { slotGroup: 'asc' }, { createdAt: 'asc' }],
      },
    },
  })

  if (!appearance) return { synced: 0 }

  const sourceType = options.sourceType ?? 'MANUAL_JSON'
  const sourceRef = options.sourceRef ?? `appearance:${appearance.id}`

  await db.siriusDropEvidence.deleteMany({ where: { sourceRef } })
  await db.siriusDropEvent.updateMany({ where: { appearanceId: appearance.id }, data: { appearanceId: null } })

  let synced = 0
  for (const slot of appearance.slots) {
    const blueprintName = slot.blueprint?.canonicalName ?? slot.rawBlueprintName
    if (!blueprintName) continue

    await recordSiriusDropEvent(db, {
      clanId: appearance.clanId,
      planetId: appearance.planetId,
      appearanceId: appearance.id,
      blueprintId: slot.blueprintId,
      planetName: appearance.planet.name,
      blueprintName,
      ring: appearance.ring,
      techTier: appearance.techTier,
      dropAt: appearance.expiresAt,
      observedAt: appearance.observedAt,
      expiresAt: appearance.expiresAt,
      nextSpawnAt: appearance.nextSpawnAt,
      slotGroup: slot.slotGroup,
      enemyType: slot.enemyType,
      partsRequired: slot.blueprint?.partsRequired ?? null,
      sourceType,
      sourceRef,
      confidence: slot.confidence,
      evidence: {
        importRunId: options.importRunId,
        revisionId: options.revisionId,
        revisionModifiedAt: options.revisionModifiedAt,
        snapshotFile: options.snapshotFile,
        seenAt: appearance.observedAt,
        rawJson: {
          appearanceId: appearance.id,
          slotId: slot.id,
          phase: slot.phase,
          slotGroup: slot.slotGroup,
          enemyType: slot.enemyType,
          blueprintName,
          observedAt: appearance.observedAt.toISOString(),
          expiresAt: appearance.expiresAt.toISOString(),
        },
      },
    })
    synced += 1
  }

  await db.siriusDropEvent.deleteMany({
    where: {
      clanId: appearance.clanId,
      appearanceId: null,
      evidences: { none: {} },
    },
  })

  return { synced }
}

export const backfillDropEventsForClan = async (db: DropEventDb, clanId: string) => {
  const existingEvents = await db.siriusDropEvent.count({ where: { clanId } })
  if (existingEvents > 0) return { backfilled: 0, skipped: true }

  const appearances = await db.siriusPlanetAppearance.findMany({
    where: { clanId, slots: { some: {} } },
    select: { id: true, planet: { select: { name: true } }, expiresAt: true },
    orderBy: [{ expiresAt: 'asc' }],
  })

  let backfilled = 0
  for (const appearance of appearances) {
    const sourceRef = `appearance-backfill:${appearance.planet.name}:${appearance.expiresAt.toISOString()}`
    const result = await syncDropEventsForAppearance(db, appearance.id, { sourceType: 'MANUAL_JSON', sourceRef })
    backfilled += result.synced
  }

  return { backfilled, skipped: false }
}

