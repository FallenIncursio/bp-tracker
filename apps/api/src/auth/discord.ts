import crypto from 'node:crypto'
import { env } from '../utils/env.js'
import { HttpError } from '../utils/http.js'

const stateTtlMs = 10 * 60 * 1000
const discordApiBase = 'https://discord.com/api/v10'

export type DiscordAuthMode = 'login' | 'register' | 'link'

export type DiscordOAuthState = {
  mode: DiscordAuthMode
  redirect: string
  clanId?: string
  expiresAt: number
}

export type DiscordUserProfile = {
  id: string
  username: string
  global_name?: string | null
  avatar?: string | null
  email?: string | null
  verified?: boolean
}

const base64UrlJson = (value: unknown) => Buffer.from(JSON.stringify(value), 'utf8').toString('base64url')

const sign = (payload: string) =>
  crypto.createHmac('sha256', env.discordOAuthStateSecret).update(payload).digest('base64url')

export const normalizeRelativeRedirect = (value: unknown, fallback = '/account') => {
  if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//')) {
    return fallback
  }

  const parsed = new URL(value, 'https://bp-tracker.local')
  return `${parsed.pathname}${parsed.search}${parsed.hash}`
}

export const createDiscordOAuthState = (mode: DiscordAuthMode, redirect: string, clanId?: string) => {
  const payload = base64UrlJson({
    mode,
    redirect: normalizeRelativeRedirect(redirect),
    clanId,
    expiresAt: Date.now() + stateTtlMs,
  } satisfies DiscordOAuthState)
  return `${payload}.${sign(payload)}`
}

export const verifyDiscordOAuthState = (state: string): DiscordOAuthState => {
  const [payload, signature] = state.split('.')
  if (!payload || !signature) {
    throw new HttpError(400, 'Invalid Discord OAuth state.')
  }

  const expected = sign(payload)
  const signatureBuffer = Buffer.from(signature)
  const expectedBuffer = Buffer.from(expected)
  if (signatureBuffer.length !== expectedBuffer.length || !crypto.timingSafeEqual(signatureBuffer, expectedBuffer)) {
    throw new HttpError(400, 'Invalid Discord OAuth state.')
  }

  const parsed = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as DiscordOAuthState
  if (!['login', 'register', 'link'].includes(parsed.mode) || parsed.expiresAt < Date.now()) {
    throw new HttpError(400, 'Expired Discord OAuth state.')
  }

  return {
    mode: parsed.mode,
    redirect: normalizeRelativeRedirect(parsed.redirect),
    clanId: parsed.clanId,
    expiresAt: parsed.expiresAt,
  }
}

export const getDiscordRedirectUri = () =>
  env.discordRedirectUri ?? `${env.apiBaseUrl.replace(/\/$/, '')}/api/auth/discord/callback`

export const requireDiscordOAuthConfig = () => {
  if (!env.discordClientId || !env.discordClientSecret) {
    throw new HttpError(503, 'Discord OAuth is not configured.')
  }
}

export const buildDiscordAuthorizeUrl = (state: string) => {
  requireDiscordOAuthConfig()
  const url = new URL('https://discord.com/oauth2/authorize')
  url.searchParams.set('client_id', env.discordClientId!)
  url.searchParams.set('redirect_uri', getDiscordRedirectUri())
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('scope', 'identify email')
  url.searchParams.set('state', state)
  return url.toString()
}

export const exchangeDiscordCode = async (code: string) => {
  requireDiscordOAuthConfig()
  const body = new URLSearchParams({
    client_id: env.discordClientId!,
    client_secret: env.discordClientSecret!,
    grant_type: 'authorization_code',
    code,
    redirect_uri: getDiscordRedirectUri(),
  })

  const response = await fetch(`${discordApiBase}/oauth2/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  })

  const payload = (await response.json().catch(() => ({}))) as { access_token?: string; error?: string; error_description?: string }
  if (!response.ok || !payload.access_token) {
    throw new HttpError(502, payload.error_description ?? payload.error ?? 'Discord token exchange failed.')
  }

  return payload.access_token
}

export const fetchDiscordUserProfile = async (accessToken: string): Promise<DiscordUserProfile> => {
  const response = await fetch(`${discordApiBase}/users/@me`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })

  const payload = (await response.json().catch(() => ({}))) as Partial<DiscordUserProfile> & { message?: string }
  if (!response.ok || !payload.id || !payload.username) {
    throw new HttpError(502, payload.message ?? 'Discord profile request failed.')
  }

  return {
    id: payload.id,
    username: payload.username,
    global_name: payload.global_name ?? null,
    avatar: payload.avatar ?? null,
    email: payload.email ?? null,
    verified: payload.verified ?? false,
  }
}

export const toClientRedirect = (relativeRedirect: string, params: Record<string, string | undefined> = {}) => {
  const url = new URL(normalizeRelativeRedirect(relativeRedirect), env.publicBaseUrl)
  for (const [key, value] of Object.entries(params)) {
    if (value) {
      url.searchParams.set(key, value)
    }
  }
  return url.toString()
}
