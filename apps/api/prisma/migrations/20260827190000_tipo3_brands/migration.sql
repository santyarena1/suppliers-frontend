-- Tipo 3: una organización y un usuario por marca del catálogo,
-- acciones medibles, landing pública y avisos al comercio.

ALTER TABLE "User" ADD COLUMN "managedByPlatform" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "Tenant" ADD COLUMN "catalogTermId" TEXT;
ALTER TABLE "Tenant" ADD COLUMN "managedByPlatform" BOOLEAN NOT NULL DEFAULT false;

CREATE UNIQUE INDEX "Tenant_catalogTermId_key" ON "Tenant"("catalogTermId");

ALTER TABLE "Tenant"
  ADD CONSTRAINT "Tenant_catalogTermId_fkey"
  FOREIGN KEY ("catalogTermId") REFERENCES "PlatformCatalogTerm"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TYPE "BrandActionKind" AS ENUM ('PURCHASE_QTY', 'PURCHASE_AMOUNT', 'REBATE');
CREATE TYPE "BrandActionStatus" AS ENUM ('DRAFT', 'ACTIVE', 'ENDED', 'CANCELLED');
CREATE TYPE "BrandActionRewardKind" AS ENUM ('NONE', 'FLAT', 'PER_UNIT');
CREATE TYPE "BrandActionScopeKind" AS ENUM ('DISTRIBUTOR', 'RETAILER', 'PRODUCT');
CREATE TYPE "OrgNotificationKind" AS ENUM ('BRAND_ACTION', 'BRAND_LANDING', 'DISTRIBUTOR_NOTE', 'SYSTEM');

CREATE TABLE "BrandLanding" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "publicKey" TEXT NOT NULL,
  "published" BOOLEAN NOT NULL DEFAULT false,
  "headline" TEXT,
  "about" TEXT,
  "logoUrl" TEXT,
  "heroUrl" TEXT,
  "websiteUrl" TEXT,
  "supportEmail" TEXT,
  "supportPhone" TEXT,
  "blocks" JSONB NOT NULL DEFAULT '[]',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "BrandLanding_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "BrandLanding_tenantId_key" ON "BrandLanding"("tenantId");
CREATE UNIQUE INDEX "BrandLanding_publicKey_key" ON "BrandLanding"("publicKey");

ALTER TABLE "BrandLanding"
  ADD CONSTRAINT "BrandLanding_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "BrandAction" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "kind" "BrandActionKind" NOT NULL,
  "status" "BrandActionStatus" NOT NULL DEFAULT 'DRAFT',
  "title" TEXT NOT NULL,
  "description" TEXT,
  "startsAt" TIMESTAMP(3) NOT NULL,
  "endsAt" TIMESTAMP(3) NOT NULL,
  "targetQty" DECIMAL(14,4),
  "targetAmountUsd" DECIMAL(14,4),
  "rewardKind" "BrandActionRewardKind" NOT NULL DEFAULT 'NONE',
  "rewardUsd" DECIMAL(14,4),
  "notifyRetailers" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "BrandAction_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "BrandAction_tenantId_status_startsAt_idx" ON "BrandAction"("tenantId", "status", "startsAt");
CREATE INDEX "BrandAction_status_startsAt_endsAt_idx" ON "BrandAction"("status", "startsAt", "endsAt");

ALTER TABLE "BrandAction"
  ADD CONSTRAINT "BrandAction_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "BrandActionScope" (
  "id" TEXT NOT NULL,
  "actionId" TEXT NOT NULL,
  "kind" "BrandActionScopeKind" NOT NULL,
  "refId" TEXT NOT NULL,

  CONSTRAINT "BrandActionScope_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "BrandActionScope_actionId_kind_refId_key" ON "BrandActionScope"("actionId", "kind", "refId");
CREATE INDEX "BrandActionScope_kind_refId_idx" ON "BrandActionScope"("kind", "refId");

ALTER TABLE "BrandActionScope"
  ADD CONSTRAINT "BrandActionScope_actionId_fkey"
  FOREIGN KEY ("actionId") REFERENCES "BrandAction"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "OrgNotification" (
  "id" TEXT NOT NULL,
  "toTenantId" TEXT NOT NULL,
  "fromTenantId" TEXT,
  "kind" "OrgNotificationKind" NOT NULL,
  "title" TEXT NOT NULL,
  "body" TEXT NOT NULL,
  "actionId" TEXT,
  "landingKey" TEXT,
  "readAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "OrgNotification_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "OrgNotification_toTenantId_createdAt_idx" ON "OrgNotification"("toTenantId", "createdAt");
CREATE INDEX "OrgNotification_toTenantId_readAt_idx" ON "OrgNotification"("toTenantId", "readAt");

ALTER TABLE "OrgNotification"
  ADD CONSTRAINT "OrgNotification_toTenantId_fkey"
  FOREIGN KEY ("toTenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "OrgNotification"
  ADD CONSTRAINT "OrgNotification_fromTenantId_fkey"
  FOREIGN KEY ("fromTenantId") REFERENCES "Tenant"("id") ON DELETE SET NULL ON UPDATE CASCADE;
