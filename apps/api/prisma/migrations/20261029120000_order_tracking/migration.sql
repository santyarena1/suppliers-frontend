-- Seguimiento de pedidos en el portal del distribuidor.
ALTER TABLE "ProviderOrder" ADD COLUMN "trackingStage" TEXT,
  ADD COLUMN "trackingStatus" TEXT,
  ADD COLUMN "trackingInvoice" TEXT,
  ADD COLUMN "trackingNumber" TEXT,
  ADD COLUMN "trackingCarrier" TEXT,
  ADD COLUMN "trackingHistory" JSONB,
  ADD COLUMN "trackingCheckedAt" TIMESTAMP(3),
  ADD COLUMN "trackingChangedAt" TIMESTAMP(3);

CREATE INDEX "ProviderOrder_trackingChangedAt_idx" ON "ProviderOrder"("trackingChangedAt");
