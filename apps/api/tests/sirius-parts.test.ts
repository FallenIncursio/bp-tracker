import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import {
  partsRequiredBySlotGroup,
  siriusResourceItems,
  siriusResourceParts,
  siriusResourcePartsByItem,
} from '../src/sirius/sirius-parts.js'

const expectedSiriusResourceParts = {
  Aggrobeacon: [24, 23, 22, 21],
  Aggrobombe: [6, 6, 6, 6],
  Angriffsdroide: [16, 15, 15, 14],
  Angriffsfeldturm: [16, 15, 15, 14],
  Angriffsladung: [24, 23, 22, 21],
  Blaster: [6, 6, 6, 6],
  Dosenoeffner: [6, 6, 6, 6],
  Haftbombe: [6, 6, 6, 6],
  Materialisierer: [6, 6, 6, 6],
  Mine: [6, 6, 6, 6],
  Nachbrenner: [16, 15, 15, 14],
  Orbitalschlag: [6, 6, 6, 6],
  Perforator: [24, 23, 22, 21],
  Raketen: [6, 6, 6, 6],
  Reparaturdroide: [6, 6, 6, 6],
  Reparaturfeld: [6, 6, 6, 6],
  Reparaturfeldturm: [24, 23, 22, 21],
  Sammler: [24, 23, 22, 21],
  Schild: [6, 6, 6, 6],
  Schutz: [16, 15, 15, 14],
  Sniperblaster: [6, 6, 6, 6],
  Beschleuniger: [16, 15, 15, 14],
  Stunladung: [6, 6, 6, 6],
  Stundome: [6, 6, 6, 6],
  Taunt: [24, 23, 22, 21],
  Thermoblast: [6, 6, 6, 6],
  Zielcomputer: [16, 15, 15, 14],
  Zielreparatur: [24, 23, 22, 21],
  Zielscrambler: [16, 15, 15, 14],
}

type BlueprintSeed = {
  canonicalName: string
  system: string | null
  itemType: string | null
  slotGroup: string
  rarity: string
}

const seedBlueprints = JSON.parse(readFileSync(new URL('../../../data/seeds/blueprints.json', import.meta.url), 'utf8')) as BlueprintSeed[]

describe('Sirius blueprint parts', () => {
  it('maps resource rings 1-4 from the Prelude blueprint reference', () => {
    expect(siriusResourcePartsByItem).toEqual(expectedSiriusResourceParts)
  })

  it('returns the exact ring value for individual resource blueprints', () => {
    expect(siriusResourceParts('Angriffsladung', 3)).toBe(21)
    expect(siriusResourceParts('Beschleuniger', 3)).toBe(14)
    expect(siriusResourceParts('Stunladung', 3)).toBe(6)
    expect(siriusResourceParts('Schutz', 3)).toBe(14)
    expect(siriusResourceParts('Aggrobombe', 3)).toBe(6)
  })

  it('generates every current Sirius resource blueprint for rings 1-4', () => {
    const resourceNames = new Set(siriusResourceItems.map((item) => item.name))

    expect(resourceNames.size).toBe(Object.keys(siriusResourcePartsByItem).length)
    expect(resourceNames).toContain('Beschleuniger')
    expect(resourceNames).toContain('Materialisierer')
    expect(resourceNames).toContain('Stunladung')
    expect(resourceNames).not.toContain('Speed')
    expect(resourceNames).not.toContain('Stun')
  })

  it('keeps ring 5 slot groups aligned with Prelude ancient fragment counts', () => {
    expect(partsRequiredBySlotGroup).toMatchObject({
      SLOT_18: 18,
      SLOT_14: 14,
      SLOT_12: 12,
      SLOT_5: 5,
      SLOT_2: 2,
    })
  })

  it('keeps ring 5 aim computers split between cross-system 5-slot and Sirius 2-slot drops', () => {
    const aimComputers = seedBlueprints.filter((blueprint) => blueprint.itemType === 'Zielcomputer')
    expect(aimComputers.filter((blueprint) => blueprint.system === 'Sirius').map((blueprint) => blueprint.slotGroup)).toEqual([
      'SLOT_2',
      'SLOT_2',
      'SLOT_2',
    ])
    expect(aimComputers.filter((blueprint) => blueprint.system !== 'Sirius').every((blueprint) => blueprint.slotGroup === 'SLOT_5')).toBe(
      true,
    )
  })

  it('uses current item categories for renamed and materializer blueprints', () => {
    expect(
      seedBlueprints
        .filter((blueprint) => /\bBeschleuniger\b/.test(blueprint.canonicalName))
        .every((blueprint) => blueprint.itemType === 'Beschleuniger'),
    ).toBe(true)
    expect(seedBlueprints.some((blueprint) => /\bSpeed\b/.test(blueprint.canonicalName) || blueprint.itemType === 'Speed')).toBe(false)
    expect(
      seedBlueprints
        .filter((blueprint) => /\bStunladung\b/.test(blueprint.canonicalName))
        .every((blueprint) => blueprint.itemType === 'Stunladung'),
    ).toBe(true)
    expect(seedBlueprints.some((blueprint) => /\bStun\b/.test(blueprint.canonicalName) || blueprint.itemType === 'Stun')).toBe(false)
    expect(
      seedBlueprints
        .filter((blueprint) => /\bAngriffsladung\b/.test(blueprint.canonicalName))
        .every((blueprint) => blueprint.itemType === 'Angriffsladung'),
    ).toBe(true)
    expect(
      seedBlueprints
        .filter((blueprint) => /\bMaterialisierer\b/.test(blueprint.canonicalName))
        .every((blueprint) => blueprint.itemType === 'Materialisierer'),
    ).toBe(true)
  })

  it('keeps cosmetic patterns out of functional Sirius slot groups', () => {
    expect(
      seedBlueprints.filter((blueprint) => blueprint.rarity === 'COSMETIC').every((blueprint) => blueprint.slotGroup === 'CUSTOM'),
    ).toBe(true)
  })

  it('uses Ancient instead of Antik for the cosmetic pattern seed', () => {
    expect(seedBlueprints.some((blueprint) => blueprint.canonicalName === 'Ancient' && blueprint.itemType === 'Ancient')).toBe(true)
    expect(seedBlueprints.some((blueprint) => blueprint.canonicalName === 'Antik' || blueprint.itemType === 'Antik')).toBe(false)
  })

  it('marks functional Sirius slot blueprints as ancient rarity', () => {
    const functionalSlotGroups = new Set(['SLOT_18', 'SLOT_14', 'SLOT_12', 'SLOT_5', 'SLOT_2'])
    const functionalBlueprints = seedBlueprints.filter((blueprint) => functionalSlotGroups.has(blueprint.slotGroup))

    expect(functionalBlueprints.length).toBeGreaterThan(0)
    expect(functionalBlueprints.every((blueprint) => blueprint.rarity === 'ANCIENT')).toBe(true)
  })
})
