import { beforeEach, describe, expect, it, vi } from 'vitest'

const prismaMock = vi.hoisted(() => ({
  user: {
    findUnique: vi.fn(),
  },
  notificationPreference: {
    create: vi.fn(),
  },
  notification: {
    create: vi.fn(),
  },
  clanDiscordSettings: {
    findUnique: vi.fn(),
  },
  notificationDelivery: {
    create: vi.fn(),
  },
}))

const discordMock = vi.hoisted(() => ({
  sendDiscordChannelMessage: vi.fn(),
}))

vi.mock('../src/utils/prisma.js', () => ({ prisma: prismaMock }))
vi.mock('../src/notifications/discord.js', () => discordMock)

const baseInput = {
  userId: 'user-1',
  clanId: 'clan-1',
  type: 'BLUEPRINT_MISSING_ACTIVE' as const,
  title: 'Missing BP',
  body: 'Sirius Sammler is active.',
  payloadJson: { blueprintId: 'bp-1' },
}

const notification = { id: 'notification-1' }

describe('notification service', () => {
  beforeEach(() => {
    prismaMock.user.findUnique.mockReset()
    prismaMock.notificationPreference.create.mockReset()
    prismaMock.notification.create.mockReset()
    prismaMock.clanDiscordSettings.findUnique.mockReset()
    prismaMock.notificationDelivery.create.mockReset()
    discordMock.sendDiscordChannelMessage.mockReset()
    prismaMock.notification.create.mockResolvedValue(notification)
  })

  it('returns null when the user no longer exists', async () => {
    const { createNotification } = await import('../src/notifications/notification.service.js')
    prismaMock.user.findUnique.mockResolvedValue(null)

    await expect(createNotification(baseInput)).resolves.toBeNull()
    expect(prismaMock.notification.create).not.toHaveBeenCalled()
  })

  it('creates default preferences and marks disabled in-app notifications as read', async () => {
    const { createNotification } = await import('../src/notifications/notification.service.js')
    prismaMock.user.findUnique.mockResolvedValue({ id: 'user-1', discordUserId: null, notificationPrefs: null })
    prismaMock.notificationPreference.create.mockResolvedValue({
      inAppEnabled: false,
      discordEnabled: false,
      missingBpAlerts: true,
      wantedBpAlerts: true,
      planetExpiryAlerts: true,
    })

    await expect(createNotification({ ...baseInput, clanId: undefined })).resolves.toBe(notification)

    expect(prismaMock.notificationPreference.create).toHaveBeenCalledWith({ data: { userId: 'user-1' } })
    expect(prismaMock.notification.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: 'user-1',
        type: 'BLUEPRINT_MISSING_ACTIVE',
        title: 'Missing BP',
        body: 'Sirius Sammler is active.',
        payloadJson: { blueprintId: 'bp-1' },
        readAt: expect.any(Date),
      }),
    })
    expect(prismaMock.clanDiscordSettings.findUnique).not.toHaveBeenCalled()
  })

  it('does not send Discord deliveries when preferences or clan settings block it', async () => {
    const { createNotification } = await import('../src/notifications/notification.service.js')
    prismaMock.user.findUnique.mockResolvedValue({
      id: 'user-1',
      discordUserId: 'discord-1',
      notificationPrefs: {
        inAppEnabled: true,
        discordEnabled: false,
        missingBpAlerts: true,
        wantedBpAlerts: true,
        planetExpiryAlerts: true,
      },
    })

    await expect(createNotification(baseInput)).resolves.toBe(notification)
    expect(prismaMock.clanDiscordSettings.findUnique).not.toHaveBeenCalled()

    prismaMock.user.findUnique.mockResolvedValue({
      id: 'user-1',
      discordUserId: 'discord-1',
      notificationPrefs: {
        inAppEnabled: true,
        discordEnabled: true,
        missingBpAlerts: false,
        wantedBpAlerts: true,
        planetExpiryAlerts: true,
      },
    })

    await expect(createNotification(baseInput)).resolves.toBe(notification)
    expect(prismaMock.clanDiscordSettings.findUnique).not.toHaveBeenCalled()

    prismaMock.user.findUnique.mockResolvedValue({
      id: 'user-1',
      discordUserId: 'discord-1',
      notificationPrefs: {
        inAppEnabled: true,
        discordEnabled: true,
        missingBpAlerts: true,
        wantedBpAlerts: true,
        planetExpiryAlerts: true,
      },
    })
    prismaMock.clanDiscordSettings.findUnique.mockResolvedValue({ enabled: false, notificationChannelId: 'channel-1' })

    await expect(createNotification(baseInput)).resolves.toBe(notification)
    expect(discordMock.sendDiscordChannelMessage).not.toHaveBeenCalled()
  })

  it('sends Discord deliveries and records sent or failed status', async () => {
    const { createNotification } = await import('../src/notifications/notification.service.js')
    prismaMock.user.findUnique.mockResolvedValue({
      id: 'user-1',
      discordUserId: 'discord-1',
      notificationPrefs: {
        inAppEnabled: true,
        discordEnabled: true,
        missingBpAlerts: true,
        wantedBpAlerts: true,
        planetExpiryAlerts: true,
      },
    })
    prismaMock.clanDiscordSettings.findUnique.mockResolvedValue({ enabled: true, notificationChannelId: 'channel-1' })
    discordMock.sendDiscordChannelMessage.mockResolvedValueOnce({ ok: true }).mockResolvedValueOnce({ ok: false, error: 'No access.' })

    await createNotification(baseInput)
    await createNotification({ ...baseInput, type: 'BLUEPRINT_WANTED_ACTIVE' })

    expect(discordMock.sendDiscordChannelMessage).toHaveBeenCalledWith('channel-1', {
      content: '<@discord-1> **Missing BP**\nSirius Sammler is active.',
      allowed_mentions: { users: ['discord-1'], parse: [] },
    })
    expect(prismaMock.notificationDelivery.create.mock.calls[0][0]).toEqual({
      data: expect.objectContaining({
        notificationId: 'notification-1',
        channel: 'DISCORD',
        status: 'SENT',
        target: 'channel-1',
        error: null,
        sentAt: expect.any(Date),
      }),
    })
    expect(prismaMock.notificationDelivery.create.mock.calls[1][0]).toEqual({
      data: expect.objectContaining({
        status: 'FAILED',
        error: 'No access.',
        sentAt: null,
      }),
    })
  })

  it('records skipped Discord deliveries without mentions', async () => {
    const { createNotification } = await import('../src/notifications/notification.service.js')
    prismaMock.user.findUnique.mockResolvedValue({
      id: 'user-1',
      discordUserId: null,
      notificationPrefs: {
        inAppEnabled: true,
        discordEnabled: true,
        missingBpAlerts: true,
        wantedBpAlerts: true,
        planetExpiryAlerts: true,
      },
    })
    prismaMock.clanDiscordSettings.findUnique.mockResolvedValue({ enabled: true, notificationChannelId: 'channel-1' })
    discordMock.sendDiscordChannelMessage.mockResolvedValue({ ok: false, skipped: true, error: 'Token missing.' })

    await createNotification({ ...baseInput, type: 'PLANET_EXPIRING', payloadJson: undefined })
    await createNotification({ ...baseInput, type: 'SYSTEM', payloadJson: undefined })

    expect(prismaMock.notification.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ payloadJson: undefined, readAt: undefined }),
    })
    expect(discordMock.sendDiscordChannelMessage).toHaveBeenCalledWith('channel-1', {
      content: '**Missing BP**\nSirius Sammler is active.',
      allowed_mentions: { parse: [] },
    })
    expect(prismaMock.notificationDelivery.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ status: 'SKIPPED', error: 'Token missing.' }),
    })
  })
})
