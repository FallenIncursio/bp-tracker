import { beforeEach, describe, expect, it, vi } from 'vitest'

const prismaMock = vi.hoisted(() => ({
  blueprint: {
    findMany: vi.fn(),
  },
  clanMembership: {
    findMany: vi.fn(),
  },
  userBlueprintStatus: {
    findMany: vi.fn(),
  },
}))

vi.mock('../src/utils/prisma.js', () => ({ prisma: prismaMock }))

import { buildSlotCounts } from '../src/sirius/sirius.routes.js'

describe('buildSlotCounts', () => {
  beforeEach(() => {
    prismaMock.blueprint.findMany.mockReset()
    prismaMock.clanMembership.findMany.mockReset()
    prismaMock.userBlueprintStatus.findMany.mockReset()
    prismaMock.blueprint.findMany.mockResolvedValue([{ id: 'bp-1' }])
    prismaMock.clanMembership.findMany.mockResolvedValue([{ userId: 'other-user', user: { displayName: 'Other' } }])
  })

  it('keeps another member wanted status out of the viewer status', async () => {
    prismaMock.userBlueprintStatus.findMany.mockResolvedValue([{ userId: 'other-user', blueprintId: 'bp-1', status: 'WANTED' }])

    const result = await buildSlotCounts('clan-1', ['bp-1'], true, 'viewer-user')

    expect(result.counts.get('bp-1')).toMatchObject({ wanted: 1, missing: 0 })
    expect(result.viewerStatuses.has('bp-1')).toBe(false)
  })

  it('returns the current viewer wanted status separately from clan aggregate counts', async () => {
    prismaMock.userBlueprintStatus.findMany.mockResolvedValue([
      { userId: 'other-user', blueprintId: 'bp-1', status: 'OWNED' },
      { userId: 'viewer-user', blueprintId: 'bp-1', status: 'WANTED' },
    ])

    const result = await buildSlotCounts('clan-1', ['bp-1'], true, 'viewer-user')

    expect(result.counts.get('bp-1')).toMatchObject({ owned: 1, wanted: 0, missing: 0 })
    expect(result.viewerStatuses.get('bp-1')).toBe('WANTED')
  })
})
