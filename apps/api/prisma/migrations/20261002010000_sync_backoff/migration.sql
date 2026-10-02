-- AlterTable
ALTER TABLE "ProviderSyncConfig" ADD COLUMN     "consecutiveFailures" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "lastAttemptAt" TIMESTAMP(3),
ADD COLUMN     "pauseReason" TEXT,
ADD COLUMN     "pausedAt" TIMESTAMP(3);


-- Una sola corrida RUNNING por organización y proveedor: dos arranques
-- simultáneos (cron + botón, o dos réplicas) ya no pueden correr a la vez.
-- Antes de crear el índice se cierran las RUNNING duplicadas (queda la última).
UPDATE "CatalogSyncRun" r
SET "status" = 'ERROR', "finishedAt" = NOW(), "errorMessage" = 'Duplicada: había otra corrida en curso'
WHERE r."status" = 'RUNNING'
  AND EXISTS (
    SELECT 1 FROM "CatalogSyncRun" o
    WHERE o."tenantId" = r."tenantId" AND o."provider" = r."provider" AND o."status" = 'RUNNING'
      AND (o."startedAt" > r."startedAt" OR (o."startedAt" = r."startedAt" AND o."id" > r."id"))
  );

CREATE UNIQUE INDEX "CatalogSyncRun_one_running_per_provider"
  ON "CatalogSyncRun"("tenantId", "provider")
  WHERE "status" = 'RUNNING';
