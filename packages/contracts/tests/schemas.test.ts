import { describe, expect, it } from 'vitest'
import {
  approveMembershipSchema,
  blueprintRarities,
  blueprintSlotGroups,
  blueprintStatuses,
  bulkUpdateBlueprintStatusSchema,
  changePasswordSchema,
  checkerRequestSchema,
  clanJourneyStopCertainties,
  clanJourneyStopStatuses,
  clanRoles,
  createClanSchema,
  createClanJourneyStopSchema,
  createSiriusAppearanceSchema,
  discordStatusLocales,
  globalRoles,
  loginSchema,
  membershipStatuses,
  publishClanDiscordStatusSchema,
  registerSchema,
  replaceSiriusSlotsSchema,
  reorderClanJourneyStopsSchema,
  setPasswordSchema,
  setupAdminSchema,
  siriusEnemyTypes,
  siriusSlotPhases,
  siriusTechTiers,
  updateBlueprintStatusSchema,
  updateClanDiscordSettingsSchema,
  updateClanJourneyStopSchema,
  updateMembershipRoleSchema,
  updateMembershipTrackingSchema,
  updateMyProfileSchema,
  updateSiriusAppearanceSchema,
  upsertSiriusSlotSchema,
} from '../src/index.js'

const uuid = 'f0c0ce6f-5c60-4a58-b8b3-2f6b19186a2d'
const otherUuid = 'e0c0ce6f-5c60-4a58-b8b3-2f6b19186a2d'
const iso = '2026-07-09T20:00:00.000Z'

describe('contract constants', () => {
  it('exposes stable enum values used by API and web', () => {
    expect(globalRoles).toEqual(['USER', 'ADMIN'])
    expect(clanRoles).toEqual(['MEMBER', 'LIEUTENANT', 'COMMANDER', 'ADMIRAL'])
    expect(membershipStatuses).toContain('PENDING')
    expect(blueprintStatuses).toEqual(['MISSING', 'OWNED', 'WANTED'])
    expect(blueprintSlotGroups).toContain('RESOURCE')
    expect(siriusSlotPhases).toEqual(['CURRENT', 'NEXT'])
    expect(siriusEnemyTypes).toEqual(['SORIS', 'AMARNA', 'GIZA'])
    expect(siriusTechTiers).toEqual(['OOLYTE', 'DOLOMYTE', 'CLAY', 'KENYTE', 'ANCIENT'])
    expect(clanJourneyStopStatuses).toEqual(['PLANNED', 'CURRENT', 'COMPLETED', 'SKIPPED', 'CANCELLED'])
    expect(clanJourneyStopCertainties).toEqual(['CONFIRMED', 'TENTATIVE'])
    expect(blueprintRarities).toContain('ANCIENT')
    expect(blueprintRarities).toContain('COSMETIC')
    expect(discordStatusLocales).toEqual(['de', 'en', 'es'])
  })
})

describe('auth and account schemas', () => {
  it('validates login, setup, registration, profile and password payloads', () => {
    expect(loginSchema.parse({ username: 'pilot', password: '12345678' })).toEqual({ username: 'pilot', password: '12345678' })
    expect(changePasswordSchema.parse({ currentPassword: '12345678', newPassword: 'abcdefgh' })).toEqual({
      currentPassword: '12345678',
      newPassword: 'abcdefgh',
    })
    expect(setPasswordSchema.parse({ newPassword: 'abcdefgh' })).toEqual({ newPassword: 'abcdefgh' })
    expect(updateMyProfileSchema.parse({ displayName: 'Pilot One' })).toEqual({ displayName: 'Pilot One' })
    expect(setupAdminSchema.parse({ username: 'admin', password: '12345678', displayName: 'Admin', setupToken: 'token' })).toEqual({
      username: 'admin',
      password: '12345678',
      displayName: 'Admin',
      setupToken: 'token',
    })
    expect(registerSchema.parse({ username: 'pilot', password: '12345678', displayName: 'Pilot', email: '', clanId: uuid })).toEqual({
      username: 'pilot',
      password: '12345678',
      displayName: 'Pilot',
      email: '',
      clanId: uuid,
    })
  })

  it('rejects short auth and profile values', () => {
    expect(() => loginSchema.parse({ username: 'p', password: '12345678' })).toThrow()
    expect(() => changePasswordSchema.parse({ currentPassword: '1234567', newPassword: 'abcdefgh' })).toThrow()
    expect(() => updateMyProfileSchema.parse({ displayName: 'A' })).toThrow()
    expect(() => registerSchema.parse({ username: 'pilot', password: '12345678', displayName: 'Pilot', email: 'bad', clanId: uuid })).toThrow()
  })
})

