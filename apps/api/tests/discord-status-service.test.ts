import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const prismaMock = vi.hoisted(() => ({
  clanDiscordSettings: {
    findUnique: vi.fn(),
    update: vi.fn(),
  },
  clanJourneyStop: {
    findMany: vi.fn(),
  },
  siriusPlanetAppearance: {
    findMany: vi.fn(),
  },
  siriusSpawnWindow: {
    findMany: vi.fn(),
  },
  auditLog: {
    findMany: vi.fn(),
  },
  clanMembership: {
    findMany: vi.fn(),
  },
  userBlueprintStatus: {
    findMany: vi.fn(),
  },
}))

const discordMock = vi.hoisted(() => ({
  editDiscordChannelMessage: vi.fn(),
  pinDiscordChannelMessage: vi.fn(),
  sendDiscordChannelMessage: vi.fn(),
}))

vi.mock('../src/utils/prisma.js', () => ({ prisma: prismaMock }))
vi.mock('../src/notifications/discord.js', () => discordMock)

const now = new Date('2026-07-08T10:00:00.000Z')
const expiresAt = new Date('2026-07-09T02:00:00.000Z')
const nextSpawnAt = new Date('2026-07-10T02:00:00.000Z')
const otherExpiresAt = new Date('2026-07-10T08:00:00.000Z')

const appearance = {
  id: 'appearance-1',
  clanId: 'clan-1',
  planet: { name: 'Miequs' },
  ring: 5,
  observedAt: now,
  expiresAt,
  nextSpawnAt,
  status: 'ACTIVE',
  slots: [
    {
      id: 'slot-1',
      blueprintId: 'bp-1',
      slotGroup: 'SLOT_18',
      enemyType: null,
      createdAt: now,
      blueprint: {
        id: 'bp-1',
        nameDe: 'Sirius Sammler',
        nameEn: 'Sirius Collector',
        translations: [],
      },
    },
  ],
}

const otherAppearance = {
  ...appearance,
  id: 'appearance-2',
  planet: { name: 'Baltra' },
  expiresAt: otherExpiresAt,
  nextSpawnAt: new Date('2026-07-11T08:00:00.000Z'),
  slots: [
    {
      id: 'slot-2',
      blueprintId: 'bp-2',
      slotGroup: 'SLOT_18',
      enemyType: null,
      createdAt: now,
      blueprint: {
        id: 'bp-2',
        nameDe: 'Orion Kanone',
        nameEn: 'Orion Cannon',
        translations: [],
      },
    },
  ],
}

const configureSnapshotMocks = (settings: Record<string, unknown>) => {
  prismaMock.clanDiscordSettings.findUnique.mockResolvedValue({
    clanId: 'clan-1',
    guildId: 'guild-1',
    statusEnabled: true,
    statusChannelId: 'status-channel',
    statusPinMessages: true,
    clan: { id: 'clan-1', name: 'Aurora Fleet' },
    ...settings,
  })
  prismaMock.clanJourneyStop.findMany.mockResolvedValue([
    {
      id: 'stop-1',
      planetName: null,
      planet: null,
      ring: 5,
      arriveAt: now,
      departAt: null,
      status: 'CURRENT',
      certainty: 'CONFIRMED',
      updatedAt: now,
      appearance,
    },
  ])
  prismaMock.siriusPlanetAppearance.findMany.mockResolvedValue([appearance, otherAppearance])
  prismaMock.siriusSpawnWindow.findMany.mockResolvedValue([
    {
      id: 'spawn-resolved',
      expectedAt: new Date('2026-07-07T02:00:00.000Z'),
      status: 'RESOLVED',
      sourceAppearance: { planet: { name: 'Habal' }, status: 'EXPIRED', expiresAt },
      resolvedAppearance: { planet: { name: 'Osbal' } },
    },
    {
      id: 'spawn-active-source',
      expectedAt: nextSpawnAt,
      status: 'PENDING',
      sourceAppearance: { planet: { name: 'Miequs' }, status: 'ACTIVE', expiresAt },
      resolvedAppearance: null,
    },
    {
      id: 'spawn-1',
      expectedAt: new Date('2026-07-08T18:00:00.000Z'),
      status: 'PENDING',
      sourceAppearance: { planet: { name: 'Xeigos' }, status: 'EXPIRED', expiresAt: new Date('2026-07-08T02:00:00.000Z') },
      resolvedAppearance: null,
    },
  ])
  prismaMock.auditLog.findMany.mockResolvedValue([
    {
      action: 'sirius.appearance.update',
      summary: 'Miequs updated',
      createdAt: now,
    },
  ])
  prismaMock.clanMembership.findMany.mockResolvedValue([
    {
      user: {
        id: 'user-1',
        displayName: 'Ashura',
        discordUserId: '111111111111111111',
      },
    },
    { user: { id: 'user-2', displayName: 'Bassman', discordUserId: null } },
  ])
  prismaMock.userBlueprintStatus.findMany.mockResolvedValue([
    { userId: 'user-1', blueprintId: 'bp-1', status: 'WANTED' },
    { userId: 'user-1', blueprintId: 'bp-2', status: 'WANTED' },
  ])
}

