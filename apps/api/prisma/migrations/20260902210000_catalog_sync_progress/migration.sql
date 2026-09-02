-- CreateTable
CREATE TABLE "CatalogSyncRun" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'RUNNING',
    "source" TEXT NOT NULL DEFAULT 'manual',
    "processed" INTEGER NOT NULL DEFAULT 0,
    "created" INTEGER NOT NULL DEFAULT 0,
    "updated" INTEGER NOT NULL DEFAULT 0,
    "unchanged" INTEGER NOT NULL DEFAULT 0,
    "missingAffected" INTEGER NOT NULL DEFAULT 0,
    "zeroStockAffected" INTEGER NOT NULL DEFAULT 0,
    "expectedTotal" INTEGER NOT NULL DEFAULT 0,
    "changesStored" INTEGER NOT NULL DEFAULT 0,
    "changesTruncated" BOOLEAN NOT NULL DEFAULT false,
    "errorMessage" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "heartbeatAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CatalogSyncRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CatalogSyncChange" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "changedFields" JSONB NOT NULL,
    "before" JSONB,
    "after" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CatalogSyncChange_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CatalogSyncRun_tenantId_provider_startedAt_idx" ON "CatalogSyncRun"("tenantId", "provider", "startedAt");

-- CreateIndex
CREATE INDEX "CatalogSyncRun_tenantId_provider_status_idx" ON "CatalogSyncRun"("tenantId", "provider", "status");

-- CreateIndex
CREATE INDEX "CatalogSyncChange_runId_action_idx" ON "CatalogSyncChange"("runId", "action");

-- AddForeignKey
ALTER TABLE "CatalogSyncRun" ADD CONSTRAINT "CatalogSyncRun_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CatalogSyncChange" ADD CONSTRAINT "CatalogSyncChange_runId_fkey" FOREIGN KEY ("runId") REFERENCES "CatalogSyncRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;
