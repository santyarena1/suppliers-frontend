-- Carrito de la organización y publicidad paga (espacios, campañas, eventos).

CREATE TABLE "OrgCart" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "items" JSONB NOT NULL DEFAULT '[]',
  "schemes" JSONB NOT NULL DEFAULT '[]',
  "updatedByUserId" TEXT,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "OrgCart_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "OrgCart_tenantId_key" ON "OrgCart"("tenantId");

ALTER TABLE "OrgCart"
  ADD CONSTRAINT "OrgCart_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TYPE "AdCampaignStatus" AS ENUM ('DRAFT', 'ACTIVE', 'PAUSED', 'ENDED');

CREATE TABLE "AdSlot" (
  "id" TEXT NOT NULL,
  "key" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT NOT NULL DEFAULT '',
  "placement" TEXT NOT NULL,
  "monthlyPriceUsd" DECIMAL(10,2) NOT NULL,
  "maxConcurrent" INTEGER NOT NULL DEFAULT 1,
  "enabled" BOOLEAN NOT NULL DEFAULT false,

  CONSTRAINT "AdSlot_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AdSlot_key_key" ON "AdSlot"("key");

CREATE TABLE "AdCampaign" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "slotId" TEXT NOT NULL,
  "status" "AdCampaignStatus" NOT NULL DEFAULT 'DRAFT',
  "title" TEXT NOT NULL,
  "subtitle" TEXT NOT NULL DEFAULT '',
  "imageUrl" TEXT,
  "linkUrl" TEXT,
  "startsAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "endsAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "AdCampaign_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AdCampaign_tenantId_status_idx" ON "AdCampaign"("tenantId", "status");
CREATE INDEX "AdCampaign_slotId_status_idx" ON "AdCampaign"("slotId", "status");

ALTER TABLE "AdCampaign"
  ADD CONSTRAINT "AdCampaign_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AdCampaign"
  ADD CONSTRAINT "AdCampaign_slotId_fkey"
  FOREIGN KEY ("slotId") REFERENCES "AdSlot"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "AdEvent" (
  "id" TEXT NOT NULL,
  "campaignId" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "path" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "AdEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AdEvent_campaignId_createdAt_idx" ON "AdEvent"("campaignId", "createdAt");
CREATE INDEX "AdEvent_kind_createdAt_idx" ON "AdEvent"("kind", "createdAt");

ALTER TABLE "AdEvent"
  ADD CONSTRAINT "AdEvent_campaignId_fkey"
  FOREIGN KEY ("campaignId") REFERENCES "AdCampaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;
