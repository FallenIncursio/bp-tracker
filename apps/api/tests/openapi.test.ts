import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { openApiSpec } from '../src/openapi/spec.js'

const rootPackage = JSON.parse(readFileSync(new URL('../../../package.json', import.meta.url), 'utf8')) as { version: string }

describe('OpenAPI specification', () => {
  it('exposes the expected API metadata and security scheme', () => {
    expect(openApiSpec.openapi).toBe('3.1.0')
    expect(openApiSpec.info.title).toBe('BP Tracker API')
    expect(openApiSpec.info.version).toBe(rootPackage.version)
    expect(openApiSpec.components.securitySchemes.cookieAuth).toMatchObject({
      type: 'apiKey',
      in: 'cookie',
    })
  })

  it('documents the main route groups', () => {
    expect(openApiSpec.paths['/api/health']?.get).toBeDefined()
    expect(openApiSpec.paths['/api/openapi.json']?.get).toBeDefined()
    expect(openApiSpec.paths['/api/docs']?.get).toBeDefined()
    expect(openApiSpec.paths['/api/auth/login']?.post).toBeDefined()
    expect(openApiSpec.paths['/api/auth/invites/{token}']?.get).toBeDefined()
    expect(openApiSpec.paths['/api/auth/invites/{token}/accept']?.post).toBeDefined()
    expect(openApiSpec.paths['/api/clans/{clanId}/members']?.get).toBeDefined()
    expect(openApiSpec.paths['/api/clans/{clanId}/members/{userId}/invite']?.post).toBeDefined()
    expect(openApiSpec.paths['/api/clans/{clanId}/blueprint-overview']?.get).toBeDefined()
    expect(openApiSpec.paths['/api/clans/{clanId}/members/{userId}/tracking']?.patch).toBeDefined()
    expect(openApiSpec.paths['/api/clans/{clanId}/discord-settings/status/publish']?.post).toBeDefined()
    expect(openApiSpec.paths['/api/blueprints']?.get).toBeDefined()
    expect(openApiSpec.paths['/api/sirius/clans/{clanId}/active']?.get).toBeDefined()
    expect(openApiSpec.paths['/api/sirius/clans/{clanId}/spawn-plan']?.get).toBeDefined()
    expect(openApiSpec.paths['/api/sirius/spawn-windows/{spawnWindowId}/cancel']?.patch).toBeDefined()
    expect(openApiSpec.paths['/api/sirius/clans/{clanId}/journey']?.get).toBeDefined()
    expect(openApiSpec.paths['/api/sirius/clans/{clanId}/journey']?.post).toBeDefined()
    expect(openApiSpec.paths['/api/sirius/journey/{stopId}']?.patch).toBeDefined()
    expect(openApiSpec.paths['/api/checker/check']?.post).toBeDefined()
    expect(openApiSpec.paths['/api/notifications/preferences']?.patch).toBeDefined()
    expect(openApiSpec.paths['/api/users/{userId}']?.patch).toBeDefined()
    expect(openApiSpec.paths['/api/audit']?.get).toBeDefined()
  })

  it('uses Zod-derived request schemas for important request bodies', () => {
    expect(openApiSpec.components.schemas.LoginRequest).toMatchObject({
      type: 'object',
      required: ['username', 'password'],
    })
    expect(openApiSpec.components.schemas.CheckerRequest).toMatchObject({
      type: 'object',
      required: ['clanId', 'blueprintIds'],
    })
    expect(openApiSpec.components.schemas.CreateClanRequest).toMatchObject({
      type: 'object',
      required: ['name', 'slug'],
    })
    expect(openApiSpec.components.schemas.CreateClanJourneyStopRequest).toMatchObject({
      type: 'object',
    })
    expect(openApiSpec.components.schemas.UpdateMembershipTrackingRequest).toMatchObject({
      type: 'object',
      required: ['trackingExcluded'],
    })
    expect(openApiSpec.components.schemas.PublishClanDiscordStatusRequest).toMatchObject({
      type: 'object',
    })
  })

  it('documents Discord notification and status settings', () => {
    expect(openApiSpec.components.schemas.ClanDiscordSettings.properties).toMatchObject({
      notificationChannelId: expect.any(Object),
      statusChannelId: expect.any(Object),
      statusRoadmapMessageId: expect.any(Object),
      statusPlanetsMessageId: expect.any(Object),
      statusPinMessages: { type: 'boolean' },
      statusLastPublishedAt: expect.any(Object),
    })
    expect(openApiSpec.components.schemas.DiscordStatusPublishResult.properties).toMatchObject({
      published: { type: 'boolean' },
      roadmapMessageId: expect.any(Object),
      planetsMessageId: expect.any(Object),
      warnings: { type: 'array', items: { type: 'string' } },
    })
  })

  it('documents localized blueprint translations', () => {
    expect(openApiSpec.components.schemas.Translation).toMatchObject({
      type: 'object',
      required: ['locale', 'name', 'source', 'verified'],
    })
    expect(openApiSpec.components.schemas.Blueprint.properties).toMatchObject({
      translations: { type: 'array' },
      itemTypeTranslations: { type: 'array' },
    })
  })

  it('marks protected write operations with cookie auth and role hints', () => {
    expect(openApiSpec.paths['/api/clans']?.post.security).toEqual([{ cookieAuth: [] }])
    expect(openApiSpec.paths['/api/clans']?.post['x-required-role']).toBe('Global ADMIN')
    expect(openApiSpec.paths['/api/sirius/clans/{clanId}/appearances']?.post['x-required-role']).toBe('Clan LIEUTENANT')
    expect(openApiSpec.paths['/api/sirius/clans/{clanId}/journey']?.get['x-required-role']).toBe('Clan MEMBER')
    expect(openApiSpec.paths['/api/sirius/clans/{clanId}/journey']?.post['x-required-role']).toBe('Clan LIEUTENANT')
    expect(openApiSpec.paths['/api/clans/{clanId}/members']?.get['x-required-role']).toBe('Clan MEMBER')
    expect(openApiSpec.paths['/api/clans/{clanId}/members/{userId}/invite']?.post['x-required-role']).toBe('Clan COMMANDER')
    expect(openApiSpec.paths['/api/clans/{clanId}/blueprint-overview']?.get['x-required-role']).toBe('Clan MEMBER')
    expect(openApiSpec.paths['/api/clans/{clanId}/members/{userId}/tracking']?.patch['x-required-role']).toBe('Clan COMMANDER')
    expect(openApiSpec.paths['/api/clans/{clanId}/discord-settings/status/publish']?.post['x-required-role']).toBe('Clan ADMIRAL')
    expect(openApiSpec.paths['/api/audit']?.get['x-required-role']).toBe('Global ADMIN')
    expect(openApiSpec.paths['/api/auth/logout']?.post.security).toEqual([{ cookieAuth: [] }])
  })
})
