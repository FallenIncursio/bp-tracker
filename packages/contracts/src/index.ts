import { z } from 'zod'

export const globalRoles = ['USER', 'ADMIN'] as const
export const clanRoles = ['MEMBER', 'COMMANDER', 'ADMIRAL'] as const
export const membershipStatuses = ['PENDING', 'ACTIVE', 'REJECTED', 'LEFT'] as const
export const blueprintStatuses = ['MISSING', 'OWNED', 'WANTED'] as const
export const blueprintSlotGroups = ['SLOT_18', 'SLOT_14', 'SLOT_12', 'SLOT_5', 'SLOT_2', 'RESOURCE', 'CUSTOM'] as const
export const siriusSlotPhases = ['CURRENT', 'NEXT'] as const
export const siriusEnemyTypes = ['SORIS', 'AMARNA', 'GIZA'] as const
export const siriusTechTiers = ['OOLYTE', 'DOLOMYTE', 'CLAY', 'KENYTE', 'ANCIENT'] as const
export const siriusSpawnWindowStatuses = ['PENDING', 'RESOLVED', 'CANCELLED'] as const
export const clanJourneyStopStatuses = ['PLANNED', 'CURRENT', 'COMPLETED', 'SKIPPED', 'CANCELLED'] as const
export const clanJourneyStopCertainties = ['CONFIRMED', 'TENTATIVE'] as const
export const blueprintRarities = ['STANDARD', 'RARE', 'ANCIENT', 'EVENT', 'CONQUEST', 'SPECIAL', 'COSMETIC'] as const

export type GlobalRole = (typeof globalRoles)[number]
export type ClanRole = (typeof clanRoles)[number]
export type MembershipStatus = (typeof membershipStatuses)[number]
export type BlueprintStatus = (typeof blueprintStatuses)[number]
export type BlueprintSlotGroup = (typeof blueprintSlotGroups)[number]
export type SiriusSlotPhase = (typeof siriusSlotPhases)[number]
export type SiriusEnemyType = (typeof siriusEnemyTypes)[number]
export type SiriusTechTier = (typeof siriusTechTiers)[number]
export type SiriusSpawnWindowStatus = (typeof siriusSpawnWindowStatuses)[number]
export type ClanJourneyStopStatus = (typeof clanJourneyStopStatuses)[number]
export type ClanJourneyStopCertainty = (typeof clanJourneyStopCertainties)[number]
export type BlueprintRarity = (typeof blueprintRarities)[number]

export const loginSchema = z.object({
  username: z.string().min(2).max(80),
  password: z.string().min(8).max(200),
})

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(8).max(200),
  newPassword: z.string().min(8).max(200),
})

export const setPasswordSchema = z.object({
  newPassword: z.string().min(8).max(200),
})

export const updateMyProfileSchema = z.object({
  displayName: z.string().min(2).max(120),
})

export const setupAdminSchema = loginSchema.extend({
  displayName: z.string().min(2).max(120),
  setupToken: z.string().max(200).optional(),
})

export const registerSchema = loginSchema.extend({
  displayName: z.string().min(2).max(120),
  email: z.string().email().max(240).optional().or(z.literal('')),
  clanId: z.string().uuid(),
})

export const createClanSchema = z.object({
  name: z.string().min(2).max(120),
  slug: z
    .string()
    .min(2)
    .max(80)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  isPublic: z.boolean().default(true),
})

export const updateMembershipRoleSchema = z.object({
  role: z.enum(clanRoles),
})

export const updateMembershipTrackingSchema = z.object({
  trackingExcluded: z.boolean(),
  reason: z.string().trim().max(500).optional().or(z.literal('')),
})

export const approveMembershipSchema = z.object({
  role: z.enum(clanRoles).default('MEMBER'),
})

export const updateClanDiscordSettingsSchema = z.object({
  enabled: z.boolean(),
  statusEnabled: z.boolean().default(false),
  statusPinMessages: z.boolean().default(true),
  guildId: z
    .string()
    .trim()
    .regex(/^\d{17,20}$/)
    .optional()
    .or(z.literal('')),
  notificationChannelId: z
    .string()
    .trim()
    .regex(/^\d{17,20}$/)
    .optional()
    .or(z.literal('')),
  notificationChannelName: z.string().trim().max(120).optional().or(z.literal('')),
  statusChannelId: z
    .string()
    .trim()
    .regex(/^\d{17,20}$/)
    .optional()
    .or(z.literal('')),
  statusChannelName: z.string().trim().max(120).optional().or(z.literal('')),
})

export const publishClanDiscordStatusSchema = z.object({
  recreateMessages: z.boolean().default(false),
})

export const updateBlueprintStatusSchema = z.object({
  status: z.enum(blueprintStatuses),
})