describe('clan and membership schemas', () => {
  it('validates clan, membership and Discord settings payloads', () => {
    expect(createClanSchema.parse({ name: 'Aurora Fleet', slug: 'aurora-fleet' })).toEqual({
      name: 'Aurora Fleet',
      slug: 'aurora-fleet',
      isPublic: true,
    })
    expect(updateMembershipRoleSchema.parse({ role: 'ADMIRAL' })).toEqual({ role: 'ADMIRAL' })
    expect(updateMembershipRoleSchema.parse({ role: 'LIEUTENANT' })).toEqual({ role: 'LIEUTENANT' })
    expect(updateMembershipTrackingSchema.parse({ trackingExcluded: true, reason: 'inactive' })).toEqual({
      trackingExcluded: true,
      reason: 'inactive',
    })
    expect(approveMembershipSchema.parse({})).toEqual({ role: 'MEMBER' })
    expect(
      updateClanDiscordSettingsSchema.parse({
        enabled: true,
        statusEnabled: true,
        statusPinMessages: false,
        guildId: '123456789012345678',
        notificationChannelId: '223456789012345678',
        notificationChannelName: '#bauplaene',
        statusChannelId: '323456789012345678',
        statusChannelName: '#bp-status',
      }),
    ).toEqual({
      enabled: true,
      statusEnabled: true,
      statusPinMessages: false,
      guildId: '123456789012345678',
      notificationChannelId: '223456789012345678',
      notificationChannelName: '#bauplaene',
      statusChannelId: '323456789012345678',
      statusChannelName: '#bp-status',
      statusLocale: 'de',
    })
    expect(updateClanDiscordSettingsSchema.parse({ enabled: false })).toEqual({
      enabled: false,
      statusEnabled: false,
      statusPinMessages: true,
      statusLocale: 'de',
    })
    expect(updateClanDiscordSettingsSchema.parse({ enabled: false, statusLocale: 'en' })).toEqual({
      enabled: false,
      statusEnabled: false,
      statusPinMessages: true,
      statusLocale: 'en',
    })
    expect(publishClanDiscordStatusSchema.parse({})).toEqual({ recreateMessages: false })
    expect(publishClanDiscordStatusSchema.parse({ recreateMessages: true })).toEqual({ recreateMessages: true })
  })

  it('rejects malformed clan and Discord settings payloads', () => {
    expect(() => createClanSchema.parse({ name: 'L', slug: 'Bad Slug' })).toThrow()
    expect(() => updateMembershipRoleSchema.parse({ role: 'ADMIN' })).toThrow()
    expect(() => updateClanDiscordSettingsSchema.parse({ enabled: true, guildId: '123' })).toThrow()
    expect(() => updateClanDiscordSettingsSchema.parse({ enabled: false, statusChannelId: 'abc' })).toThrow()
    expect(() => publishClanDiscordStatusSchema.parse({ recreateMessages: 'yes' })).toThrow()
  })
})

describe('blueprint and checker schemas', () => {
  it('validates single and bulk blueprint status updates', () => {
    expect(updateBlueprintStatusSchema.parse({ status: 'OWNED' })).toEqual({ status: 'OWNED' })
    expect(bulkUpdateBlueprintStatusSchema.parse({ blueprintIds: [uuid, otherUuid], status: 'WANTED' })).toEqual({
      blueprintIds: [uuid, otherUuid],
      status: 'WANTED',
    })
    expect(() => updateBlueprintStatusSchema.parse({ status: 'UNKNOWN' })).toThrow()
  })

  it('validates checker requests', () => {
    const siriusSizedBlueprintList = Array.from({ length: 200 }, () => otherUuid)
    expect(checkerRequestSchema.parse({ clanId: uuid, blueprintIds: [otherUuid] })).toEqual({
      clanId: uuid,
      blueprintIds: [otherUuid],
      includeExcluded: false,
    })
    expect(checkerRequestSchema.parse({ clanId: uuid, blueprintIds: siriusSizedBlueprintList }).blueprintIds).toHaveLength(200)
    expect(checkerRequestSchema.parse({ clanId: uuid, blueprintIds: [otherUuid], userIds: [uuid] })).toEqual({
      clanId: uuid,
      blueprintIds: [otherUuid],
      userIds: [uuid],
      includeExcluded: false,
    })
    expect(() => checkerRequestSchema.parse({ clanId: uuid, blueprintIds: [] })).toThrow()
  })
})

