import { describe, expect, it } from 'vitest'
import { afterEach, beforeEach, vi } from 'vitest'
import { env } from '../src/utils/env.js'
import {
  buildDiscordAuthorizeUrl,
  createDiscordOAuthState,
  exchangeDiscordCode,
  fetchDiscordUserProfile,
  getDiscordRedirectUri,
  normalizeRelativeRedirect,
  requireDiscordOAuthConfig,
  toClientRedirect,
  verifyDiscordOAuthState,
} from '../src/auth/discord.js'

const originalEnv = {
  discordClientId: env.discordClientId,
  discordClientSecret: env.discordClientSecret,
  discordRedirectUri: env.discordRedirectUri,
  apiBaseUrl: env.apiBaseUrl,
  publicBaseUrl: env.publicBaseUrl,
}

describe('Discord OAuth helpers', () => {
  beforeEach(() => {
    env.discordClientId = 'client-1'
    env.discordClientSecret = 'secret-1'
    env.discordRedirectUri = undefined
    env.apiBaseUrl = 'https://api.example.test'
    env.publicBaseUrl = 'https://bp.example.test'
  })

  afterEach(() => {
    Object.assign(env, originalEnv)
    vi.unstubAllGlobals()
  })

  it('round-trips signed OAuth state', () => {
    const state = createDiscordOAuthState('register', '/account?tab=discord', 'f0c0ce6f-5c60-4a58-b8b3-2f6b19186a2d')
    const parsed = verifyDiscordOAuthState(state)

    expect(parsed.mode).toBe('register')
    expect(parsed.redirect).toBe('/account?tab=discord')
    expect(parsed.clanId).toBe('f0c0ce6f-5c60-4a58-b8b3-2f6b19186a2d')
  })

  it('rejects tampered OAuth state', () => {
    const state = createDiscordOAuthState('login', '/account')

    expect(() => verifyDiscordOAuthState(`${state}x`)).toThrow()
    expect(() => verifyDiscordOAuthState('invalid')).toThrow('Invalid Discord OAuth state.')
  })

  it('rejects expired or unsupported OAuth state payloads', () => {
    const expired = createDiscordOAuthState('login', '/account')
    vi.useFakeTimers()
    vi.setSystemTime(Date.now() + 11 * 60 * 1000)
    expect(() => verifyDiscordOAuthState(expired)).toThrow('Expired Discord OAuth state.')
    vi.useRealTimers()

    const invalidMode = createDiscordOAuthState('invalid' as never, '/account')
    expect(() => verifyDiscordOAuthState(invalidMode)).toThrow('Expired Discord OAuth state.')
  })

  it('allows only relative client redirects', () => {
    expect(normalizeRelativeRedirect('/account?discord=linked')).toBe('/account?discord=linked')
    expect(normalizeRelativeRedirect('/account#discord')).toBe('/account#discord')
    expect(normalizeRelativeRedirect('https://evil.example/account')).toBe('/account')
    expect(normalizeRelativeRedirect('//evil.example/account')).toBe('/account')
    expect(normalizeRelativeRedirect(12)).toBe('/account')
    expect(normalizeRelativeRedirect('/ok', '/fallback')).toBe('/ok')
    expect(normalizeRelativeRedirect('/%zz', '/fallback')).toBe('/%zz')
  })

  it('builds authorize and client redirect urls from config', () => {
    const authorize = new URL(buildDiscordAuthorizeUrl('state-1'))

    expect(getDiscordRedirectUri()).toBe('https://api.example.test/api/auth/discord/callback')
    expect(authorize.origin).toBe('https://discord.com')
    expect(authorize.searchParams.get('client_id')).toBe('client-1')
    expect(authorize.searchParams.get('redirect_uri')).toBe('https://api.example.test/api/auth/discord/callback')
    expect(authorize.searchParams.get('scope')).toBe('identify email')
    expect(toClientRedirect('/account', { discord: 'linked', empty: undefined })).toBe(
      'https://bp.example.test/account?discord=linked'
    )
  })

  it('rejects missing Discord OAuth configuration', () => {
    env.discordClientId = undefined

    expect(() => requireDiscordOAuthConfig()).toThrow('Discord OAuth is not configured.')
    env.discordClientId = 'client-1'
    env.discordClientSecret = undefined
    expect(() => requireDiscordOAuthConfig()).toThrow('Discord OAuth is not configured.')
  })

  it('exchanges Discord codes and surfaces token errors', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ access_token: 'access-1' }) })
      .mockResolvedValueOnce({ ok: false, json: async () => ({ error_description: 'bad code' }) })
      .mockResolvedValueOnce({
        ok: false,
        json: async () => {
          throw new Error('bad json')
        },
      })
    vi.stubGlobal('fetch', fetchMock)

    await expect(exchangeDiscordCode('code-1')).resolves.toBe('access-1')
    await expect(exchangeDiscordCode('code-2')).rejects.toThrow('bad code')
    await expect(exchangeDiscordCode('code-3')).rejects.toThrow('Discord token exchange failed.')
    expect(fetchMock.mock.calls[0][0]).toBe('https://discord.com/api/v10/oauth2/token')
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ method: 'POST' })
  })

  it('fetches Discord profiles and rejects invalid payloads', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: 'discord-1',
          username: 'Pilot',
          global_name: undefined,
          avatar: undefined,
          email: undefined,
          verified: undefined,
        }),
      })
      .mockResolvedValueOnce({ ok: false, json: async () => ({ message: 'nope' }) })
      .mockResolvedValueOnce({
        ok: false,
        json: async () => {
          throw new Error('bad json')
        },
      })
    vi.stubGlobal('fetch', fetchMock)

    await expect(fetchDiscordUserProfile('access-1')).resolves.toEqual({
      id: 'discord-1',
      username: 'Pilot',
      global_name: null,
      avatar: null,
      email: null,
      verified: false,
    })
    await expect(fetchDiscordUserProfile('access-2')).rejects.toThrow('nope')
    await expect(fetchDiscordUserProfile('access-3')).rejects.toThrow('Discord profile request failed.')
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ headers: { Authorization: 'Bearer access-1' } })
  })
})
