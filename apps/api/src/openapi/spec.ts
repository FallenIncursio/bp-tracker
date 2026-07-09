import { z, type ZodTypeAny } from 'zod'
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
  siriusSpawnWindowStatuses,
  siriusTechTiers,
  updateBlueprintStatusSchema,
  updateClanDiscordSettingsSchema,
  updateClanJourneyStopSchema,
  updateMembershipRoleSchema,
  updateMembershipTrackingSchema,
  updateMyProfileSchema,
  updateSiriusAppearanceSchema,
  upsertSiriusSlotSchema,
} from '@bp-tracker/contracts'
import { env } from '../utils/env.js'

type JsonSchema = Record<string, unknown>
type OpenApiContent = {
  content: { 'application/json': { schema: JsonSchema } }
}
type OpenApiResponse = { description: string } & Partial<OpenApiContent>
type OpenApiOperation = {
  tags: string[]
  summary: string
  description?: string
  operationId: string
  security?: Array<Record<string, string[]>>
  parameters?: JsonSchema[]
  requestBody?: { required?: boolean } & OpenApiContent
  responses: Record<string, OpenApiResponse>
  'x-required-role'?: string
}

type OpenApiSpec = {
  openapi: '3.1.0'
  info: {
    title: string
    version: string
    description: string
    license: { name: string }
  }
  servers: Array<{ url: string; description: string }>
  tags: Array<{ name: string; description: string }>
  paths: Record<string, Record<string, OpenApiOperation>>
  components: {
    securitySchemes: Record<string, JsonSchema>
    schemas: Record<string, JsonSchema>
  }
}

const stripJsonSchemaMeta = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(stripJsonSchemaMeta)
  if (!value || typeof value !== 'object') return value

  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => key !== '$schema')
      .map(([key, nested]) => [key, stripJsonSchemaMeta(nested)]),
  )
}

const fromZod = (schema: ZodTypeAny) => stripJsonSchemaMeta(z.toJSONSchema(schema, { io: 'input' })) as JsonSchema
const ref = (name: string): JsonSchema => ({
  $ref: `#/components/schemas/${name}`,
})
const arrayOf = (schema: JsonSchema): JsonSchema => ({
  type: 'array',
  items: schema,
})
const nullable = (schema: JsonSchema): JsonSchema => ({
  anyOf: [schema, { type: 'null' }],
})
const enumSchema = (values: readonly string[]): JsonSchema => ({
  type: 'string',
  enum: [...values],
})
const stringSchema = (format?: string): JsonSchema => (format ? { type: 'string', format } : { type: 'string' })
const id = stringSchema('uuid')
const dateTime = stringSchema('date-time')

const objectSchema = (properties: Record<string, JsonSchema>, required = Object.keys(properties), extra: JsonSchema = {}): JsonSchema => ({
  type: 'object',
  properties,
  required,
  additionalProperties: false,
  ...extra,
})

const looseObject = (description?: string): JsonSchema => ({
  type: 'object',
  additionalProperties: true,
  ...(description ? { description } : {}),
})

const jsonBody = (schema: JsonSchema, required = true) => ({
  required,
  content: {
    'application/json': { schema },
  },
})

const ok = (schema: JsonSchema, description = 'OK'): OpenApiResponse => ({
  description,
  content: { 'application/json': { schema } },
})

const empty = (description = 'No content'): OpenApiResponse => ({
  description,
})

const errorResponses = {
  '400': ok(ref('ApiError'), 'Bad request'),
  '401': ok(ref('ApiError'), 'Authentication required'),
  '403': ok(ref('ApiError'), 'Forbidden'),
  '404': ok(ref('ApiError'), 'Not found'),
  '409': ok(ref('ApiError'), 'Conflict'),
}

const cookieAuth = [{ cookieAuth: [] }]

const param = (
  name: string,
  schema: JsonSchema,
  description: string,
  location: 'path' | 'query' = 'path',
  required = location === 'path',
) => ({
  name,
  in: location,
  required,
  description,
  schema,
})

const clanIdParam = param('clanId', id, 'Clan ID.')
const userIdParam = param('userId', id, 'User ID.')
const blueprintIdParam = param('blueprintId', id, 'Blueprint ID.')
const appearanceIdParam = param('appearanceId', id, 'Sirius appearance ID.')
const slotIdParam = param('slotId', id, 'Sirius slot ID.')
const journeyStopIdParam = param('stopId', id, 'Clan journey stop ID.')
const clanIdQuery = param('clanId', id, 'Clan ID.', 'query')
const includeExcludedQuery = param('includeExcluded', { type: 'boolean' }, 'Include members excluded from tracking.', 'query', false)
const siriusScopeQuery = param(
  'siriusScope',
  enumSchema(['own', 'all-ring5']),
  'Sirius checker scope. Only applies when the selected system is Sirius.',
  'query',
  false,
)
const includeSiriusResourcesQuery = param(
  'includeSiriusResources',
  { type: 'boolean' },
  'Include Sirius ring 1-4 resource blueprints. Only applies when the selected system is Sirius.',
  'query',
  false,
)

const secured = (operation: OpenApiOperation, role?: string): OpenApiOperation => ({
  ...operation,
  security: cookieAuth,
  ...(role
    ? {
        'x-required-role': role,
        description: [operation.description, `Required role: ${role}.`].filter(Boolean).join('\n\n'),
      }
    : {}),
})

