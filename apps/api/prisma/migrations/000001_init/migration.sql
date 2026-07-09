-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "GlobalRole" AS ENUM ('USER', 'ADMIN');

-- CreateEnum
CREATE TYPE "ClanRole" AS ENUM ('MEMBER', 'COMMANDER', 'ADMIRAL');

-- CreateEnum
CREATE TYPE "MembershipStatus" AS ENUM ('PENDING', 'ACTIVE', 'REJECTED', 'LEFT');

-- CreateEnum
CREATE TYPE "BlueprintStatus" AS ENUM ('UNKNOWN', 'MISSING', 'OWNED', 'WANTED');

-- CreateEnum
CREATE TYPE "BlueprintSlotGroup" AS ENUM ('SLOT_18', 'SLOT_14', 'SLOT_12', 'SLOT_5', 'SLOT_2', 'RESOURCE', 'CUSTOM');

-- CreateEnum
CREATE TYPE "BlueprintRarity" AS ENUM ('STANDARD', 'RARE', 'ANCIENT', 'EVENT', 'CONQUEST', 'SPECIAL', 'COSMETIC');

-- CreateEnum
CREATE TYPE "SiriusSlotPhase" AS ENUM ('CURRENT', 'NEXT');

-- CreateEnum
CREATE TYPE "SiriusEnemyType" AS ENUM ('SORIS', 'AMARNA', 'GIZA');

-- CreateEnum
CREATE TYPE "SiriusTechTier" AS ENUM ('OOLYTE', 'DOLOMYTE', 'CLAY', 'KENYTE', 'ANCIENT');

-- CreateEnum
CREATE TYPE "SiriusAppearanceStatus" AS ENUM ('ACTIVE', 'UPCOMING', 'EXPIRED');

