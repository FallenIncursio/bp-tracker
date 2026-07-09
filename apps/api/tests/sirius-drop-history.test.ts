import { describe, expect, it } from 'vitest'
import { buildSiriusDropEventKey } from '../src/sirius/drop-events.js'

describe('Sirius drop history import helpers', () => {
  it('builds stable keys across casing and whitespace differences', () => {
    const base = {
      clanId: 'clan-1',
      planetName: 'Xeigos',
      blueprintName: 'Sirius langer Reparaturdroide',
      ring: 5,
      dropAt: new Date('2026-07-07T00:00:00.000Z'),
      slotGroup: 'SLOT_14' as const,
      enemyType: null,
    }

    expect(buildSiriusDropEventKey(base)).toBe(
      buildSiriusDropEventKey({
        ...base,
        planetName: '  xeigos  ',
        blueprintName: 'SIRIUS   LANGER REPARATURDROIDE',
      })
    )
  })

})
