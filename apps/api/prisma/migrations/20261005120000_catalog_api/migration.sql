-- API de catálogo: keys, uso, webhooks y rastreo de cambios (docs/PLAN_API_CATALOGO.md).
-- CreateEnum
CREATE TYPE "ApiClientStatus" AS ENUM ('ACTIVE', 'REVOKED');

-- AlterTable
ALTER TABLE "Subscription" ADD COLUMN     "catalogApiAddon" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "catalogApiAddonSince" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "ApiClient" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "publicKey" TEXT NOT NULL,
    "secretHash" TEXT NOT NULL,
    "secretLast4" TEXT NOT NULL,
    "previousSecretHash" TEXT,
    "previousSecretExpiresAt" TIMESTAMP(3),
    "feedToken" TEXT NOT NULL,
    "status" "ApiClientStatus" NOT NULL DEFAULT 'ACTIVE',
    "config" JSONB NOT NULL,
    "scopes" TEXT[],
    "ipAllowlist" TEXT[],
    "rateLimitPerMinute" INTEGER NOT NULL DEFAULT 120,
    "lastUsedAt" TIMESTAMP(3),
    "lastUsedIp" TEXT,
    "expiresAt" TIMESTAMP(3),
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "ApiClient_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApiUsageDaily" (
    "apiClientId" TEXT NOT NULL,
    "day" DATE NOT NULL,
    "requests" INTEGER NOT NULL DEFAULT 0,
    "errors" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ApiUsageDaily_pkey" PRIMARY KEY ("apiClientId","day")
);

-- CreateTable
CREATE TABLE "ApiWebhookEndpoint" (
    "id" TEXT NOT NULL,
    "apiClientId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "secretEncrypted" TEXT NOT NULL,
    "events" TEXT[],
    "active" BOOLEAN NOT NULL DEFAULT true,
    "cursor" BIGINT,
    "consecutiveFailures" INTEGER NOT NULL DEFAULT 0,
    "disabledAt" TIMESTAMP(3),
    "disabledReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ApiWebhookEndpoint_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApiWebhookDelivery" (
    "id" TEXT NOT NULL,
    "endpointId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "nextAttemptAt" TIMESTAMP(3),
    "lastStatusCode" INTEGER,
    "lastError" TEXT,
    "deliveredAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ApiWebhookDelivery_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApiCatalogTracker" (
    "tenantId" TEXT NOT NULL,
    "offersCursor" TIMESTAMP(3),
    "productsCursor" TIMESTAMP(3),
    "lastFullScanAt" TIMESTAMP(3),
    "baselineAt" TIMESTAMP(3),
    "pausedProviders" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ApiCatalogTracker_pkey" PRIMARY KEY ("tenantId")
);

-- CreateTable
CREATE TABLE "ApiOfferState" (
    "tenantId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "price" DECIMAL(14,4),
    "finalPrice" DECIMAL(14,4),
    "stock" INTEGER,
    "active" BOOLEAN NOT NULL,
    "productHash" TEXT NOT NULL,
    "seenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ApiOfferState_pkey" PRIMARY KEY ("tenantId","provider","externalId")
);

-- CreateTable
CREATE TABLE "ApiCatalogEvent" (
    "id" BIGSERIAL NOT NULL,
    "tenantId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "externalId" TEXT,
    "changed" TEXT[],
    "data" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ApiCatalogEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ApiClient_publicKey_key" ON "ApiClient"("publicKey");

-- CreateIndex
CREATE UNIQUE INDEX "ApiClient_feedToken_key" ON "ApiClient"("feedToken");

-- CreateIndex
CREATE INDEX "ApiClient_tenantId_status_idx" ON "ApiClient"("tenantId", "status");

-- CreateIndex
CREATE INDEX "ApiWebhookEndpoint_apiClientId_idx" ON "ApiWebhookEndpoint"("apiClientId");

-- CreateIndex
CREATE UNIQUE INDEX "ApiWebhookDelivery_eventId_key" ON "ApiWebhookDelivery"("eventId");

-- CreateIndex
CREATE INDEX "ApiWebhookDelivery_endpointId_createdAt_idx" ON "ApiWebhookDelivery"("endpointId", "createdAt");

-- CreateIndex
CREATE INDEX "ApiWebhookDelivery_status_nextAttemptAt_idx" ON "ApiWebhookDelivery"("status", "nextAttemptAt");

-- CreateIndex
CREATE INDEX "ApiCatalogEvent_tenantId_id_idx" ON "ApiCatalogEvent"("tenantId", "id");

-- CreateIndex
CREATE INDEX "ApiCatalogEvent_createdAt_idx" ON "ApiCatalogEvent"("createdAt");

-- CreateIndex
CREATE INDEX "TenantProductOffer_tenantId_updatedAt_idx" ON "TenantProductOffer"("tenantId", "updatedAt");

-- AddForeignKey
ALTER TABLE "ApiClient" ADD CONSTRAINT "ApiClient_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApiUsageDaily" ADD CONSTRAINT "ApiUsageDaily_apiClientId_fkey" FOREIGN KEY ("apiClientId") REFERENCES "ApiClient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApiWebhookEndpoint" ADD CONSTRAINT "ApiWebhookEndpoint_apiClientId_fkey" FOREIGN KEY ("apiClientId") REFERENCES "ApiClient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApiWebhookDelivery" ADD CONSTRAINT "ApiWebhookDelivery_endpointId_fkey" FOREIGN KEY ("endpointId") REFERENCES "ApiWebhookEndpoint"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApiCatalogTracker" ADD CONSTRAINT "ApiCatalogTracker_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

