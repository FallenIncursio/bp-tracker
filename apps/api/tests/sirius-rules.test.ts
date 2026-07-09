import { describe, expect, it } from 'vitest'
import { slotGroupsForRing, techTierForRing, validateSiriusSlotShape } from '../src/sirius/sirius.rules.js'

describe('Sirius ring rules', () => {
  it('maps rings to their fixed tech tiers', () => {
    expect(techTierForRing(1)).toBe('OOLYTE')
    expect(techTierForRing(2)).toBe('DOLOMYTE')
    expect(techTierForRing(3)).toBe('CLAY')
    expect(techTierForRing(4)).toBe('KENYTE')
    expect(techTierForRing(5)).toBe('ANCIENT')
    expect(techTierForRing(6)).toBeNull()
  })

  it('limits rings 1-4 to resource drops and ring 5 to ancient slot groups', () => {
    expect(slotGroupsForRing(1)).toEqual(['RESOURCE'])
    expect(slotGroupsForRing(4)).toEqual(['RESOURCE'])
    expect(slotGroupsForRing(5)).toEqual(['SLOT_18', 'SLOT_14', 'SLOT_12', 'SLOT_5', 'SLOT_2'])
  })

  it('accepts valid resource and 2-slot shapes', () => {
    expect(() => validateSiriusSlotShape(4, { slotGroup: 'RESOURCE' })).not.toThrow()
    expect(() => validateSiriusSlotShape(5, { slotGroup: 'SLOT_2', enemyType: 'SORIS' })).not.toThrow()
  })

  it('rejects slot groups that cannot appear in the selected ring', () => {
    expect(() => validateSiriusSlotShape(4, { slotGroup: 'SLOT_18' })).toThrow(
      'Slot group SLOT_18 is not available on Sirius ring 4.'
    )
  })

  it('requires enemies only for 2-slot drops', () => {
    expect(() => validateSiriusSlotShape(5, { slotGroup: 'SLOT_2' })).toThrow(
      'Soris, Amarna or Giza is required for 2-slot drops.'
    )
    expect(() => validateSiriusSlotShape(5, { slotGroup: 'SLOT_5', enemyType: 'GIZA' })).toThrow(
      'Enemy type is only valid for 2-slot drops.'
    )
  })
})
