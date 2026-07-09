import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { env } from '../src/utils/env.js'
import {
  editDiscordChannelMessage,
  formatDiscordChannelName,
  getDiscordChannel,
  listDiscordGuildChannels,
  pinDiscordChannelMessage,
  sendDiscordChannelMessage,
} from '../src/notifications/discord.js'

const originalToken = env.discordBotToken

describe('Discord notification sender', () => {
  beforeEach(() => {
    env.discordBotToken = 'bot-token'
  })

  afterEach(() => {
    env.discordBotToken = originalToken
    vi.unstubAllGlobals()
  })

  it('skips when channel or bot token is missing', async () => {
    await expect(sendDiscordChannelMessage(null, { content: 'hello' })).resolves.toEqual({
      ok: false,
      skipped: true,
      error: 'Discord channel is not configured.',
    })

    env.discordBotToken = undefined
    await expect(sendDiscordChannelMessage('channel-1', { content: 'hello' })).resolves.toEqual({
      ok: false,
      skipped: true,
      error: 'Discord bot token is not configured.',
    })

    await expect(editDiscordChannelMessage(null, 'message-1', { content: 'hello' })).resolves.toEqual({
      ok: false,
      skipped: true,
      error: 'Discord channel or message is not configured.',
    })
    await expect(pinDiscordChannelMessage('channel-1', null)).resolves.toEqual({
      ok: false,
      skipped: true,
      error: 'Discord channel or message is not configured.',
    })
  })

  it('sends messages and reports API failures', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ id: 'message-1' }) })
      .mockResolvedValueOnce({ ok: false, status: 403, json: async () => ({ message: 'Forbidden' }) })
      .mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: async () => {
          throw new Error('bad json')
        },
      })
    vi.stubGlobal('fetch', fetchMock)

    await expect(sendDiscordChannelMessage('channel-1', { content: 'hello' })).resolves.toEqual({ ok: true })
    await expect(sendDiscordChannelMessage('channel-1', { content: 'hello' })).resolves.toEqual({ ok: true, messageId: 'message-1' })
    await expect(sendDiscordChannelMessage('channel-1', { content: 'hello' })).resolves.toEqual({
      ok: false,
      status: 403,
      error: 'Forbidden',
    })
    await expect(sendDiscordChannelMessage('channel-1', { content: 'hello' })).resolves.toEqual({
      ok: false,
      status: 500,
      error: 'Discord API returned 500.',
    })

    expect(fetchMock.mock.calls[0][0]).toBe('https://discord.com/api/v10/channels/channel-1/messages')
    expect(fetchMock.mock.calls[0][1]).toMatchObject({
      method: 'POST',
      headers: {
        Authorization: 'Bot bot-token',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ content: 'hello' }),
    })
  })

  it('edits and pins status messages', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true })
      .mockResolvedValueOnce({ ok: false, status: 404, json: async () => ({ message: 'Unknown Message' }) })
      .mockResolvedValueOnce({ ok: true, status: 204 })
      .mockResolvedValueOnce({ ok: false, status: 403, json: async () => ({ message: 'Missing Permissions' }) })
    vi.stubGlobal('fetch', fetchMock)

    await expect(editDiscordChannelMessage('channel-1', 'message-1', { content: 'updated' })).resolves.toEqual({ ok: true })
    await expect(editDiscordChannelMessage('channel-1', 'missing', { content: 'updated' })).resolves.toEqual({
      ok: false,
      status: 404,
      error: 'Unknown Message',
    })
    await expect(pinDiscordChannelMessage('channel-1', 'message-1')).resolves.toEqual({ ok: true })
    await expect(pinDiscordChannelMessage('channel-1', 'message-2')).resolves.toEqual({
      ok: false,
      status: 403,
      error: 'Missing Permissions',
    })

    expect(fetchMock.mock.calls[0][0]).toBe('https://discord.com/api/v10/channels/channel-1/messages/message-1')
    expect(fetchMock.mock.calls[0][1]).toMatchObject({
      method: 'PATCH',
      body: JSON.stringify({ content: 'updated' }),
    })
    expect(fetchMock.mock.calls[2][0]).toBe('https://discord.com/api/v10/channels/channel-1/pins/message-1')
    expect(fetchMock.mock.calls[2][1]).toMatchObject({ method: 'PUT' })
  })

  it('skips edit and pin requests when the bot token is missing', async () => {
    env.discordBotToken = undefined

    await expect(editDiscordChannelMessage('channel-1', 'message-1', { content: 'updated' })).resolves.toEqual({
      ok: false,
      skipped: true,
      error: 'Discord bot token is not configured.',
    })
    await expect(pinDiscordChannelMessage('channel-1', 'message-1')).resolves.toEqual({
      ok: false,
      skipped: true,
      error: 'Discord bot token is not configured.',
    })
  })

  it('lists bot-visible text channels for a guild', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => [
        { id: 'channel-2', name: 'zeta', type: 0, guild_id: 'guild-1', parent_id: null },
        { id: 'voice-1', name: 'voice', type: 2, guild_id: 'guild-1', parent_id: null },
        { id: 'broken-channel', name: 42, type: 0, guild_id: 'guild-1', parent_id: null },
        { id: 'channel-1', name: 'alpha', type: 5, guild_id: 'guild-1', parent_id: 'category-1' },
      ],
    })
    vi.stubGlobal('fetch', fetchMock)

    await expect(listDiscordGuildChannels('guild-1')).resolves.toEqual({
      ok: true,
      data: [
        { id: 'channel-1', name: 'alpha', type: 5, guildId: 'guild-1', parentId: 'category-1' },
        { id: 'channel-2', name: 'zeta', type: 0, guildId: 'guild-1', parentId: null },
      ],
    })
    expect(fetchMock.mock.calls[0][0]).toBe('https://discord.com/api/v10/guilds/guild-1/channels')
    expect(formatDiscordChannelName({ name: 'alpha' })).toBe('#alpha')
  })

  it('skips channel reads when the bot token is missing', async () => {
    env.discordBotToken = undefined

    await expect(listDiscordGuildChannels('guild-1')).resolves.toEqual({
      ok: false,
      skipped: true,
      error: 'Discord bot token is not configured.',
    })
    await expect(getDiscordChannel('channel-1')).resolves.toEqual({
      ok: false,
      skipped: true,
      error: 'Discord bot token is not configured.',
    })
  })

  it('fetches channel metadata and rejects non-message channels', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ id: 'channel-1', name: 'drops', type: 0, guild_id: 'guild-1' }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ id: 'voice-1', name: 'voice', type: 2, guild_id: 'guild-1' }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ id: 'broken', type: 0, guild_id: 'guild-1' }) })
      .mockResolvedValueOnce({ ok: false, status: 404, json: async () => ({ message: 'Unknown Channel' }) })
    vi.stubGlobal('fetch', fetchMock)

    await expect(getDiscordChannel('channel-1')).resolves.toEqual({
      ok: true,
      data: { id: 'channel-1', name: 'drops', type: 0, guildId: 'guild-1', parentId: null },
    })
    await expect(getDiscordChannel('voice-1')).resolves.toEqual({
      ok: false,
      error: 'Discord channel must be a text or announcement channel.',
    })
    await expect(getDiscordChannel('broken')).resolves.toEqual({
      ok: false,
      error: 'Discord channel response could not be parsed.',
    })
    await expect(getDiscordChannel('missing')).resolves.toEqual({ ok: false, status: 404, error: 'Unknown Channel' })
  })
})
