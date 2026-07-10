import { describe, expect, it, vi } from 'vitest'
import { defaultNextSpawnAt, deriveSpawnWindowStatus, isValidNextSpawnAt, nextSpawnAtForRing, syncSpawnWindowForAppearance } from '../src/sirius/spawn-windows.js'

const now = new Date('2026-07-08T12:00:00.000Z')

describe('Sirius spawn windows', () => {
  it('requires next spawn times to be after the planet expiry', () => {
    const expiresAt = new Date('2026-07-10T02:00:00.000Z')
    expect(isValidNextSpawnAt(expiresAt, null)).toBe(true)
    expect(isValidNextSpawnAt(expiresAt, new Date('2026-07-11T02:00:00.000Z'))).toBe(true)
    expect(isValidNextSpawnAt(expiresAt, new Date('2026-07-10T02:00:00.000Z'))).toBe(false)
    expect(isValidNextSpawnAt(expiresAt, new Date('2026-06-11T02:00:00.000Z'))).toBe(false)
    expect(defaultNextSpawnAt(expiresAt).toISOString()).toBe('2026-07-11T02:00:00.000Z')
  })

  it('derives the expected Sirius respawn from the expiry time', () => {
    expect(defaultNextSpawnAt(new Date('2026-07-08T00:00:00.000Z')).toISOString()).toBe('2026-07-09T00:00:00.000Z')
    expect(defaultNextSpawnAt(new Date('2026-12-31T23:00:00.000Z')).toISOString()).toBe('2027-01-01T23:00:00.000Z')
  })

  it('only schedules next spawn windows for ring 5 planets', () => {
    const expiresAt = new Date('2026-07-15T13:01:00.000Z')
    expect(nextSpawnAtForRing(4, expiresAt)).toBeNull()
    expect(nextSpawnAtForRing(5, expiresAt)?.toISOString()).toBe('2026-07-16T13:01:00.000Z')
  })

  it('keeps unresolved windows active while the source planet is still running', () => {
    expect(
      deriveSpawnWindowStatus({
        status: 'PENDING',
        expectedAt: new Date('2026-07-10T02:00:00.000Z'),
        sourceStatus: 'ACTIVE',
        sourceExpiresAt: new Date('2026-07-09T02:00:00.000Z'),
        now,
      }),
    ).toBe('ACTIVE_SOURCE')
  })

  it('marks pending windows as waiting or overdue after the source expired', () => {
    expect(
      deriveSpawnWindowStatus({
        status: 'PENDING',
        expectedAt: new Date('2026-07-08T18:00:00.000Z'),
        sourceStatus: 'EXPIRED',
        sourceExpiresAt: new Date('2026-07-08T02:00:00.000Z'),
        now,
      }),
    ).toBe('WAITING_FOR_SPAWN')

    expect(
      deriveSpawnWindowStatus({
        status: 'PENDING',
        expectedAt: new Date('2026-07-08T02:00:00.000Z'),
        sourceStatus: 'EXPIRED',
        sourceExpiresAt: new Date('2026-07-07T02:00:00.000Z'),
        now,
      }),
    ).toBe('OVERDUE')
  })

  it('prefers terminal database states over derived time state', () => {
    expect(
      deriveSpawnWindowStatus({
        status: 'RESOLVED',
        expectedAt: new Date('2026-07-01T02:00:00.000Z'),
        sourceStatus: 'EXPIRED',
        sourceExpiresAt: new Date('2026-06-30T02:00:00.000Z'),
        now,
      }),
    ).toBe('RESOLVED')

    expect(
      deriveSpawnWindowStatus({
        status: 'CANCELLED',
        expectedAt: new Date('2026-07-01T02:00:00.000Z'),
        sourceStatus: 'EXPIRED',
        sourceExpiresAt: new Date('2026-06-30T02:00:00.000Z'),
        now,
      }),
    ).toBe('CANCELLED')
  })

  it('does not reopen cancelled windows during backfill sync', async () => {
    const db = {
      siriusPlanetAppearance: {
        findUnique: vi.fn().mockResolvedValue({
          id: 'appearance-1',
          clanId: 'clan-1',
          expiresAt: new Date('2026-07-10T02:00:00.000Z'),
          nextSpawnAt: new Date('2026-07-11T02:00:00.000Z'),
          createdById: 'user-1',
        }),
      },
      siriusSpawnWindow: {
        findUnique: vi.fn().mockResolvedValue({ status: 'CANCELLED' }),
        upsert: vi.fn().mockResolvedValue({ id: 'spawn-1', status: 'CANCELLED' }),
      },
    }

    await syncSpawnWindowForAppearance(db as never, 'appearance-1')

    expect(db.siriusSpawnWindow.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.not.objectContaining({ status: 'PENDING' }),
      }),
    )
  })
})