-- CreateEnum
CREATE TYPE "SiriusSpawnWindowStatus" AS ENUM ('PENDING', 'RESOLVED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ClanJourneyStopStatus" AS ENUM ('PLANNED', 'CURRENT', 'COMPLETED', 'SKIPPED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ClanJourneyStopCertainty" AS ENUM ('CONFIRMED', 'TENTATIVE');

-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('BLUEPRINT_WANTED_ACTIVE', 'BLUEPRINT_MISSING_ACTIVE', 'PLANET_EXPIRING', 'MEMBERSHIP_APPROVED', 'SYSTEM');

-- CreateEnum
CREATE TYPE "ImportSourceType" AS ENUM ('SEED', 'EXTERNAL_SNAPSHOT', 'MANUAL_JSON');

-- CreateEnum
CREATE TYPE "ImportRunStatus" AS ENUM ('PENDING', 'APPLIED', 'FAILED');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "email" TEXT,
    "passwordHash" TEXT,
    "globalRole" "GlobalRole" NOT NULL DEFAULT 'USER',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "discordUserId" TEXT,
    "discordUsername" TEXT,
    "discordGlobalName" TEXT,
    "discordAvatarHash" TEXT,
    "discordLinkedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Clan" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "isPublic" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Clan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClanDiscordSettings" (
    "id" TEXT NOT NULL,
    "clanId" TEXT NOT NULL,
    "guildId" TEXT,
    "notificationChannelId" TEXT,
    "notificationChannelName" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "statusEnabled" BOOLEAN NOT NULL DEFAULT false,
    "statusChannelId" TEXT,
    "statusChannelName" TEXT,
    "statusRoadmapMessageId" TEXT,
    "statusPlanetsMessageId" TEXT,
    "statusPinMessages" BOOLEAN NOT NULL DEFAULT true,
    "statusLastPublishedAt" TIMESTAMP(3),
    "statusLastError" TEXT,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClanDiscordSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClanMembership" (
    "id" TEXT NOT NULL,
    "clanId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "ClanRole" NOT NULL DEFAULT 'MEMBER',
    "status" "MembershipStatus" NOT NULL DEFAULT 'PENDING',
    "trackingExcluded" BOOLEAN NOT NULL DEFAULT false,
    "trackingExcludedAt" TIMESTAMP(3),
    "trackingExcludedById" TEXT,
    "trackingExcludedReason" TEXT,
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClanMembership_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GameSystem" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "GameSystem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BlueprintItemType" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "nameDe" TEXT NOT NULL,
    "nameEn" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "BlueprintItemType_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Blueprint" (
    "id" TEXT NOT NULL,
    "canonicalName" TEXT NOT NULL,
    "nameDe" TEXT NOT NULL,
    "nameEn" TEXT,
    "systemId" TEXT,
    "itemTypeId" TEXT,
    "variant" TEXT,
    "siriusRing" INTEGER,
    "siriusTechTier" "SiriusTechTier",
    "slotGroup" "BlueprintSlotGroup",
    "partsRequired" INTEGER,
    "level" INTEGER,
    "price" INTEGER,
    "rarity" "BlueprintRarity" NOT NULL DEFAULT 'STANDARD',
    "sourceNotes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Blueprint_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BlueprintTranslation" (
    "id" TEXT NOT NULL,
    "blueprintId" TEXT NOT NULL,
    "locale" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "source" TEXT,
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BlueprintTranslation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BlueprintItemTypeTranslation" (
    "id" TEXT NOT NULL,
    "itemTypeId" TEXT NOT NULL,
    "locale" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "source" TEXT,
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BlueprintItemTypeTranslation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BlueprintAlias" (
    "id" TEXT NOT NULL,
    "blueprintId" TEXT NOT NULL,
    "alias" TEXT NOT NULL,
    "language" TEXT,
    "source" TEXT,

    CONSTRAINT "BlueprintAlias_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserBlueprintStatus" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "blueprintId" TEXT NOT NULL,
    "status" "BlueprintStatus" NOT NULL DEFAULT 'UNKNOWN',
    "source" TEXT NOT NULL DEFAULT 'MANUAL',
    "updatedById" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserBlueprintStatus_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SiriusPlanet" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "ring" INTEGER,
    "isKnown" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "SiriusPlanet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SiriusPlanetAppearance" (
    "id" TEXT NOT NULL,
    "clanId" TEXT NOT NULL,
    "planetId" TEXT NOT NULL,
    "ring" INTEGER NOT NULL DEFAULT 5,
    "techTier" "SiriusTechTier",
    "observedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "nextSpawnAt" TIMESTAMP(3),
    "status" "SiriusAppearanceStatus" NOT NULL DEFAULT 'ACTIVE',
    "notes" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SiriusPlanetAppearance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SiriusSpawnWindow" (
    "id" TEXT NOT NULL,
    "clanId" TEXT NOT NULL,
    "sourceAppearanceId" TEXT NOT NULL,
    "resolvedAppearanceId" TEXT,
    "expectedAt" TIMESTAMP(3) NOT NULL,
    "status" "SiriusSpawnWindowStatus" NOT NULL DEFAULT 'PENDING',
    "notes" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SiriusSpawnWindow_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClanJourneyStop" (
    "id" TEXT NOT NULL,
    "clanId" TEXT NOT NULL,
    "appearanceId" TEXT,
    "planetId" TEXT,
    "planetName" TEXT,
    "ring" INTEGER NOT NULL DEFAULT 5,
    "arriveAt" TIMESTAMP(3),
    "departAt" TIMESTAMP(3),
    "status" "ClanJourneyStopStatus" NOT NULL DEFAULT 'PLANNED',
    "certainty" "ClanJourneyStopCertainty" NOT NULL DEFAULT 'CONFIRMED',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "notes" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClanJourneyStop_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SiriusPlanetBlueprintSlot" (
    "id" TEXT NOT NULL,
    "appearanceId" TEXT NOT NULL,
    "phase" "SiriusSlotPhase" NOT NULL,
    "slotGroup" "BlueprintSlotGroup" NOT NULL,
    "enemyType" "SiriusEnemyType",
    "locationName" TEXT,
    "blueprintId" TEXT,
    "rawBlueprintName" TEXT,
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SiriusPlanetBlueprintSlot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SiriusBlueprintDropRule" (
    "id" TEXT NOT NULL,
    "ruleKey" TEXT NOT NULL,
    "blueprintId" TEXT NOT NULL,
    "ring" INTEGER NOT NULL,
    "techTier" "SiriusTechTier",
    "slotGroup" "BlueprintSlotGroup" NOT NULL,
    "enemyType" "SiriusEnemyType",
    "source" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SiriusBlueprintDropRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SiriusDropEvent" (
    "id" TEXT NOT NULL,
    "eventKey" TEXT NOT NULL,
    "clanId" TEXT NOT NULL,
    "planetId" TEXT,
    "appearanceId" TEXT,
    "blueprintId" TEXT,
    "ring" INTEGER NOT NULL,
    "techTier" "SiriusTechTier",
    "dropAt" TIMESTAMP(3) NOT NULL,
    "observedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "nextSpawnAt" TIMESTAMP(3),
    "slotGroup" "BlueprintSlotGroup" NOT NULL,
    "enemyType" "SiriusEnemyType",
    "partsRequired" INTEGER,
    "rawPlanetName" TEXT,
    "rawBlueprintName" TEXT,
    "sourceType" "ImportSourceType" NOT NULL,
    "sourceRef" TEXT,
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "firstSeenAt" TIMESTAMP(3),
    "lastSeenAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SiriusDropEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SiriusDropEvidence" (
    "id" TEXT NOT NULL,
    "evidenceKey" TEXT NOT NULL,
    "dropEventId" TEXT NOT NULL,
    "importRunId" TEXT,
    "sourceType" "ImportSourceType" NOT NULL,
    "sourceRef" TEXT,
    "revisionId" TEXT,
    "revisionModifiedAt" TIMESTAMP(3),
    "snapshotFile" TEXT,
    "sourceSection" TEXT,
    "rowIndex" INTEGER,
    "columnIndex" INTEGER,
    "seenAt" TIMESTAMP(3),
    "rawJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SiriusDropEvidence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Ship" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "systemId" TEXT,
    "className" TEXT,
    "source" TEXT,

    CONSTRAINT "Ship_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShipRequiredBlueprint" (
    "id" TEXT NOT NULL,
    "shipId" TEXT NOT NULL,
    "blueprintId" TEXT NOT NULL,
    "requiredParts" INTEGER,
    "notes" TEXT,

    CONSTRAINT "ShipRequiredBlueprint_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "NotificationType" NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "payloadJson" JSONB,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotificationDelivery" (
    "id" TEXT NOT NULL,
    "notificationId" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "target" TEXT,
    "error" TEXT,
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NotificationDelivery_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotificationPreference" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "inAppEnabled" BOOLEAN NOT NULL DEFAULT true,
    "discordEnabled" BOOLEAN NOT NULL DEFAULT false,
    "missingBpAlerts" BOOLEAN NOT NULL DEFAULT true,
    "wantedBpAlerts" BOOLEAN NOT NULL DEFAULT true,
    "planetExpiryAlerts" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "NotificationPreference_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ImportRun" (
    "id" TEXT NOT NULL,
    "sourceType" "ImportSourceType" NOT NULL,
    "sourceUrl" TEXT,
    "status" "ImportRunStatus" NOT NULL DEFAULT 'PENDING',
    "summaryJson" JSONB,
    "startedById" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "ImportRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "actorUserId" TEXT,
    "clanId" TEXT,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT,
    "summary" VARCHAR(512),
    "beforeJson" JSONB,
    "afterJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "User_discordUserId_key" ON "User"("discordUserId");

-- CreateIndex
CREATE INDEX "User_globalRole_idx" ON "User"("globalRole");

-- CreateIndex
CREATE UNIQUE INDEX "Session_tokenHash_key" ON "Session"("tokenHash");

-- CreateIndex
CREATE INDEX "Session_userId_idx" ON "Session"("userId");

-- CreateIndex
CREATE INDEX "Session_expiresAt_idx" ON "Session"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "Clan_slug_key" ON "Clan"("slug");

-- CreateIndex
CREATE INDEX "Clan_isPublic_idx" ON "Clan"("isPublic");

-- CreateIndex
CREATE UNIQUE INDEX "ClanDiscordSettings_clanId_key" ON "ClanDiscordSettings"("clanId");

-- CreateIndex
CREATE INDEX "ClanMembership_clanId_status_idx" ON "ClanMembership"("clanId", "status");

-- CreateIndex
CREATE INDEX "ClanMembership_clanId_trackingExcluded_idx" ON "ClanMembership"("clanId", "trackingExcluded");

-- CreateIndex
CREATE INDEX "ClanMembership_userId_status_idx" ON "ClanMembership"("userId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "ClanMembership_clanId_userId_key" ON "ClanMembership"("clanId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "GameSystem_code_key" ON "GameSystem"("code");

-- CreateIndex
CREATE UNIQUE INDEX "BlueprintItemType_code_key" ON "BlueprintItemType"("code");

-- CreateIndex
CREATE UNIQUE INDEX "Blueprint_canonicalName_key" ON "Blueprint"("canonicalName");

-- CreateIndex
CREATE INDEX "Blueprint_systemId_idx" ON "Blueprint"("systemId");

-- CreateIndex
CREATE INDEX "Blueprint_itemTypeId_idx" ON "Blueprint"("itemTypeId");

-- CreateIndex
CREATE INDEX "Blueprint_slotGroup_idx" ON "Blueprint"("slotGroup");

-- CreateIndex
CREATE INDEX "Blueprint_siriusRing_idx" ON "Blueprint"("siriusRing");

-- CreateIndex
CREATE INDEX "Blueprint_siriusTechTier_idx" ON "Blueprint"("siriusTechTier");

-- CreateIndex
CREATE INDEX "Blueprint_rarity_idx" ON "Blueprint"("rarity");

-- CreateIndex
CREATE INDEX "BlueprintTranslation_locale_idx" ON "BlueprintTranslation"("locale");

-- CreateIndex
CREATE INDEX "BlueprintTranslation_name_idx" ON "BlueprintTranslation"("name");

-- CreateIndex
CREATE UNIQUE INDEX "BlueprintTranslation_blueprintId_locale_key" ON "BlueprintTranslation"("blueprintId", "locale");

-- CreateIndex
CREATE INDEX "BlueprintItemTypeTranslation_locale_idx" ON "BlueprintItemTypeTranslation"("locale");

-- CreateIndex
CREATE INDEX "BlueprintItemTypeTranslation_name_idx" ON "BlueprintItemTypeTranslation"("name");

-- CreateIndex
CREATE UNIQUE INDEX "BlueprintItemTypeTranslation_itemTypeId_locale_key" ON "BlueprintItemTypeTranslation"("itemTypeId", "locale");

-- CreateIndex
CREATE INDEX "BlueprintAlias_alias_idx" ON "BlueprintAlias"("alias");

-- CreateIndex
CREATE UNIQUE INDEX "BlueprintAlias_blueprintId_alias_key" ON "BlueprintAlias"("blueprintId", "alias");

-- CreateIndex
CREATE INDEX "UserBlueprintStatus_blueprintId_status_idx" ON "UserBlueprintStatus"("blueprintId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "UserBlueprintStatus_userId_blueprintId_key" ON "UserBlueprintStatus"("userId", "blueprintId");

-- CreateIndex
CREATE UNIQUE INDEX "SiriusPlanet_name_key" ON "SiriusPlanet"("name");

-- CreateIndex
CREATE INDEX "SiriusPlanetAppearance_clanId_status_idx" ON "SiriusPlanetAppearance"("clanId", "status");

-- CreateIndex
CREATE INDEX "SiriusPlanetAppearance_ring_idx" ON "SiriusPlanetAppearance"("ring");

-- CreateIndex
CREATE INDEX "SiriusPlanetAppearance_planetId_idx" ON "SiriusPlanetAppearance"("planetId");

-- CreateIndex
CREATE INDEX "SiriusPlanetAppearance_expiresAt_idx" ON "SiriusPlanetAppearance"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "SiriusSpawnWindow_sourceAppearanceId_key" ON "SiriusSpawnWindow"("sourceAppearanceId");

-- CreateIndex
CREATE UNIQUE INDEX "SiriusSpawnWindow_resolvedAppearanceId_key" ON "SiriusSpawnWindow"("resolvedAppearanceId");

-- CreateIndex
CREATE INDEX "SiriusSpawnWindow_clanId_status_expectedAt_idx" ON "SiriusSpawnWindow"("clanId", "status", "expectedAt");

-- CreateIndex
CREATE INDEX "SiriusSpawnWindow_sourceAppearanceId_idx" ON "SiriusSpawnWindow"("sourceAppearanceId");

-- CreateIndex
CREATE INDEX "SiriusSpawnWindow_resolvedAppearanceId_idx" ON "SiriusSpawnWindow"("resolvedAppearanceId");

-- CreateIndex
CREATE INDEX "SiriusSpawnWindow_expectedAt_idx" ON "SiriusSpawnWindow"("expectedAt");

-- CreateIndex
CREATE INDEX "ClanJourneyStop_clanId_status_sortOrder_idx" ON "ClanJourneyStop"("clanId", "status", "sortOrder");

-- CreateIndex
CREATE INDEX "ClanJourneyStop_clanId_arriveAt_idx" ON "ClanJourneyStop"("clanId", "arriveAt");

-- CreateIndex
CREATE INDEX "ClanJourneyStop_appearanceId_idx" ON "ClanJourneyStop"("appearanceId");

-- CreateIndex
CREATE INDEX "ClanJourneyStop_planetId_idx" ON "ClanJourneyStop"("planetId");

-- CreateIndex
CREATE INDEX "SiriusPlanetBlueprintSlot_appearanceId_phase_idx" ON "SiriusPlanetBlueprintSlot"("appearanceId", "phase");

-- CreateIndex
CREATE INDEX "SiriusPlanetBlueprintSlot_appearanceId_slotGroup_idx" ON "SiriusPlanetBlueprintSlot"("appearanceId", "slotGroup");

-- CreateIndex
CREATE INDEX "SiriusPlanetBlueprintSlot_enemyType_idx" ON "SiriusPlanetBlueprintSlot"("enemyType");

-- CreateIndex
CREATE INDEX "SiriusPlanetBlueprintSlot_blueprintId_idx" ON "SiriusPlanetBlueprintSlot"("blueprintId");

-- CreateIndex
CREATE UNIQUE INDEX "SiriusBlueprintDropRule_ruleKey_key" ON "SiriusBlueprintDropRule"("ruleKey");

-- CreateIndex
CREATE INDEX "SiriusBlueprintDropRule_ring_slotGroup_idx" ON "SiriusBlueprintDropRule"("ring", "slotGroup");

-- CreateIndex
CREATE INDEX "SiriusBlueprintDropRule_techTier_idx" ON "SiriusBlueprintDropRule"("techTier");

-- CreateIndex
CREATE INDEX "SiriusBlueprintDropRule_enemyType_idx" ON "SiriusBlueprintDropRule"("enemyType");

-- CreateIndex
CREATE INDEX "SiriusBlueprintDropRule_blueprintId_idx" ON "SiriusBlueprintDropRule"("blueprintId");

-- CreateIndex
CREATE UNIQUE INDEX "SiriusDropEvent_eventKey_key" ON "SiriusDropEvent"("eventKey");

-- CreateIndex
CREATE INDEX "SiriusDropEvent_clanId_dropAt_idx" ON "SiriusDropEvent"("clanId", "dropAt");

-- CreateIndex
CREATE INDEX "SiriusDropEvent_clanId_blueprintId_idx" ON "SiriusDropEvent"("clanId", "blueprintId");

-- CreateIndex
CREATE INDEX "SiriusDropEvent_planetId_idx" ON "SiriusDropEvent"("planetId");

-- CreateIndex
CREATE INDEX "SiriusDropEvent_appearanceId_idx" ON "SiriusDropEvent"("appearanceId");

-- CreateIndex
CREATE INDEX "SiriusDropEvent_blueprintId_idx" ON "SiriusDropEvent"("blueprintId");

-- CreateIndex
CREATE INDEX "SiriusDropEvent_ring_slotGroup_idx" ON "SiriusDropEvent"("ring", "slotGroup");

-- CreateIndex
CREATE INDEX "SiriusDropEvent_enemyType_idx" ON "SiriusDropEvent"("enemyType");

-- CreateIndex
CREATE INDEX "SiriusDropEvent_sourceType_idx" ON "SiriusDropEvent"("sourceType");

-- CreateIndex
CREATE UNIQUE INDEX "SiriusDropEvidence_evidenceKey_key" ON "SiriusDropEvidence"("evidenceKey");

-- CreateIndex
CREATE INDEX "SiriusDropEvidence_dropEventId_idx" ON "SiriusDropEvidence"("dropEventId");

-- CreateIndex
CREATE INDEX "SiriusDropEvidence_importRunId_idx" ON "SiriusDropEvidence"("importRunId");

-- CreateIndex
CREATE INDEX "SiriusDropEvidence_sourceType_idx" ON "SiriusDropEvidence"("sourceType");

-- CreateIndex
CREATE INDEX "SiriusDropEvidence_revisionId_idx" ON "SiriusDropEvidence"("revisionId");

-- CreateIndex
CREATE INDEX "SiriusDropEvidence_seenAt_idx" ON "SiriusDropEvidence"("seenAt");

-- CreateIndex
CREATE UNIQUE INDEX "Ship_name_key" ON "Ship"("name");

-- CreateIndex
CREATE UNIQUE INDEX "ShipRequiredBlueprint_shipId_blueprintId_key" ON "ShipRequiredBlueprint"("shipId", "blueprintId");

-- CreateIndex
CREATE INDEX "Notification_userId_readAt_idx" ON "Notification"("userId", "readAt");

-- CreateIndex
CREATE INDEX "NotificationDelivery_notificationId_idx" ON "NotificationDelivery"("notificationId");

-- CreateIndex
CREATE INDEX "NotificationDelivery_channel_status_idx" ON "NotificationDelivery"("channel", "status");

-- CreateIndex
CREATE UNIQUE INDEX "NotificationPreference_userId_key" ON "NotificationPreference"("userId");

-- CreateIndex
CREATE INDEX "AuditLog_actorUserId_idx" ON "AuditLog"("actorUserId");

-- CreateIndex
CREATE INDEX "AuditLog_clanId_createdAt_idx" ON "AuditLog"("clanId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_action_idx" ON "AuditLog"("action");

-- CreateIndex
CREATE INDEX "AuditLog_entityType_entityId_idx" ON "AuditLog"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClanDiscordSettings" ADD CONSTRAINT "ClanDiscordSettings_clanId_fkey" FOREIGN KEY ("clanId") REFERENCES "Clan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClanMembership" ADD CONSTRAINT "ClanMembership_clanId_fkey" FOREIGN KEY ("clanId") REFERENCES "Clan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClanMembership" ADD CONSTRAINT "ClanMembership_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Blueprint" ADD CONSTRAINT "Blueprint_systemId_fkey" FOREIGN KEY ("systemId") REFERENCES "GameSystem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Blueprint" ADD CONSTRAINT "Blueprint_itemTypeId_fkey" FOREIGN KEY ("itemTypeId") REFERENCES "BlueprintItemType"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BlueprintTranslation" ADD CONSTRAINT "BlueprintTranslation_blueprintId_fkey" FOREIGN KEY ("blueprintId") REFERENCES "Blueprint"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BlueprintItemTypeTranslation" ADD CONSTRAINT "BlueprintItemTypeTranslation_itemTypeId_fkey" FOREIGN KEY ("itemTypeId") REFERENCES "BlueprintItemType"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BlueprintAlias" ADD CONSTRAINT "BlueprintAlias_blueprintId_fkey" FOREIGN KEY ("blueprintId") REFERENCES "Blueprint"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserBlueprintStatus" ADD CONSTRAINT "UserBlueprintStatus_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserBlueprintStatus" ADD CONSTRAINT "UserBlueprintStatus_blueprintId_fkey" FOREIGN KEY ("blueprintId") REFERENCES "Blueprint"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SiriusPlanetAppearance" ADD CONSTRAINT "SiriusPlanetAppearance_clanId_fkey" FOREIGN KEY ("clanId") REFERENCES "Clan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SiriusPlanetAppearance" ADD CONSTRAINT "SiriusPlanetAppearance_planetId_fkey" FOREIGN KEY ("planetId") REFERENCES "SiriusPlanet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SiriusSpawnWindow" ADD CONSTRAINT "SiriusSpawnWindow_clanId_fkey" FOREIGN KEY ("clanId") REFERENCES "Clan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SiriusSpawnWindow" ADD CONSTRAINT "SiriusSpawnWindow_sourceAppearanceId_fkey" FOREIGN KEY ("sourceAppearanceId") REFERENCES "SiriusPlanetAppearance"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SiriusSpawnWindow" ADD CONSTRAINT "SiriusSpawnWindow_resolvedAppearanceId_fkey" FOREIGN KEY ("resolvedAppearanceId") REFERENCES "SiriusPlanetAppearance"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClanJourneyStop" ADD CONSTRAINT "ClanJourneyStop_clanId_fkey" FOREIGN KEY ("clanId") REFERENCES "Clan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClanJourneyStop" ADD CONSTRAINT "ClanJourneyStop_appearanceId_fkey" FOREIGN KEY ("appearanceId") REFERENCES "SiriusPlanetAppearance"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClanJourneyStop" ADD CONSTRAINT "ClanJourneyStop_planetId_fkey" FOREIGN KEY ("planetId") REFERENCES "SiriusPlanet"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SiriusPlanetBlueprintSlot" ADD CONSTRAINT "SiriusPlanetBlueprintSlot_appearanceId_fkey" FOREIGN KEY ("appearanceId") REFERENCES "SiriusPlanetAppearance"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SiriusPlanetBlueprintSlot" ADD CONSTRAINT "SiriusPlanetBlueprintSlot_blueprintId_fkey" FOREIGN KEY ("blueprintId") REFERENCES "Blueprint"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SiriusBlueprintDropRule" ADD CONSTRAINT "SiriusBlueprintDropRule_blueprintId_fkey" FOREIGN KEY ("blueprintId") REFERENCES "Blueprint"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SiriusDropEvent" ADD CONSTRAINT "SiriusDropEvent_clanId_fkey" FOREIGN KEY ("clanId") REFERENCES "Clan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SiriusDropEvent" ADD CONSTRAINT "SiriusDropEvent_planetId_fkey" FOREIGN KEY ("planetId") REFERENCES "SiriusPlanet"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SiriusDropEvent" ADD CONSTRAINT "SiriusDropEvent_appearanceId_fkey" FOREIGN KEY ("appearanceId") REFERENCES "SiriusPlanetAppearance"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SiriusDropEvent" ADD CONSTRAINT "SiriusDropEvent_blueprintId_fkey" FOREIGN KEY ("blueprintId") REFERENCES "Blueprint"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SiriusDropEvidence" ADD CONSTRAINT "SiriusDropEvidence_dropEventId_fkey" FOREIGN KEY ("dropEventId") REFERENCES "SiriusDropEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SiriusDropEvidence" ADD CONSTRAINT "SiriusDropEvidence_importRunId_fkey" FOREIGN KEY ("importRunId") REFERENCES "ImportRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Ship" ADD CONSTRAINT "Ship_systemId_fkey" FOREIGN KEY ("systemId") REFERENCES "GameSystem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShipRequiredBlueprint" ADD CONSTRAINT "ShipRequiredBlueprint_shipId_fkey" FOREIGN KEY ("shipId") REFERENCES "Ship"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShipRequiredBlueprint" ADD CONSTRAINT "ShipRequiredBlueprint_blueprintId_fkey" FOREIGN KEY ("blueprintId") REFERENCES "Blueprint"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationDelivery" ADD CONSTRAINT "NotificationDelivery_notificationId_fkey" FOREIGN KEY ("notificationId") REFERENCES "Notification"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationPreference" ADD CONSTRAINT "NotificationPreference_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
