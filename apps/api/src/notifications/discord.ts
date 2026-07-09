import { env } from '../utils/env.js'

const discordApiBase = 'https://discord.com/api/v10'
const messageChannelTypes = new Set([0, 5])

export type DiscordEmbedPayload = {
  title?: string
  description?: string
  color?: number
  fields?: Array<{
    name: string
    value: string
    inline?: boolean
  }>
  timestamp?: string
  footer?: {
    text: string
  }
}

export type DiscordMessagePayload = {
  content: string
  embeds?: DiscordEmbedPayload[]
  allowed_mentions?: {
    users?: string[]
    roles?: string[]
    parse?: Array<'users' | 'roles' | 'everyone'>
  }
}

export type DiscordSendResult =
  | { ok: true; skipped?: false; messageId?: string }
  | { ok: false; skipped: true; error: string }
  | { ok: false; skipped?: false; error: string; status?: number }

export type DiscordEditResult =
  | { ok: true }
  | { ok: false; skipped: true; error: string }
  | { ok: false; skipped?: false; error: string; status?: number }

export type DiscordGuildChannel = {
  id: string
  name: string
  type: number
  guildId: string
  parentId: string | null
}

export type DiscordApiResult<T> =
  | { ok: true; data: T }
  | { ok: false; skipped: true; error: string }
  | { ok: false; skipped?: false; error: string; status?: number }

type DiscordApiChannel = {
  id?: unknown
  name?: unknown
  type?: unknown
  guild_id?: unknown
  parent_id?: unknown
}

const discordHeaders = () => ({
  Authorization: `Bot ${env.discordBotToken}`,
  'Content-Type': 'application/json',
})

const parseDiscordChannel = (payload: DiscordApiChannel): DiscordGuildChannel | null => {
  if (
    typeof payload.id !== 'string' ||
    typeof payload.name !== 'string' ||
    typeof payload.type !== 'number' ||
    typeof payload.guild_id !== 'string'
  ) {
    return null
  }

  return {
    id: payload.id,
    name: payload.name,
    type: payload.type,
    guildId: payload.guild_id,
    parentId: typeof payload.parent_id === 'string' ? payload.parent_id : null,
  }
}

const readDiscordJson = async (response: Response) => {
  if (typeof response.json !== 'function') return {}
  return (await response.json().catch(() => ({}))) as Record<string, unknown>
}

const formatDiscordApiError = async (response: Response) => {
  const payload = (await readDiscordJson(response)) as { message?: string }
  return payload.message ?? `Discord API returned ${response.status}.`
}

const getDiscordJson = async <T>(path: string): Promise<DiscordApiResult<T>> => {
  if (!env.discordBotToken) {
    return { ok: false, skipped: true, error: 'Discord bot token is not configured.' }
  }

  const response = await fetch(`${discordApiBase}${path}`, {
    headers: discordHeaders(),
  })

  if (!response.ok) {
    return { ok: false, status: response.status, error: await formatDiscordApiError(response) }
  }

  return { ok: true, data: (await response.json()) as T }
}

export const isDiscordMessageChannel = (channel: Pick<DiscordGuildChannel, 'type'>) => messageChannelTypes.has(channel.type)

export const listDiscordGuildChannels = async (guildId: string): Promise<DiscordApiResult<DiscordGuildChannel[]>> => {
  const result = await getDiscordJson<DiscordApiChannel[]>(`/guilds/${guildId}/channels`)
  if (!result.ok) return result

  return {
    ok: true,
    data: result.data
      .map(parseDiscordChannel)
      .filter((channel): channel is DiscordGuildChannel => channel !== null && isDiscordMessageChannel(channel))
      .sort((left, right) => left.name.localeCompare(right.name, 'en')),
  }
}

export const getDiscordChannel = async (channelId: string): Promise<DiscordApiResult<DiscordGuildChannel>> => {
  const result = await getDiscordJson<DiscordApiChannel>(`/channels/${channelId}`)
  if (!result.ok) return result

  const channel = parseDiscordChannel(result.data)
  if (!channel) {
    return { ok: false, error: 'Discord channel response could not be parsed.' }
  }
  if (!isDiscordMessageChannel(channel)) {
    return { ok: false, error: 'Discord channel must be a text or announcement channel.' }
  }

  return { ok: true, data: channel }
}

export const formatDiscordChannelName = (channel: Pick<DiscordGuildChannel, 'name'>) => `#${channel.name}`

export const sendDiscordChannelMessage = async (
  channelId: string | null | undefined,
  payload: DiscordMessagePayload
): Promise<DiscordSendResult> => {
  if (!channelId) {
    return { ok: false, skipped: true, error: 'Discord channel is not configured.' }
  }
  if (!env.discordBotToken) {
    return { ok: false, skipped: true, error: 'Discord bot token is not configured.' }
  }

  const response = await fetch(`${discordApiBase}/channels/${channelId}/messages`, {
    method: 'POST',
    headers: discordHeaders(),
    body: JSON.stringify(payload),
  })

  if (response.ok) {
    const body = (await readDiscordJson(response)) as { id?: unknown }
    return typeof body.id === 'string' ? { ok: true, messageId: body.id } : { ok: true }
  }

  return { ok: false, status: response.status, error: await formatDiscordApiError(response) }
}

export const editDiscordChannelMessage = async (
  channelId: string | null | undefined,
  messageId: string | null | undefined,
  payload: DiscordMessagePayload
): Promise<DiscordEditResult> => {
  if (!channelId || !messageId) {
    return { ok: false, skipped: true, error: 'Discord channel or message is not configured.' }
  }
  if (!env.discordBotToken) {
    return { ok: false, skipped: true, error: 'Discord bot token is not configured.' }
  }

  const response = await fetch(`${discordApiBase}/channels/${channelId}/messages/${messageId}`, {
    method: 'PATCH',
    headers: discordHeaders(),
    body: JSON.stringify(payload),
  })

  if (response.ok) {
    return { ok: true }
  }

  return { ok: false, status: response.status, error: await formatDiscordApiError(response) }
}

export const pinDiscordChannelMessage = async (
  channelId: string | null | undefined,
  messageId: string | null | undefined
): Promise<DiscordEditResult> => {
  if (!channelId || !messageId) {
    return { ok: false, skipped: true, error: 'Discord channel or message is not configured.' }
  }
  if (!env.discordBotToken) {
    return { ok: false, skipped: true, error: 'Discord bot token is not configured.' }
  }

  const response = await fetch(`${discordApiBase}/channels/${channelId}/pins/${messageId}`, {
    method: 'PUT',
    headers: discordHeaders(),
  })

  if (response.ok || response.status === 204) {
    return { ok: true }
  }

  return { ok: false, status: response.status, error: await formatDiscordApiError(response) }
}