const schemas: Record<string, JsonSchema> = {
  ApiError: objectSchema(
    {
      error: stringSchema(),
      details: looseObject('Optional validation or diagnostic details.'),
    },
    ['error'],
  ),
  GlobalRole: enumSchema(globalRoles),
  ClanRole: enumSchema(clanRoles),
  MembershipStatus: enumSchema(membershipStatuses),
  BlueprintStatus: enumSchema(blueprintStatuses),
  BlueprintSlotGroup: enumSchema(blueprintSlotGroups),
  SiriusSlotPhase: enumSchema(siriusSlotPhases),
  SiriusEnemyType: enumSchema(siriusEnemyTypes),
  SiriusTechTier: enumSchema(siriusTechTiers),
  SiriusSpawnWindowStatus: enumSchema(siriusSpawnWindowStatuses),
  SiriusSpawnWindowDerivedStatus: enumSchema(['ACTIVE_SOURCE', 'WAITING_FOR_SPAWN', 'OVERDUE', 'RESOLVED', 'CANCELLED']),
  ClanJourneyStopStatus: enumSchema(clanJourneyStopStatuses),
  ClanJourneyStopCertainty: enumSchema(clanJourneyStopCertainties),
  BlueprintRarity: enumSchema(blueprintRarities),
  LoginRequest: fromZod(loginSchema),
  RegisterRequest: fromZod(registerSchema),
  SetupAdminRequest: fromZod(setupAdminSchema),
  ChangePasswordRequest: fromZod(changePasswordSchema),
  SetPasswordRequest: fromZod(setPasswordSchema),
  UpdateMyProfileRequest: fromZod(updateMyProfileSchema),
  CreateClanRequest: fromZod(createClanSchema),
  UpdateMembershipRoleRequest: fromZod(updateMembershipRoleSchema),
  UpdateMembershipTrackingRequest: fromZod(updateMembershipTrackingSchema),
  ApproveMembershipRequest: fromZod(approveMembershipSchema),
  UpdateClanDiscordSettingsRequest: fromZod(updateClanDiscordSettingsSchema),
  PublishClanDiscordStatusRequest: fromZod(publishClanDiscordStatusSchema),
  UpdateBlueprintStatusRequest: fromZod(updateBlueprintStatusSchema),
  BulkUpdateBlueprintStatusRequest: fromZod(bulkUpdateBlueprintStatusSchema),
  CreateSiriusAppearanceRequest: fromZod(createSiriusAppearanceSchema),
  UpdateSiriusAppearanceRequest: fromZod(updateSiriusAppearanceSchema),
  UpsertSiriusSlotRequest: fromZod(upsertSiriusSlotSchema),
  ReplaceSiriusSlotsRequest: fromZod(replaceSiriusSlotsSchema),
  CreateClanJourneyStopRequest: fromZod(createClanJourneyStopSchema),
  UpdateClanJourneyStopRequest: fromZod(updateClanJourneyStopSchema),
  ReorderClanJourneyStopsRequest: fromZod(reorderClanJourneyStopsSchema),
  CheckerRequest: fromZod(checkerRequestSchema),
  DiscordLinkRequest: fromZod(z.object({ redirect: z.string().optional() })),
  DiscordUnlinkRequest: fromZod(z.object({ currentPassword: z.string().min(8).max(200) })),
  UpdateNotificationPreferencesRequest: fromZod(
    z.object({
      inAppEnabled: z.boolean().optional(),
      discordEnabled: z.boolean().optional(),
      missingBpAlerts: z.boolean().optional(),
      wantedBpAlerts: z.boolean().optional(),
      planetExpiryAlerts: z.boolean().optional(),
    }),
  ),
  CreateBlueprintRequest: fromZod(
    z.object({
      canonicalName: z.string().min(2).max(240),
      nameDe: z.string().trim().min(2).max(240).optional(),
      nameEn: z.string().trim().min(2).max(240).nullable().optional(),
      systemId: z.string().uuid().optional(),
      itemTypeId: z.string().uuid().optional(),
      variant: z.string().max(80).optional(),
      slotGroup: z.enum(blueprintSlotGroups).optional(),
      siriusRing: z.number().int().min(1).max(5).nullable().optional(),
      siriusTechTier: z.enum(siriusTechTiers).nullable().optional(),
      rarity: z.enum(blueprintRarities).default('STANDARD'),
      partsRequired: z.number().int().positive().optional(),
      level: z.number().int().positive().optional(),
      price: z.number().int().nonnegative().optional(),
      sourceNotes: z.string().max(2000).optional(),
    }),
  ),
  UpdateUserRequest: fromZod(
    z.object({
      displayName: z.string().min(2).max(120).optional(),
      email: z.string().email().nullable().optional(),
      isActive: z.boolean().optional(),
      globalRole: z.enum(globalRoles).optional(),
      discordUserId: z.string().max(120).nullable().optional(),
      newPassword: z.string().min(8).max(200).optional(),
    }),
  ),
  AuthUser: objectSchema({
    id,
    username: stringSchema(),
    displayName: stringSchema(),
    globalRole: ref('GlobalRole'),
    hasPassword: { type: 'boolean' },
    discord: objectSchema({
      linked: { type: 'boolean' },
      username: nullable(stringSchema()),
      globalName: nullable(stringSchema()),
      avatarHash: nullable(stringSchema()),
    }),
    memberships: arrayOf(
      objectSchema({
        clanId: id,
        clanName: stringSchema(),
        clanSlug: stringSchema(),
        role: ref('ClanRole'),
        status: ref('MembershipStatus'),
        trackingExcluded: { type: 'boolean' },
      }),
    ),
  }),
  Clan: objectSchema({
    id,
    name: stringSchema(),
    slug: stringSchema(),
    isPublic: { type: 'boolean' },
    memberCount: { type: 'integer', minimum: 0 },
  }),
  ClanMember: objectSchema(
    {
      userId: id,
      displayName: stringSchema(),
      role: ref('ClanRole'),
      status: ref('MembershipStatus'),
      trackingExcluded: { type: 'boolean' },
      username: stringSchema(),
      trackingExcludedAt: nullable(dateTime),
      trackingExcludedReason: nullable(stringSchema()),
      approvedAt: nullable(dateTime),
    },
    ['userId', 'displayName', 'role', 'status', 'trackingExcluded'],
  ),
  ClanDiscordSettings: objectSchema({
    clanId: id,
    guildId: nullable(stringSchema()),
    notificationChannelId: nullable(stringSchema()),
    notificationChannelName: nullable(stringSchema()),
    enabled: { type: 'boolean' },
    statusEnabled: { type: 'boolean' },
    statusChannelId: nullable(stringSchema()),
    statusChannelName: nullable(stringSchema()),
    statusRoadmapMessageId: nullable(stringSchema()),
    statusPlanetsMessageId: nullable(stringSchema()),
    statusPinMessages: { type: 'boolean' },
    statusLastPublishedAt: nullable(dateTime),
    statusLastError: nullable(stringSchema()),
  }),
  DiscordStatusPublishResult: objectSchema({
    published: { type: 'boolean' },
    roadmapMessageId: nullable(stringSchema()),
    planetsMessageId: nullable(stringSchema()),
    warnings: arrayOf(stringSchema()),
  }),
  DiscordGuildChannel: objectSchema({
    id: stringSchema(),
    name: stringSchema(),
    displayName: stringSchema(),
    type: { type: 'integer' },
    guildId: stringSchema(),
    parentId: nullable(stringSchema()),
  }),
  Translation: objectSchema({
    locale: stringSchema(),
    name: stringSchema(),
    source: nullable(stringSchema()),
    verified: { type: 'boolean' },
  }),
  Blueprint: objectSchema({
    id,
    canonicalName: stringSchema(),
    nameDe: stringSchema(),
    nameEn: nullable(stringSchema()),
    translations: arrayOf(ref('Translation')),
    systemName: nullable(stringSchema()),
    itemTypeName: nullable(stringSchema()),
    itemTypeNameDe: nullable(stringSchema()),
    itemTypeNameEn: nullable(stringSchema()),
    itemTypeTranslations: arrayOf(ref('Translation')),
    slotGroup: nullable(ref('BlueprintSlotGroup')),
    siriusRing: nullable({ type: 'integer', minimum: 1, maximum: 5 }),
    siriusTechTier: nullable(ref('SiriusTechTier')),
    rarity: ref('BlueprintRarity'),
    partsRequired: nullable({ type: 'integer', minimum: 1 }),
    level: nullable({ type: 'integer', minimum: 1 }),
  }),
  StatusUser: objectSchema({
    userId: id,
    displayName: stringSchema(),
  }),
  SlotCounts: objectSchema({
    owned: { type: 'integer', minimum: 0 },
    missing: { type: 'integer', minimum: 0 },
    wanted: { type: 'integer', minimum: 0 },
    unknown: { type: 'integer', minimum: 0 },
    users: objectSchema({
      missing: arrayOf(ref('StatusUser')),
      wanted: arrayOf(ref('StatusUser')),
    }),
  }),
  SiriusSlot: objectSchema({
    id,
    phase: ref('SiriusSlotPhase'),
    slotGroup: ref('BlueprintSlotGroup'),
    enemyType: nullable(ref('SiriusEnemyType')),
    locationName: nullable(stringSchema()),
    rawBlueprintName: nullable(stringSchema()),
    confidence: { type: 'number' },
    blueprint: nullable(ref('Blueprint')),
    counts: nullable(ref('SlotCounts')),
  }),
  SiriusAppearance: objectSchema({
    id,
    planet: looseObject('Sirius planet record.'),
    ring: { type: 'integer', minimum: 1, maximum: 5 },
    techTier: nullable(ref('SiriusTechTier')),
    observedAt: dateTime,
    expiresAt: dateTime,
    nextSpawnAt: nullable(dateTime),
    status: enumSchema(['ACTIVE', 'UPCOMING', 'EXPIRED']),
    notes: nullable(stringSchema()),
    slots: arrayOf(ref('SiriusSlot')),
  }),
  SiriusSpawnWindow: objectSchema({
    id,
    expectedAt: dateTime,
    status: ref('SiriusSpawnWindowStatus'),
    derivedStatus: ref('SiriusSpawnWindowDerivedStatus'),
    notes: nullable(stringSchema()),
    sourceAppearance: looseObject('Source Sirius appearance that announced this spawn.'),
    resolvedAppearance: nullable(looseObject('New Sirius appearance that resolved this spawn window.')),
  }),
  ClanJourneyMetrics: objectSchema({
    owned: { type: 'integer', minimum: 0 },
    missing: { type: 'integer', minimum: 0 },
    wanted: { type: 'integer', minimum: 0 },
  }),
  ClanJourneyStop: objectSchema({
    id,
    clanId: id,
    appearanceId: nullable(id),
    planetId: nullable(id),
    planetName: nullable(stringSchema()),
    ring: { type: 'integer', minimum: 1, maximum: 5 },
    arriveAt: nullable(dateTime),
    departAt: nullable(dateTime),
    status: ref('ClanJourneyStopStatus'),
    certainty: ref('ClanJourneyStopCertainty'),
    sortOrder: { type: 'integer', minimum: 0 },
    notes: nullable(stringSchema()),
    warnings: arrayOf(enumSchema(['UNLINKED_PLANET', 'ARRIVAL_OVERDUE', 'DEPARTURE_OVERDUE', 'PLANET_EXPIRED', 'ARRIVES_AFTER_EXPIRY'])),
    metrics: ref('ClanJourneyMetrics'),
    planet: nullable(looseObject('Linked or snapshotted Sirius planet.')),
    appearance: nullable(looseObject('Linked Sirius appearance.')),
    createdAt: dateTime,
    updatedAt: dateTime,
  }),
  NotificationPreferences: objectSchema({
    id,
    userId: id,
    inAppEnabled: { type: 'boolean' },
    discordEnabled: { type: 'boolean' },
    missingBpAlerts: { type: 'boolean' },
    wantedBpAlerts: { type: 'boolean' },
    planetExpiryAlerts: { type: 'boolean' },
    createdAt: dateTime,
    updatedAt: dateTime,
  }),
  AuditLog: looseObject('Audit log entry with actor metadata and before/after JSON snapshots.'),
}