describe('Discord status service', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(now)
    for (const delegate of Object.values(prismaMock)) {
      for (const method of Object.values(delegate)) {
        method.mockReset()
      }
    }
    discordMock.editDiscordChannelMessage.mockReset()
    discordMock.pinDiscordChannelMessage.mockReset()
    discordMock.sendDiscordChannelMessage.mockReset()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('publishes roadmap and Sirius status messages without Discord pings', async () => {
    const { publishClanDiscordStatus } = await import('../src/notifications/discord-status.service.js')
    configureSnapshotMocks({
      statusRoadmapMessageId: null,
      statusPlanetsMessageId: null,
    })
    discordMock.sendDiscordChannelMessage.mockResolvedValueOnce({ ok: true, messageId: 'roadmap-message' }).mockResolvedValueOnce({ ok: true, messageId: 'planets-message' })
    discordMock.pinDiscordChannelMessage.mockResolvedValue({ ok: true })

    await expect(publishClanDiscordStatus('clan-1')).resolves.toEqual({
      published: true,
      roadmapMessageId: 'roadmap-message',
      planetsMessageId: 'planets-message',
      warnings: [],
    })

    expect(discordMock.sendDiscordChannelMessage).toHaveBeenCalledTimes(2)
    expect(discordMock.sendDiscordChannelMessage.mock.calls[0][1]).toMatchObject({
      content: 'BP Tracker Status: Aurora Fleet Roadmap',
      allowed_mentions: { parse: [] },
    })
    const siriusEmbed = discordMock.sendDiscordChannelMessage.mock.calls[1][1].embeds[0]
    const siriusFields = siriusEmbed.fields ?? []
    const siriusWantedField = siriusFields.find(field => field.name.includes('Wunsch-Treffer'))
    expect(siriusFields.map(field => field.name)).toEqual(['⭐ Wunsch-Treffer', '🪐 Aktive Planeten', '⏳ Nächste Spawn-Fenster'])
    expect(siriusEmbed).toMatchObject({
      description: expect.stringContaining('🪐 2 aktiv · ⏳ 1 Spawn-Fenster · 🎯 1 Wunsch-Treffer'),
      fields: expect.arrayContaining([
        expect.objectContaining({
          name: expect.stringContaining('Wunsch-Treffer'),
          value: expect.stringContaining('Orion Kanone'),
        }),
        expect.objectContaining({
          name: expect.stringContaining('🪐'),
          value: expect.stringContaining('🟢 **Miequs 5R** · platzt'),
        }),
        expect.objectContaining({
          name: expect.stringContaining('⏳'),
          value: expect.stringContaining('⏳ **Xeigos** · erwartet'),
        }),
      ]),
    })
    expect(siriusWantedField?.value).not.toContain('Sirius Sammler')
    expect(siriusFields.find(field => field.name.includes('🪐'))?.value).not.toContain('spawnt neu')
    expect(siriusFields.find(field => field.name.includes('⏳'))?.value).not.toContain('Habal')
    expect(siriusFields.find(field => field.name.includes('⏳'))?.value).not.toContain('Miequs')
    expect(discordMock.sendDiscordChannelMessage.mock.calls[0][1].embeds[0].fields).not.toEqual(expect.arrayContaining([expect.objectContaining({ name: 'Zuletzt bearbeitet' })]))
    expect(discordMock.sendDiscordChannelMessage.mock.calls[1][1].embeds[0].fields).not.toEqual(expect.arrayContaining([expect.objectContaining({ name: 'Fehlend kompakt' })]))
    expect(prismaMock.clanDiscordSettings.update).toHaveBeenCalledWith({
      where: { clanId: 'clan-1' },
      data: expect.objectContaining({
        statusRoadmapMessageId: 'roadmap-message',
        statusPlanetsMessageId: 'planets-message',
        statusLastError: null,
      }),
    })
  })

  it('uses the configured status language for status messages', async () => {
    const { publishClanDiscordStatus } = await import('../src/notifications/discord-status.service.js')
    configureSnapshotMocks({
      statusLocale: 'en',
      statusRoadmapMessageId: null,
      statusPlanetsMessageId: null,
    })
    discordMock.sendDiscordChannelMessage.mockResolvedValueOnce({ ok: true, messageId: 'roadmap-message' }).mockResolvedValueOnce({ ok: true, messageId: 'planets-message' })
    discordMock.pinDiscordChannelMessage.mockResolvedValue({ ok: true })

    await publishClanDiscordStatus('clan-1')

    expect(discordMock.sendDiscordChannelMessage.mock.calls[0][1].embeds[0]).toMatchObject({
      description: expect.stringContaining('updated'),
      fields: expect.arrayContaining([
        expect.objectContaining({ name: expect.stringContaining('Current') }),
        expect.objectContaining({
          name: expect.stringContaining('Next stations'),
        }),
        expect.objectContaining({
          name: expect.stringContaining('Wanted BPs'),
          value: expect.stringContaining('Sirius Collector'),
        }),
      ]),
    })
    expect(discordMock.sendDiscordChannelMessage.mock.calls[1][1].embeds[0].fields).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: expect.stringContaining('Wanted hits'),
          value: expect.stringContaining('Orion Cannon'),
        }),
      ]),
    )
  })

  it('edits existing status messages and recreates deleted ones', async () => {
    const { publishClanDiscordStatus } = await import('../src/notifications/discord-status.service.js')
    configureSnapshotMocks({
      statusRoadmapMessageId: 'old-roadmap',
      statusPlanetsMessageId: 'missing-planets',
    })
    discordMock.editDiscordChannelMessage.mockResolvedValueOnce({ ok: true }).mockResolvedValueOnce({
      ok: false,
      status: 404,
      error: 'Unknown Message',
    })
    discordMock.sendDiscordChannelMessage.mockResolvedValueOnce({
      ok: true,
      messageId: 'new-planets',
    })
    discordMock.pinDiscordChannelMessage.mockResolvedValueOnce({
      ok: false,
      error: 'Missing Permissions',
    })

    await expect(publishClanDiscordStatus('clan-1')).resolves.toEqual({
      published: true,
      roadmapMessageId: 'old-roadmap',
      planetsMessageId: 'new-planets',
      warnings: ['Stored Discord status message was not found and has been recreated.', 'Status message was created but could not be pinned: Missing Permissions'],
    })

    expect(discordMock.editDiscordChannelMessage).toHaveBeenCalledTimes(2)
    expect(discordMock.sendDiscordChannelMessage).toHaveBeenCalledTimes(1)
    expect(prismaMock.clanDiscordSettings.update).toHaveBeenCalledWith({
      where: { clanId: 'clan-1' },
      data: expect.objectContaining({
        statusRoadmapMessageId: 'old-roadmap',
        statusPlanetsMessageId: 'new-planets',
        statusLastError: expect.stringContaining('Missing Permissions'),
      }),
    })
  })
})
