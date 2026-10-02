-- CreateTable
CREATE TABLE "TeamInviteCode" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "role" "TenantRole" NOT NULL,
    "maxUses" INTEGER,
    "usedCount" INTEGER NOT NULL DEFAULT 0,
    "expiresAt" TIMESTAMP(3),
    "revoked" BOOLEAN NOT NULL DEFAULT false,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TeamInviteCode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TeamInviteRedemption" (
    "id" TEXT NOT NULL,
    "inviteId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TeamInviteRedemption_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TeamInviteCode_code_key" ON "TeamInviteCode"("code");

-- CreateIndex
CREATE INDEX "TeamInviteCode_tenantId_createdAt_idx" ON "TeamInviteCode"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "TeamInviteRedemption_inviteId_idx" ON "TeamInviteRedemption"("inviteId");

-- AddForeignKey
ALTER TABLE "TeamInviteCode" ADD CONSTRAINT "TeamInviteCode_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeamInviteRedemption" ADD CONSTRAINT "TeamInviteRedemption_inviteId_fkey" FOREIGN KEY ("inviteId") REFERENCES "TeamInviteCode"("id") ON DELETE CASCADE ON UPDATE CASCADE;
