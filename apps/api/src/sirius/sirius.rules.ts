import type { BlueprintSlotGroup, SiriusEnemyType, SiriusTechTier } from '../generated/prisma/client.js'
import { HttpError } from '../utils/http.js'

export const techTierByRing: Record<number, SiriusTechTier> = {
  1: 'OOLYTE',
  2: 'DOLOMYTE',
  3: 'CLAY',
  4: 'KENYTE',
  5: 'ANCIENT',
}

export const ringFiveSlotGroups: BlueprintSlotGroup[] = ['SLOT_18', 'SLOT_14', 'SLOT_12', 'SLOT_5', 'SLOT_2']
export const resourceSlotGroups: BlueprintSlotGroup[] = ['RESOURCE']

export const techTierForRing = (ring: number) => techTierByRing[ring] ?? null
export const slotGroupsForRing = (ring: number) => (ring === 5 ? ringFiveSlotGroups : resourceSlotGroups)

export const validateSiriusSlotShape = (
  ring: number,
  input: { slotGroup: BlueprintSlotGroup; enemyType?: SiriusEnemyType | null }
) => {
  const allowedSlotGroups = slotGroupsForRing(ring)
  if (!allowedSlotGroups.includes(input.slotGroup)) {
    throw new HttpError(400, `Slot group ${input.slotGroup} is not available on Sirius ring ${ring}.`)
  }

  if (input.slotGroup !== 'SLOT_2' && input.enemyType) {
    throw new HttpError(400, 'Enemy type is only valid for 2-slot drops.')
  }
}
