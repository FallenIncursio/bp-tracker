CREATE TABLE "BlueprintNotificationHit" (
    "id" TEXT NOT NULL,
    "type" "NotificationType" NOT NULL,
    "clanId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "blueprintId" TEXT NOT NULL,
    "appearanceId" TEXT NOT NULL,
    "notificationId" TEXT,
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BlueprintNotificationHit_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "BlueprintNotificationHit_type_clanId_userId_blueprintId_appearanceId_key" ON "BlueprintNotificationHit"("type", "clanId", "userId", "blueprintId", "appearanceId");
CREATE INDEX "BlueprintNotificationHit_clanId_type_createdAt_idx" ON "BlueprintNotificationHit"("clanId", "type", "createdAt");
CREATE INDEX "BlueprintNotificationHit_userId_type_idx" ON "BlueprintNotificationHit"("userId", "type");
CREATE INDEX "BlueprintNotificationHit_blueprintId_idx" ON "BlueprintNotificationHit"("blueprintId");
CREATE INDEX "BlueprintNotificationHit_appearanceId_idx" ON "BlueprintNotificationHit"("appearanceId");
CREATE INDEX "BlueprintNotificationHit_notificationId_idx" ON "BlueprintNotificationHit"("notificationId");

ALTER TABLE "BlueprintNotificationHit" ADD CONSTRAINT "BlueprintNotificationHit_clanId_fkey" FOREIGN KEY ("clanId") REFERENCES "Clan"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BlueprintNotificationHit" ADD CONSTRAINT "BlueprintNotificationHit_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BlueprintNotificationHit" ADD CONSTRAINT "BlueprintNotificationHit_blueprintId_fkey" FOREIGN KEY ("blueprintId") REFERENCES "Blueprint"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BlueprintNotificationHit" ADD CONSTRAINT "BlueprintNotificationHit_appearanceId_fkey" FOREIGN KEY ("appearanceId") REFERENCES "SiriusPlanetAppearance"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BlueprintNotificationHit" ADD CONSTRAINT "BlueprintNotificationHit_notificationId_fkey" FOREIGN KEY ("notificationId") REFERENCES "Notification"("id") ON DELETE SET NULL ON UPDATE CASCADE;