const paths: OpenApiSpec['paths'] = {
  '/api/health': {
    get: {
      tags: ['System'],
      summary: 'Health check',
      operationId: 'getHealth',
      responses: {
        '200': ok(objectSchema({ ok: { type: 'boolean' }, service: stringSchema() })),
      },
    },
  },
  '/api/openapi.json': {
    get: {
      tags: ['System'],
      summary: 'Raw OpenAPI specification',
      operationId: 'getOpenApiSpec',
      responses: { '200': ok(looseObject('OpenAPI 3.1 document.')) },
    },
  },
  '/api/docs': {
    get: {
      tags: ['System'],
      summary: 'Swagger UI API documentation',
      operationId: 'getApiDocs',
      responses: { '200': { description: 'HTML documentation UI.' } },
    },
  },
  '/api/auth/setup-state': {
    get: {
      tags: ['Auth'],
      summary: 'Check whether first-admin setup is open',
      operationId: 'getSetupState',
      responses: {
        '200': ok(
          objectSchema({
            setupRequired: { type: 'boolean' },
            setupTokenRequired: { type: 'boolean' },
          }),
        ),
      },
    },
  },
  '/api/auth/setup': {
    post: {
      tags: ['Auth'],
      summary: 'Create the first global admin',
      operationId: 'setupAdmin',
      requestBody: jsonBody(ref('SetupAdminRequest')),
      responses: {
        '201': ok(objectSchema({ user: ref('AuthUser') })),
        ...errorResponses,
      },
    },
  },
  '/api/auth/register': {
    post: {
      tags: ['Auth'],
      summary: 'Register a user with pending clan membership',
      operationId: 'register',
      requestBody: jsonBody(ref('RegisterRequest')),
      responses: {
        '201': ok(objectSchema({ user: ref('AuthUser') })),
        ...errorResponses,
      },
    },
  },
  '/api/auth/login': {
    post: {
      tags: ['Auth'],
      summary: 'Login with username and password',
      operationId: 'login',
      requestBody: jsonBody(ref('LoginRequest')),
      responses: {
        '200': ok(objectSchema({ user: ref('AuthUser') })),
        ...errorResponses,
      },
    },
  },
  '/api/auth/discord': {
    get: {
      tags: ['Auth'],
      summary: 'Start Discord OAuth login, registration, or linking',
      operationId: 'startDiscordAuth',
      parameters: [
        param('mode', enumSchema(['login', 'register', 'link']), 'Discord auth mode.', 'query', false),
        param('redirect', stringSchema(), 'Relative web redirect after OAuth.', 'query', false),
        param('clanId', id, 'Clan to request when registering.', 'query', false),
      ],
      responses: {
        '302': { description: 'Redirects to Discord authorize URL.' },
        ...errorResponses,
      },
    },
  },
  '/api/auth/discord/link': {
    post: secured(
      {
        tags: ['Auth'],
        summary: 'Create a Discord linking URL for the current user',
        operationId: 'createDiscordLinkUrl',
        requestBody: jsonBody(ref('DiscordLinkRequest'), false),
        responses: {
          '200': ok(objectSchema({ authorizeUrl: stringSchema() })),
          ...errorResponses,
        },
      },
      'Authenticated user',
    ),
  },
  '/api/auth/discord/unlink': {
    post: secured(
      {
        tags: ['Auth'],
        summary: 'Unlink Discord from the current user',
        operationId: 'unlinkDiscord',
        requestBody: jsonBody(ref('DiscordUnlinkRequest')),
        responses: {
          '200': ok(objectSchema({ user: ref('AuthUser') })),
          ...errorResponses,
        },
      },
      'Authenticated user',
    ),
  },
  '/api/auth/discord/callback': {
    get: {
      tags: ['Auth'],
      summary: 'Discord OAuth callback',
      operationId: 'discordCallback',
      parameters: [
        param('code', stringSchema(), 'Discord OAuth authorization code.', 'query', false),
        param('state', stringSchema(), 'Signed OAuth state.', 'query', false),
      ],
      responses: {
        '302': { description: 'Redirects back to the web app.' },
        ...errorResponses,
      },
    },
  },
  '/api/auth/logout': {
    post: secured(
      {
        tags: ['Auth'],
        summary: 'Logout and revoke current session',
        operationId: 'logout',
        responses: { '204': empty(), ...errorResponses },
      },
      'Authenticated user',
    ),
  },
  '/api/auth/change-password': {
    post: secured(
      {
        tags: ['Auth'],
        summary: 'Change password for current user',
        operationId: 'changePassword',
        requestBody: jsonBody(ref('ChangePasswordRequest')),
        responses: { '204': empty(), ...errorResponses },
      },
      'Authenticated user',
    ),
  },
  '/api/auth/set-password': {
    post: secured(
      {
        tags: ['Auth'],
        summary: 'Set first password for a Discord-only account',
        operationId: 'setPassword',
        requestBody: jsonBody(ref('SetPasswordRequest')),
        responses: { '204': empty(), ...errorResponses },
      },
      'Authenticated user',
    ),
  },
  '/api/auth/me': {
    get: {
      tags: ['Auth'],
      summary: 'Get current session user',
      operationId: 'getCurrentUser',
      responses: {
        '200': ok(objectSchema({ user: nullable(ref('AuthUser')) })),
      },
    },
  },
  '/api/clans': {
    get: {
      tags: ['Clans'],
      summary: 'List public clans',
      operationId: 'listClans',
      responses: { '200': ok(objectSchema({ clans: arrayOf(ref('Clan')) })) },
    },
    post: secured(
      {
        tags: ['Clans'],
        summary: 'Create a clan',
        operationId: 'createClan',
        requestBody: jsonBody(ref('CreateClanRequest')),
        responses: {
          '201': ok(objectSchema({ clan: looseObject('Created clan record.') })),
          ...errorResponses,
        },
      },
      'Global ADMIN',
    ),
  },
  '/api/clans/{clanId}/discord-settings': {
    get: secured(
      {
        tags: ['Clans'],
        summary: 'Get clan Discord settings',
        operationId: 'getClanDiscordSettings',
        parameters: [clanIdParam],
        responses: {
          '200': ok(objectSchema({ settings: ref('ClanDiscordSettings') })),
          ...errorResponses,
        },
      },
      'Clan ADMIRAL',
    ),
    patch: secured(
      {
        tags: ['Clans'],
        summary: 'Update clan Discord settings',
        operationId: 'updateClanDiscordSettings',
        parameters: [clanIdParam],
        requestBody: jsonBody(ref('UpdateClanDiscordSettingsRequest')),
        responses: {
          '200': ok(objectSchema({ settings: ref('ClanDiscordSettings') })),
          ...errorResponses,
        },
      },
      'Clan ADMIRAL',
    ),
  },
  '/api/clans/{clanId}/discord-channels': {
    get: secured(
      {
        tags: ['Clans'],
        summary: 'List bot-visible Discord channels for a clan server',
        operationId: 'listClanDiscordChannels',
        parameters: [
          clanIdParam,
          param('guildId', stringSchema(), 'Discord server ID. Falls back to stored clan settings when omitted.', 'query', false),
        ],
        responses: {
          '200': ok(
            objectSchema(
              {
                available: { type: 'boolean' },
                channels: arrayOf(ref('DiscordGuildChannel')),
                error: nullable(stringSchema()),
              },
              ['available', 'channels'],
            ),
          ),
          ...errorResponses,
          '502': ok(ref('ApiError')),
        },
      },
      'Clan ADMIRAL',
    ),
  },
  '/api/clans/{clanId}/discord-settings/test': {
    post: secured(
      {
        tags: ['Clans'],
        summary: 'Send a test Discord notification for a clan',
        operationId: 'testClanDiscordSettings',
        parameters: [clanIdParam],
        responses: {
          '200': ok(objectSchema({ ok: { type: 'boolean' } })),
          ...errorResponses,
          '502': ok(ref('ApiError')),
          '503': ok(ref('ApiError')),
        },
      },
      'Clan ADMIRAL',
    ),
  },
  '/api/clans/{clanId}/discord-settings/status/publish': {
    post: secured(
      {
        tags: ['Clans'],
        summary: 'Publish or recreate the Discord status overview messages for a clan',
        operationId: 'publishClanDiscordStatus',
        parameters: [clanIdParam],
        requestBody: jsonBody(ref('PublishClanDiscordStatusRequest'), false),
        responses: {
          '200': ok(
            objectSchema({
              result: ref('DiscordStatusPublishResult'),
              settings: ref('ClanDiscordSettings'),
            }),
          ),
          ...errorResponses,
          '502': ok(ref('ApiError')),
          '503': ok(ref('ApiError')),
        },
      },
      'Clan ADMIRAL',
    ),
  },
  '/api/clans/{clanId}/members': {
    get: secured(
      {
        tags: ['Clans'],
        summary: 'List clan members',
        description: 'Regular members receive a redacted directory. Clan managers also receive usernames and tracking details.',
        operationId: 'listClanMembers',
        parameters: [clanIdParam],
        responses: {
          '200': ok(objectSchema({ members: arrayOf(ref('ClanMember')) })),
          ...errorResponses,
        },
      },
      'Clan MEMBER',
    ),
  },
  '/api/clans/{clanId}/registrations': {
    get: secured(
      {
        tags: ['Clans'],
        summary: 'List pending clan registrations',
        operationId: 'listClanRegistrations',
        parameters: [clanIdParam],
        responses: {
          '200': ok(
            objectSchema({
              registrations: arrayOf(looseObject('Pending registration row.')),
            }),
          ),
          ...errorResponses,
        },
      },
      'Clan COMMANDER',
    ),
  },
  '/api/clans/{clanId}/registrations/{userId}/approve': {
    post: secured(
      {
        tags: ['Clans'],
        summary: 'Approve a pending clan registration',
        operationId: 'approveClanRegistration',
        parameters: [clanIdParam, userIdParam],
        requestBody: jsonBody(ref('ApproveMembershipRequest'), false),
        responses: {
          '200': ok(
            objectSchema({
              membership: looseObject('Updated membership record.'),
            }),
          ),
          ...errorResponses,
        },
      },
      'Clan COMMANDER',
    ),
  },
  '/api/clans/{clanId}/registrations/{userId}/reject': {
    post: secured(
      {
        tags: ['Clans'],
        summary: 'Reject a pending clan registration',
        operationId: 'rejectClanRegistration',
        parameters: [clanIdParam, userIdParam],
        responses: {
          '200': ok(
            objectSchema({
              membership: looseObject('Updated membership record.'),
            }),
          ),
          ...errorResponses,
        },
      },
      'Clan COMMANDER',
    ),
  },
  '/api/clans/{clanId}/members/{userId}/role': {
    patch: secured(
      {
        tags: ['Clans'],
        summary: 'Change a clan member role',
        operationId: 'updateClanMemberRole',
        parameters: [clanIdParam, userIdParam],
        requestBody: jsonBody(ref('UpdateMembershipRoleRequest')),
        responses: {
          '200': ok(
            objectSchema({
              membership: looseObject('Updated membership record.'),
            }),
          ),
          ...errorResponses,
        },
      },
      'Clan role manager; cannot assign above own authority',
    ),
  },
  '/api/clans/{clanId}/members/{userId}/tracking': {
    patch: secured(
      {
        tags: ['Clans'],
        summary: 'Include or exclude a clan member from tracker calculations',
        operationId: 'updateClanMemberTracking',
        parameters: [clanIdParam, userIdParam],
        requestBody: jsonBody(ref('UpdateMembershipTrackingRequest')),
        responses: {
          '200': ok(
            objectSchema({
              membership: looseObject('Updated membership record.'),
            }),
          ),
          ...errorResponses,
        },
      },
      'Clan COMMANDER',
    ),
  },
  '/api/blueprints/systems': {
    get: {
      tags: ['Blueprints'],
      summary: 'List game systems',
      operationId: 'listBlueprintSystems',
      responses: {
        '200': ok(objectSchema({ systems: arrayOf(looseObject('Game system.')) })),
      },
    },
  },
  '/api/blueprints/item-types': {
    get: {
      tags: ['Blueprints'],
      summary: 'List blueprint item types',
      operationId: 'listBlueprintItemTypes',
      responses: {
        '200': ok(
          objectSchema({
            itemTypes: arrayOf(looseObject('Blueprint item type.')),
          }),
        ),
      },
    },
  },
  '/api/blueprints/me/statuses': {
    get: secured(
      {
        tags: ['Blueprints'],
        summary: 'List current user blueprint statuses',
        operationId: 'listMyBlueprintStatuses',
        responses: {
          '200': ok(
            objectSchema({
              statuses: arrayOf(looseObject('User blueprint status.')),
            }),
          ),
          ...errorResponses,
        },
      },
      'Authenticated user',
    ),
    put: secured(
      {
        tags: ['Blueprints'],
        summary: 'Bulk update current user blueprint statuses',
        operationId: 'bulkUpdateMyBlueprintStatuses',
        requestBody: jsonBody(ref('BulkUpdateBlueprintStatusRequest')),
        responses: {
          '200': ok(
            objectSchema({
              statuses: arrayOf(looseObject('User blueprint status.')),
            }),
          ),
          ...errorResponses,
        },
      },
      'Authenticated user',
    ),
  },
  '/api/blueprints/me/statuses/{blueprintId}': {
    put: secured(
      {
        tags: ['Blueprints'],
        summary: 'Update current user status for one blueprint',
        operationId: 'updateMyBlueprintStatus',
        parameters: [blueprintIdParam],
        requestBody: jsonBody(ref('UpdateBlueprintStatusRequest')),
        responses: {
          '200': ok(objectSchema({ status: looseObject('User blueprint status.') })),
          ...errorResponses,
        },
      },
      'Authenticated user',
    ),
  },
  '/api/blueprints': {
    get: {
      tags: ['Blueprints'],
      summary: 'Search blueprint catalog',
      operationId: 'listBlueprints',
      parameters: [
        param('q', stringSchema(), 'Case-insensitive blueprint name or alias search.', 'query', false),
        param('slotGroup', ref('BlueprintSlotGroup'), 'Slot group filter.', 'query', false),
        param('systemId', id, 'System ID filter.', 'query', false),
        param('itemTypeId', id, 'Item type ID filter.', 'query', false),
      ],
      responses: {
        '200': ok(objectSchema({ blueprints: arrayOf(ref('Blueprint')) })),
      },
    },
    post: secured(
      {
        tags: ['Blueprints'],
        summary: 'Create a blueprint master-data record',
        operationId: 'createBlueprint',
        requestBody: jsonBody(ref('CreateBlueprintRequest')),
        responses: {
          '201': ok(
            objectSchema({
              blueprint: looseObject('Created blueprint record.'),
            }),
          ),
          ...errorResponses,
        },
      },
      'Global ADMIN',
    ),
  },
  '/api/blueprints/{blueprintId}/members': {
    get: {
      tags: ['Blueprints'],
      summary: 'List member status for one blueprint in a clan',
      operationId: 'listBlueprintMembers',
      parameters: [blueprintIdParam, clanIdQuery],
      responses: {
        '200': ok(
          objectSchema({
            members: arrayOf(looseObject('Member blueprint status row.')),
          }),
        ),
        ...errorResponses,
      },
    },
  },
  '/api/blueprints/{blueprintId}': {
    get: {
      tags: ['Blueprints'],
      summary: 'Get one blueprint',
      operationId: 'getBlueprint',
      parameters: [blueprintIdParam],
      responses: {
        '200': ok(objectSchema({ blueprint: looseObject('Blueprint detail record.') })),
        ...errorResponses,
      },
    },
  },
  '/api/sirius/planets': {
    get: {
      tags: ['Sirius'],
      summary: 'List known Sirius planets',
      operationId: 'listSiriusPlanets',
      responses: {
        '200': ok(
          objectSchema({
            planets: arrayOf(looseObject('Sirius planet record.')),
          }),
        ),
      },
    },
  },
  '/api/sirius/drop-rules': {
    get: {
      tags: ['Sirius'],
      summary: 'List allowed Sirius drops for a ring and optional slot',
      operationId: 'listSiriusDropRules',
      parameters: [
        param('ring', { type: 'integer', minimum: 1, maximum: 5 }, 'Sirius ring.', 'query'),
        param('slotGroup', ref('BlueprintSlotGroup'), 'Slot group filter.', 'query', false),
      ],
      responses: {
        '200': ok(
          objectSchema({
            ring: { type: 'integer', minimum: 1, maximum: 5 },
            techTier: ref('SiriusTechTier'),
            slotGroups: arrayOf(ref('BlueprintSlotGroup')),
            blueprints: arrayOf(ref('Blueprint')),
          }),
        ),
        ...errorResponses,
      },
    },
  },
  '/api/sirius/clans/{clanId}/active': {
    get: {
      tags: ['Sirius'],
      summary: 'List active and upcoming Sirius appearances for a clan',
      operationId: 'listActiveSiriusAppearances',
      parameters: [clanIdParam],
      responses: {
        '200': ok(objectSchema({ appearances: arrayOf(ref('SiriusAppearance')) })),
        ...errorResponses,
      },
    },
  },
  '/api/sirius/clans/{clanId}/spawn-plan': {
    get: {
      tags: ['Sirius'],
      summary: 'List expected Sirius planet respawns for a clan',
      operationId: 'listSiriusSpawnPlan',
      parameters: [clanIdParam],
      responses: {
        '200': ok(objectSchema({ spawnWindows: arrayOf(ref('SiriusSpawnWindow')) })),
        ...errorResponses,
      },
    },
  },
  '/api/sirius/clans/{clanId}/journey': {
    get: secured(
      {
        tags: ['Sirius'],
        summary: 'List the clan journey roadmap',
        operationId: 'listClanJourney',
        parameters: [clanIdParam],
        responses: {
          '200': ok(objectSchema({ stops: arrayOf(ref('ClanJourneyStop')) })),
          ...errorResponses,
        },
      },
      'Clan MEMBER',
    ),
    post: secured(
      {
        tags: ['Sirius'],
        summary: 'Create a clan journey roadmap stop',
        operationId: 'createClanJourneyStop',
        parameters: [clanIdParam],
        requestBody: jsonBody(ref('CreateClanJourneyStopRequest')),
        responses: {
          '201': ok(objectSchema({ stop: ref('ClanJourneyStop') })),
          ...errorResponses,
        },
      },
      'Clan COMMANDER',
    ),
  },
  '/api/sirius/clans/{clanId}/journey/reorder': {
    put: secured(
      {
        tags: ['Sirius'],
        summary: 'Reorder clan journey roadmap stops',
        operationId: 'reorderClanJourneyStops',
        parameters: [clanIdParam],
        requestBody: jsonBody(ref('ReorderClanJourneyStopsRequest')),
        responses: {
          '200': ok(objectSchema({ stops: arrayOf(ref('ClanJourneyStop')) })),
          ...errorResponses,
        },
      },
      'Clan COMMANDER',
    ),
  },
  '/api/sirius/clans/{clanId}/history': {
    get: {
      tags: ['Sirius'],
      summary: 'List Sirius drop history for a clan',
      operationId: 'listSiriusHistory',
      parameters: [clanIdParam],
      responses: {
        '200': ok(
          objectSchema({
            history: arrayOf(looseObject('Sirius history row.')),
          }),
        ),
        ...errorResponses,
      },
    },
  },
  '/api/sirius/clans/{clanId}/appearances': {
    post: secured(
      {
        tags: ['Sirius'],
        summary: 'Create a Sirius planet appearance',
        operationId: 'createSiriusAppearance',
        parameters: [clanIdParam],
        requestBody: jsonBody(ref('CreateSiriusAppearanceRequest')),
        responses: {
          '201': ok(
            objectSchema({
              appearance: looseObject('Created Sirius appearance.'),
            }),
          ),
          ...errorResponses,
        },
      },
      'Clan COMMANDER',
    ),
  },
  '/api/sirius/appearances/{appearanceId}': {
    patch: secured(
      {
        tags: ['Sirius'],
        summary: 'Update a Sirius planet appearance',
        operationId: 'updateSiriusAppearance',
        parameters: [appearanceIdParam],
        requestBody: jsonBody(ref('UpdateSiriusAppearanceRequest')),
        responses: {
          '200': ok(
            objectSchema({
              appearance: looseObject('Updated Sirius appearance.'),
            }),
          ),
          ...errorResponses,
        },
      },
      'Clan COMMANDER for the appearance clan',
    ),
  },
  '/api/sirius/appearances/{appearanceId}/slots': {
    post: secured(
      {
        tags: ['Sirius'],
        summary: 'Add one Sirius slot to an appearance',
        operationId: 'createSiriusSlot',
        parameters: [appearanceIdParam],
        requestBody: jsonBody(ref('UpsertSiriusSlotRequest')),
        responses: {
          '201': ok(objectSchema({ slot: looseObject('Created Sirius slot.') })),
          ...errorResponses,
        },
      },
      'Clan COMMANDER for the appearance clan',
    ),
    put: secured(
      {
        tags: ['Sirius'],
        summary: 'Replace all Sirius slots for an appearance',
        operationId: 'replaceSiriusSlots',
        parameters: [appearanceIdParam],
        requestBody: jsonBody(ref('ReplaceSiriusSlotsRequest')),
        responses: {
          '200': ok(objectSchema({ slots: arrayOf(looseObject('Sirius slot.')) })),
          ...errorResponses,
        },
      },
      'Clan COMMANDER for the appearance clan',
    ),
  },
  '/api/sirius/slots/{slotId}': {
    patch: secured(
      {
        tags: ['Sirius'],
        summary: 'Update one Sirius slot',
        operationId: 'updateSiriusSlot',
        parameters: [slotIdParam],
        requestBody: jsonBody(ref('UpsertSiriusSlotRequest')),
        responses: {
          '200': ok(objectSchema({ slot: looseObject('Updated Sirius slot.') })),
          ...errorResponses,
        },
      },
      'Clan COMMANDER for the slot clan',
    ),
    delete: secured(
      {
        tags: ['Sirius'],
        summary: 'Delete one Sirius slot',
        operationId: 'deleteSiriusSlot',
        parameters: [slotIdParam],
        responses: { '204': empty(), ...errorResponses },
      },
      'Clan COMMANDER for the slot clan',
    ),
  },
  '/api/sirius/journey/{stopId}': {
    patch: secured(
      {
        tags: ['Sirius'],
        summary: 'Update one clan journey roadmap stop',
        operationId: 'updateClanJourneyStop',
        parameters: [journeyStopIdParam],
        requestBody: jsonBody(ref('UpdateClanJourneyStopRequest')),
        responses: {
          '200': ok(objectSchema({ stop: ref('ClanJourneyStop') })),
          ...errorResponses,
        },
      },
      'Clan COMMANDER for the stop clan',
    ),
    delete: secured(
      {
        tags: ['Sirius'],
        summary: 'Delete one clan journey roadmap stop',
        operationId: 'deleteClanJourneyStop',
        parameters: [journeyStopIdParam],
        responses: { '204': empty(), ...errorResponses },
      },
      'Clan COMMANDER for the stop clan',
    ),
  },
  '/api/checker/ships': {
    get: {
      tags: ['Checker'],
      summary: 'List ships available in the checker',
      operationId: 'listCheckerShips',
      responses: {
        '200': ok(objectSchema({ ships: arrayOf(looseObject('Checker ship row.')) })),
      },
    },
  },
  '/api/checker/ships/{shipId}': {
    get: {
      tags: ['Checker'],
      summary: 'Get one ship with blueprint requirements',
      operationId: 'getCheckerShip',
      parameters: [param('shipId', id, 'Ship ID.')],
      responses: {
        '200': ok(objectSchema({ ship: looseObject('Ship detail record.') })),
        ...errorResponses,
      },
    },
  },
  '/api/checker/ships/{shipId}/check': {
    get: {
      tags: ['Checker'],
      summary: 'Run checker for a ship against a clan',
      operationId: 'checkShip',
      parameters: [param('shipId', id, 'Ship ID.'), clanIdQuery, includeExcludedQuery],
      responses: {
        '200': ok(looseObject('Checker result.')),
        ...errorResponses,
      },
    },
  },
  '/api/checker/systems': {
    get: {
      tags: ['Checker'],
      summary: 'List systems available in the checker',
      operationId: 'listCheckerSystems',
      responses: {
        '200': ok(
          objectSchema({
            systems: arrayOf(looseObject('Checker system row.')),
          }),
        ),
      },
    },
  },
  '/api/checker/systems/{systemId}/check': {
    get: {
      tags: ['Checker'],
      summary: 'Run checker for a system against a clan',
      operationId: 'checkSystem',
      parameters: [param('systemId', id, 'System ID.'), clanIdQuery, includeExcludedQuery, siriusScopeQuery, includeSiriusResourcesQuery],
      responses: {
        '200': ok(looseObject('Checker result.')),
        ...errorResponses,
      },
    },
  },
  '/api/checker/groups': {
    get: {
      tags: ['Checker'],
      summary: 'List special checker groups',
      operationId: 'listCheckerGroups',
      responses: {
        '200': ok(objectSchema({ groups: arrayOf(looseObject('Checker group row.')) })),
      },
    },
  },
  '/api/checker/groups/{groupId}/check': {
    get: {
      tags: ['Checker'],
      summary: 'Run checker for a special group against a clan',
      operationId: 'checkGroup',
      parameters: [param('groupId', stringSchema(), 'Checker group ID.'), clanIdQuery, includeExcludedQuery],
      responses: {
        '200': ok(looseObject('Checker result.')),
        ...errorResponses,
      },
    },
  },
  '/api/checker/check': {
    post: {
      tags: ['Checker'],
      summary: 'Run checker for arbitrary blueprint IDs',
      operationId: 'runChecker',
      requestBody: jsonBody(ref('CheckerRequest')),
      responses: {
        '200': ok(looseObject('Checker result.')),
        ...errorResponses,
      },
    },
  },
  '/api/notifications': {
    get: secured(
      {
        tags: ['Notifications'],
        summary: 'List current user notifications',
        operationId: 'listNotifications',
        responses: {
          '200': ok(
            objectSchema({
              notifications: arrayOf(looseObject('Notification record.')),
            }),
          ),
          ...errorResponses,
        },
      },
      'Authenticated user',
    ),
  },
  '/api/notifications/preferences': {
    get: secured(
      {
        tags: ['Notifications'],
        summary: 'Get current user notification preferences',
        operationId: 'getNotificationPreferences',
        responses: {
          '200': ok(objectSchema({ preferences: ref('NotificationPreferences') })),
          ...errorResponses,
        },
      },
      'Authenticated user',
    ),
    patch: secured(
      {
        tags: ['Notifications'],
        summary: 'Update current user notification preferences',
        operationId: 'updateNotificationPreferences',
        requestBody: jsonBody(ref('UpdateNotificationPreferencesRequest'), false),
        responses: {
          '200': ok(objectSchema({ preferences: ref('NotificationPreferences') })),
          ...errorResponses,
        },
      },
      'Authenticated user',
    ),
  },
  '/api/notifications/{notificationId}/read': {
    patch: secured(
      {
        tags: ['Notifications'],
        summary: 'Mark one notification as read',
        operationId: 'markNotificationRead',
        parameters: [param('notificationId', id, 'Notification ID.')],
        responses: {
          '200': ok(
            objectSchema({
              notification: nullable(looseObject('Notification record.')),
            }),
          ),
          ...errorResponses,
        },
      },
      'Authenticated user',
    ),
  },
  '/api/users/me': {
    patch: secured(
      {
        tags: ['Users'],
        summary: 'Update current user profile',
        operationId: 'updateMyProfile',
        requestBody: jsonBody(ref('UpdateMyProfileRequest')),
        responses: {
          '200': ok(
            objectSchema({
              profile: objectSchema({ displayName: stringSchema() }),
            }),
          ),
          ...errorResponses,
        },
      },
      'Authenticated user',
    ),
  },
  '/api/users': {
    get: secured(
      {
        tags: ['Users'],
        summary: 'List users for admin management',
        operationId: 'listUsers',
        responses: {
          '200': ok(objectSchema({ users: arrayOf(looseObject('User admin row.')) })),
          ...errorResponses,
        },
      },
      'Global ADMIN',
    ),
  },
  '/api/users/{userId}': {
    patch: secured(
      {
        tags: ['Users'],
        summary: 'Update a user as admin',
        operationId: 'updateUser',
        parameters: [userIdParam],
        requestBody: jsonBody(ref('UpdateUserRequest')),
        responses: {
          '200': ok(objectSchema({ user: looseObject('Updated user row.') })),
          ...errorResponses,
        },
      },
      'Global ADMIN',
    ),
  },
  '/api/audit': {
    get: secured(
      {
        tags: ['Audit'],
        summary: 'List audit log entries',
        operationId: 'listAuditLogs',
        parameters: [
          param('clanId', id, 'Filter by clan ID.', 'query', false),
          param('actorUserId', id, 'Filter by actor user ID.', 'query', false),
          param('action', stringSchema(), 'Filter by action.', 'query', false),
          param('entityType', stringSchema(), 'Filter by entity type.', 'query', false),
          param('search', stringSchema(), 'Search action, entity type, or summary.', 'query', false),
          param('page', { type: 'integer', minimum: 1 }, 'Page number.', 'query', false),
          param('limit', { type: 'integer', minimum: 1, maximum: 100 }, 'Page size.', 'query', false),
        ],
        responses: {
          '200': ok(
            objectSchema({
              logs: arrayOf(ref('AuditLog')),
              total: { type: 'integer', minimum: 0 },
              page: { type: 'integer' },
              limit: { type: 'integer' },
            }),
          ),
          ...errorResponses,
        },
      },
      'Global ADMIN',
    ),
  },
}