describe('Sirius schemas', () => {
  it('validates create and update appearance payloads', () => {
    expect(createSiriusAppearanceSchema.parse({ planetName: 'Kenyte Scout', expiresAt: iso })).toEqual({
      planetName: 'Kenyte Scout',
      ring: 5,
      expiresAt: iso,
    })
    expect(createSiriusAppearanceSchema.parse({ planetId: uuid, ring: 4, observedAt: iso, expiresAt: iso, notes: 'ok' })).toEqual({
      planetId: uuid,
      ring: 4,
      observedAt: iso,
      expiresAt: iso,
      notes: 'ok',
    })
    expect(updateSiriusAppearanceSchema.parse({ ring: 3 })).toEqual({ ring: 3 })
  })

  it('rejects invalid Sirius appearance payloads', () => {
    expect(() => createSiriusAppearanceSchema.parse({ expiresAt: iso })).toThrow()
    expect(() => createSiriusAppearanceSchema.parse({ planetName: 'X', ring: 1, expiresAt: iso })).toThrow()
    expect(() => createSiriusAppearanceSchema.parse({ planetName: 'Valid', ring: 0, expiresAt: iso })).toThrow()
  })

  it('validates slot upserts and bulk replacements', () => {
    expect(upsertSiriusSlotSchema.parse({ slotGroup: 'SLOT_2', enemyType: 'GIZA', blueprintId: uuid })).toEqual({
      slotGroup: 'SLOT_2',
      enemyType: 'GIZA',
      blueprintId: uuid,
    })
    expect(upsertSiriusSlotSchema.parse({ slotGroup: 'SLOT_2', enemyType: null, blueprintId: uuid })).toEqual({
      slotGroup: 'SLOT_2',
      enemyType: null,
      blueprintId: uuid,
    })
    expect(replaceSiriusSlotsSchema.parse({ slots: [{ slotGroup: 'RESOURCE', blueprintId: uuid }] })).toEqual({
      slots: [{ slotGroup: 'RESOURCE', blueprintId: uuid }],
    })
    expect(() => upsertSiriusSlotSchema.parse({ slotGroup: 'SLOT_2', enemyType: 'Soris', blueprintId: uuid })).toThrow()
    expect(() => replaceSiriusSlotsSchema.parse({ slots: Array.from({ length: 41 }, () => ({ slotGroup: 'RESOURCE', blueprintId: uuid })) })).toThrow()
  })

  it('validates clan journey stops and reordering', () => {
    expect(createClanJourneyStopSchema.parse({ planetName: 'Eqcos' })).toEqual({
      planetName: 'Eqcos',
      ring: 5,
      status: 'PLANNED',
      certainty: 'CONFIRMED',
    })
    expect(
      createClanJourneyStopSchema.parse({
        appearanceId: uuid,
        ring: 4,
        arriveAt: iso,
        departAt: '2026-07-10T20:00:00.000Z',
        status: 'CURRENT',
        certainty: 'TENTATIVE',
      }),
    ).toMatchObject({
      appearanceId: uuid,
      ring: 4,
      arriveAt: iso,
      status: 'CURRENT',
      certainty: 'TENTATIVE',
    })
    expect(updateClanJourneyStopSchema.parse({ status: 'COMPLETED' })).toEqual({ status: 'COMPLETED' })
    expect(reorderClanJourneyStopsSchema.parse({ stopIds: [uuid, otherUuid] })).toEqual({ stopIds: [uuid, otherUuid] })
    expect(createClanJourneyStopSchema.parse({ ring: 5 })).toEqual({
      ring: 5,
      status: 'PLANNED',
      certainty: 'CONFIRMED',
    })
    expect(() => createClanJourneyStopSchema.parse({ planetName: 'X' })).toThrow()
    expect(() => updateClanJourneyStopSchema.parse({ status: 'DONE' })).toThrow()
    expect(() => reorderClanJourneyStopsSchema.parse({ stopIds: [] })).toThrow()
  })
})
