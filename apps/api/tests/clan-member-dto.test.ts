import { describe, expect, it } from 'vitest'
import { serializeClanMember } from '../src/clans/clan-member.dto.js'

const baseMembership = {
  id: 'membership-1',
  clanId: 'clan-1',
  userId: 'user-1',
  role: 'MEMBER',
  status: 'ACTIVE',
  trackingExcluded: true,
  trackingExcludedAt: new Date('2026-07-09T10:00:00.000Z'),
  trackingExcludedById: 'user-admin',
  trackingExcludedReason: 'Paused for testing',
  approvedById: 'user-admin',
  approvedAt: new Date('2026-07-08T10:00:00.000Z'),
  createdAt: new Date('2026-07-07T10:00:00.000Z'),
  updatedAt: new Date('2026-07-09T10:00:00.000Z'),
  user: {
    displayName: 'Noctis',
    username: 'noctis-admin',
  },
} as const

describe('clan member DTO serialization', () => {
  it('redacts management-only fields for regular clan members', () => {
    expect(serializeClanMember(baseMembership, false)).toEqual({
      userId: 'user-1',
      displayName: 'Noctis',
      role: 'MEMBER',
      status: 'ACTIVE',
      trackingExcluded: true,
    })
  })

  it('includes usernames and tracking details for clan managers', () => {
    expect(serializeClanMember(baseMembership, true)).toEqual({
      userId: 'user-1',
      displayName: 'Noctis',
      role: 'MEMBER',
      status: 'ACTIVE',
      trackingExcluded: true,
      username: 'noctis-admin',
      trackingExcludedAt: new Date('2026-07-09T10:00:00.000Z'),
      trackingExcludedReason: 'Paused for testing',
      approvedAt: new Date('2026-07-08T10:00:00.000Z'),
    })
  })
})