export const openApiSpec: OpenApiSpec = {
  openapi: '3.1.0',
  info: {
    title: 'BP Tracker API',
    version: '0.2.0',
    description: 'HTTP API for the open-source Pirate Galaxy blueprint tracker. Authentication uses an HTTP-only session cookie.',
    license: { name: 'MIT' },
  },
  servers: [
    {
      url: env.apiBaseUrl,
      description: env.nodeEnv === 'production' ? 'Configured API base URL' : 'Local or configured API base URL',
    },
  ],
  tags: [
    { name: 'System', description: 'Health and API documentation.' },
    {
      name: 'Auth',
      description: 'Login, registration, sessions, passwords, and Discord OAuth.',
    },
    {
      name: 'Clans',
      description: 'Clan records, memberships, registrations, and Discord settings.',
    },
    {
      name: 'Blueprints',
      description: 'Blueprint catalog and user blueprint status.',
    },
    {
      name: 'Sirius',
      description: 'Sirius planets, drop rules, active rotations, slots, and history.',
    },
    { name: 'Checker', description: 'Blueprint checker presets and results.' },
    {
      name: 'Notifications',
      description: 'In-app notifications and notification preferences.',
    },
    { name: 'Users', description: 'Profile and admin user management.' },
    {
      name: 'Audit',
      description: 'Admin audit log for important changes and actions.',
    },
  ],
  paths,
  components: {
    securitySchemes: {
      cookieAuth: {
        type: 'apiKey',
        in: 'cookie',
        name: env.cookieName,
        description: 'HTTP-only session cookie set by login, setup, registration, or Discord OAuth.',
      },
    },
    schemas,
  },
}