export const bulkUpdateBlueprintStatusSchema = z.object({
  blueprintIds: z.array(z.string().uuid()).min(1).max(500),
  status: z.enum(blueprintStatuses),
})

const siriusAppearanceBaseSchema = z.object({
  planetId: z.string().uuid().optional(),
  planetName: z.string().trim().min(2).max(120).optional(),
  ring: z.number().int().min(1).max(5).default(5),
  observedAt: z.string().datetime().optional(),
  expiresAt: z.string().datetime(),
  resolvesSpawnWindowId: z.string().uuid().optional(),
  notes: z.string().max(1000).optional(),
})

export const createSiriusAppearanceSchema = siriusAppearanceBaseSchema.refine(input => Boolean(input.planetId || input.planetName), {
  message: 'planetId or planetName is required.',
  path: ['planetName'],
})

export const updateSiriusAppearanceSchema = siriusAppearanceBaseSchema.partial()

export const upsertSiriusSlotSchema = z.object({
  slotGroup: z.enum(blueprintSlotGroups),
  enemyType: z.enum(siriusEnemyTypes).nullable().optional(),
  blueprintId: z.string().uuid(),
})

export const replaceSiriusSlotsSchema = z.object({
  slots: z.array(upsertSiriusSlotSchema).max(40),
})

const nullableDateTime = z.string().datetime().nullable().optional()

const journeyStopTargetFields = {
  appearanceId: z.string().uuid().nullable().optional(),
  planetId: z.string().uuid().nullable().optional(),
  planetName: z.string().trim().min(2).max(120).nullable().optional(),
}

const journeyStopBaseSchema = z.object({
  ...journeyStopTargetFields,
  ring: z.number().int().min(1).max(5).default(5),
  arriveAt: nullableDateTime,
  departAt: nullableDateTime,
  status: z.enum(clanJourneyStopStatuses).default('PLANNED'),
  certainty: z.enum(clanJourneyStopCertainties).default('CONFIRMED'),
  notes: z.string().max(1000).nullable().optional(),
  sortOrder: z.number().int().min(0).optional(),
})

export const createClanJourneyStopSchema = journeyStopBaseSchema

export const updateClanJourneyStopSchema = z.object({
  ...journeyStopTargetFields,
  ring: z.number().int().min(1).max(5).optional(),
  arriveAt: nullableDateTime,
  departAt: nullableDateTime,
  status: z.enum(clanJourneyStopStatuses).optional(),
  certainty: z.enum(clanJourneyStopCertainties).optional(),
  notes: z.string().max(1000).nullable().optional(),
  sortOrder: z.number().int().min(0).optional(),
})

export const reorderClanJourneyStopsSchema = z.object({
  stopIds: z.array(z.string().uuid()).min(1).max(100),
})

export const checkerRequestSchema = z.object({
  clanId: z.string().uuid(),
  blueprintIds: z.array(z.string().uuid()).min(1).max(1000),
  userIds: z.array(z.string().uuid()).max(100).optional(),
  includeExcluded: z.boolean().default(false),
})

export type AuthUserDto = {
  id: string
  username: string
  displayName: string
  globalRole: GlobalRole
  hasPassword: boolean
  discord: {
    linked: boolean
    username: string | null
    globalName: string | null
    avatarHash: string | null
  }
  memberships: Array<{
    clanId: string
    clanName: string
    clanSlug: string
    role: ClanRole
    status: MembershipStatus
    trackingExcluded: boolean
  }>
}

export type ClanDto = {
  id: string
  name: string
  slug: string
  isPublic: boolean
  memberCount: number
}

export type ClanDiscordSettingsDto = {
  clanId: string
  guildId: string | null
  notificationChannelId: string | null
  notificationChannelName: string | null
  enabled: boolean
  statusEnabled: boolean
  statusChannelId: string | null
  statusChannelName: string | null
  statusRoadmapMessageId: string | null
  statusPlanetsMessageId: string | null
  statusPinMessages: boolean
  statusLastPublishedAt: string | null
  statusLastError: string | null
}

export type DiscordGuildChannelDto = {
  id: string
  name: string
  displayName: string
  type: number
  guildId: string
  parentId: string | null
}

export type TranslationDto = {
  locale: string
  name: string
  source: string | null
  verified: boolean
}

export type BlueprintDto = {
  id: string
  canonicalName: string
  nameDe: string
  nameEn: string | null
  translations: TranslationDto[]
  systemName: string | null
  itemTypeName: string | null
  itemTypeNameDe: string | null
  itemTypeNameEn: string | null
  itemTypeTranslations: TranslationDto[]
  slotGroup: BlueprintSlotGroup | null
  siriusRing: number | null
  siriusTechTier: SiriusTechTier | null
  rarity: BlueprintRarity
  partsRequired: number | null
  level: number | null
}

export type ApiErrorBody = {
  error: string
  details?: unknown
}
