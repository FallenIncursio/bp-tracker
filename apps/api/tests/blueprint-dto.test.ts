import { describe, expect, it } from 'vitest'
import { serializeBlueprintSummary } from '../src/blueprints/blueprint.dto.js'

describe('blueprint DTO serialization', () => {
  it('serializes blueprint summaries with localized item type and blueprint translations', () => {
    expect(
      serializeBlueprintSummary({
        id: 'bp-1',
        canonicalName: 'Sirius Schild',
        nameDe: 'Sirius Schild',
        nameEn: 'Sirius Shield',
        systemId: 'system-1',
        itemTypeId: 'item-1',
        variant: null,
        siriusRing: 5,
        siriusTechTier: 'ANCIENT',
        slotGroup: 'SLOT_2',
        partsRequired: 2,
        level: 82,
        price: null,
        rarity: 'ANCIENT',
        sourceNotes: null,
        createdAt: new Date('2026-07-08T00:00:00.000Z'),
        updatedAt: new Date('2026-07-08T00:00:00.000Z'),
        system: { id: 'system-1', code: 'SIRIUS', name: 'Sirius', sortOrder: 6 },
        itemType: {
          id: 'item-1',
          code: 'SCHILD',
          nameDe: 'Schild',
          nameEn: 'Shield',
          sortOrder: 10,
          translations: [
            {
              id: 'item-translation-1',
              itemTypeId: 'item-1',
              locale: 'es',
              name: 'Escudo',
              source: 'prelude-myzen',
              verified: true,
              createdAt: new Date('2026-07-08T00:00:00.000Z'),
              updatedAt: new Date('2026-07-08T00:00:00.000Z'),
            },
          ],
        },
        translations: [
          {
            id: 'translation-1',
            blueprintId: 'bp-1',
            locale: 'es',
            name: 'Sirius Escudo',
            source: 'prelude-myzen',
            verified: true,
            createdAt: new Date('2026-07-08T00:00:00.000Z'),
            updatedAt: new Date('2026-07-08T00:00:00.000Z'),
          },
        ],
      })
    ).toEqual({
      id: 'bp-1',
      canonicalName: 'Sirius Schild',
      nameDe: 'Sirius Schild',
      nameEn: 'Sirius Shield',
      translations: [{ locale: 'es', name: 'Sirius Escudo', source: 'prelude-myzen', verified: true }],
      systemName: 'Sirius',
      itemTypeName: 'Schild',
      itemTypeNameDe: 'Schild',
      itemTypeNameEn: 'Shield',
      itemTypeTranslations: [{ locale: 'es', name: 'Escudo', source: 'prelude-myzen', verified: true }],
      slotGroup: 'SLOT_2',
      siriusRing: 5,
      siriusTechTier: 'ANCIENT',
      rarity: 'ANCIENT',
      partsRequired: 2,
      level: 82,
    })
  })

  it('uses nulls and empty translation arrays when optional relations are absent', () => {
    expect(
      serializeBlueprintSummary({
        id: 'bp-2',
        canonicalName: 'Vega Blaster',
        nameDe: 'Vega Blaster',
        nameEn: null,
        systemId: null,
        itemTypeId: null,
        variant: null,
        siriusRing: null,
        siriusTechTier: null,
        slotGroup: null,
        partsRequired: null,
        level: null,
        price: null,
        rarity: 'STANDARD',
        sourceNotes: null,
        createdAt: new Date('2026-07-08T00:00:00.000Z'),
        updatedAt: new Date('2026-07-08T00:00:00.000Z'),
      })
    ).toMatchObject({
      translations: [],
      systemName: null,
      itemTypeName: null,
      itemTypeNameDe: null,
      itemTypeNameEn: null,
      itemTypeTranslations: [],
      rarity: 'STANDARD',
    })
  })
})
