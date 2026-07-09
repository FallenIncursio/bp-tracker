import { describe, expect, it } from 'vitest'
import {
  createClanJourneyStopSchema,
  createSiriusAppearanceSchema,
  replaceSiriusSlotsSchema,
  reorderClanJourneyStopsSchema,
  updateClanJourneyStopSchema,
  upsertSiriusSlotSchema,
} from '@bp-tracker/contracts'

const uuid = 'f0c0ce6f-5c60-4a58-b8b3-2f6b19186a2d'
const expiresAt = '2026-07-09T20:00:00.000Z'

describe('Sirius API contracts', () => {
  it('accepts either a known planet id or a new planet name', () => {
    expect(createSiriusAppearanceSchema.parse({ planetId: uuid, expiresAt }).ring).toBe(5)
    expect(createSiriusAppearanceSchema.parse({ planetName: 'Kenyte Scout', ring: 4, expiresAt }).planetName).toBe(
      'Kenyte Scout'
    )
    expect(
      createSiriusAppearanceSchema.parse({
        planetId: uuid,
        expiresAt,
        resolvesSpawnWindowId: 'de3fd49a-0470-4753-b909-f8456de9c51e',
      }).resolvesSpawnWindowId
    ).toBe('de3fd49a-0470-4753-b909-f8456de9c51e')
  })

  it('rejects appearances without a planet target or with an invalid ring', () => {
    expect(() => createSiriusAppearanceSchema.parse({ expiresAt })).toThrow()
    expect(() => createSiriusAppearanceSchema.parse({ planetName: 'Bad Ring', ring: 6, expiresAt })).toThrow()
  })

  it('accepts resource slots and 2-slot enemy metadata', () => {
    expect(upsertSiriusSlotSchema.parse({ slotGroup: 'RESOURCE', blueprintId: uuid })).toEqual({
      slotGroup: 'RESOURCE',
      blueprintId: uuid,
    })
    expect(upsertSiriusSlotSchema.parse({ slotGroup: 'SLOT_2', enemyType: 'AMARNA', blueprintId: uuid })).toEqual({
      slotGroup: 'SLOT_2',
      enemyType: 'AMARNA',
      blueprintId: uuid,
    })
    expect(upsertSiriusSlotSchema.parse({ slotGroup: 'SLOT_2', enemyType: null, blueprintId: uuid })).toEqual({
      slotGroup: 'SLOT_2',
      enemyType: null,
      blueprintId: uuid,
    })
  })

  it('rejects invalid enemies and oversized bulk slot updates', () => {
    expect(() => upsertSiriusSlotSchema.parse({ slotGroup: 'SLOT_2', enemyType: 'MANTIS', blueprintId: uuid })).toThrow()
    expect(() =>
      replaceSiriusSlotsSchema.parse({
        slots: Array.from({ length: 41 }, () => ({ slotGroup: 'RESOURCE', blueprintId: uuid })),
      })
    ).toThrow()
  })

  it('validates clan journey roadmap payloads', () => {
    expect(createClanJourneyStopSchema.parse({ planetName: 'Eqcos' })).toMatchObject({
      planetName: 'Eqcos',
      ring: 5,
      status: 'PLANNED',
      certainty: 'CONFIRMED',
    })
    expect(createClanJourneyStopSchema.parse({ appearanceId: uuid, status: 'CURRENT', certainty: 'TENTATIVE' })).toMatchObject({
      appearanceId: uuid,
      status: 'CURRENT',
      certainty: 'TENTATIVE',
    })
    expect(updateClanJourneyStopSchema.parse({ status: 'COMPLETED' })).toEqual({ status: 'COMPLETED' })
    expect(reorderClanJourneyStopsSchema.parse({ stopIds: [uuid] })).toEqual({ stopIds: [uuid] })
    expect(createClanJourneyStopSchema.parse({ ring: 5 })).toMatchObject({
      ring: 5,
      status: 'PLANNED',
      certainty: 'CONFIRMED',
    })
  })
})
