-- AlterTable
ALTER TABLE "ProviderOrder" ADD COLUMN "channel" TEXT NOT NULL DEFAULT 'ONLINE';

-- CreateIndex
CREATE INDEX "ProviderOrder_tenantId_channel_idx" ON "ProviderOrder"("tenantId", "channel");
