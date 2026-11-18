-- Comprobantes del portal aunque no estén unidos a un pedido de NODO (van igual a AcuStock).
ALTER TABLE "ProviderOrderDocument" ALTER COLUMN "orderId" DROP NOT NULL;
ALTER TABLE "ProviderOrderDocument" ALTER COLUMN "link" DROP NOT NULL;
ALTER TABLE "ProviderOrderDocument" ADD COLUMN "generated" BOOLEAN NOT NULL DEFAULT false;

-- Un comprobante es uno solo por distribuidor (antes era uno por pedido).
DELETE FROM "ProviderOrderDocument" a
USING "ProviderOrderDocument" b
WHERE a."tenantId" = b."tenantId" AND a."provider" = b."provider" AND a."portalRef" = b."portalRef"
  AND (a."createdAt" > b."createdAt" OR (a."createdAt" = b."createdAt" AND a."id" > b."id"));
DROP INDEX IF EXISTS "ProviderOrderDocument_orderId_portalRef_key";
CREATE UNIQUE INDEX "ProviderOrderDocument_tenantId_provider_portalRef_key" ON "ProviderOrderDocument"("tenantId", "provider", "portalRef");

-- API de facturas: versión publicada de cada comprobante.
CREATE TABLE "ApiInvoiceState" (
    "documentId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "hash" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "changedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ApiInvoiceState_pkey" PRIMARY KEY ("documentId")
);
CREATE INDEX "ApiInvoiceState_tenantId_changedAt_idx" ON "ApiInvoiceState"("tenantId", "changedAt");
ALTER TABLE "ApiOrderTracker" ADD COLUMN "invoicesCheckedUntil" TIMESTAMP(3);
