-- Pedidos ya creados: sus productos se sacan del carrito compartido del comercio.
ALTER TABLE "ProviderOrder" ADD COLUMN "cartReconciledAt" TIMESTAMP(3);

-- Los pedidos que ya existían no tocan el carrito de hoy.
UPDATE "ProviderOrder" SET "cartReconciledAt" = NOW();

CREATE INDEX "ProviderOrder_status_cartReconciledAt_idx" ON "ProviderOrder"("status", "cartReconciledAt");
