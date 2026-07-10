CREATE TABLE "AccountInvite" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "clanId" TEXT,
  "tokenHash" TEXT NOT NULL,
  "type" TEXT NOT NULL DEFAULT 'ACCOUNT_CLAIM',
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "usedAt" TIMESTAMP(3),
  "revokedAt" TIMESTAMP(3),
  "createdById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "AccountInvite_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AccountInvite_tokenHash_key" ON "AccountInvite"("tokenHash");
CREATE INDEX "AccountInvite_userId_idx" ON "AccountInvite"("userId");
CREATE INDEX "AccountInvite_clanId_idx" ON "AccountInvite"("clanId");
CREATE INDEX "AccountInvite_expiresAt_idx" ON "AccountInvite"("expiresAt");
CREATE INDEX "AccountInvite_usedAt_revokedAt_idx" ON "AccountInvite"("usedAt", "revokedAt");

ALTER TABLE "AccountInvite"
  ADD CONSTRAINT "AccountInvite_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AccountInvite"
  ADD CONSTRAINT "AccountInvite_clanId_fkey" FOREIGN KEY ("clanId") REFERENCES "Clan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AccountInvite"
  ADD CONSTRAINT "AccountInvite_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
