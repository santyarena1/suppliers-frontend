-- Facturas y remitos de cada pedido, bajados del portal del distribuidor.
CREATE TABLE "ProviderOrderDocument" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "portalRef" TEXT NOT NULL,
    "portalNumber" TEXT,
    "link" TEXT NOT NULL,
    "tipo" TEXT,
    "tipoCodigo" INTEGER,
    "puntoVenta" INTEGER,
    "numero" INTEGER,
    "fechaEmision" TEXT,
    "cae" TEXT,
    "caeVencimiento" TEXT,
    "cuitEmisor" TEXT,
    "importeTotal" DECIMAL(18,2),
    "moneda" TEXT,
    "cotizacion" DECIMAL(18,6),
    "origen" TEXT,
    "assetId" TEXT,
    "sha256" TEXT,
    "byteSize" INTEGER,
    "fetchedAt" TIMESTAMP(3),
    "fetchError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ProviderOrderDocument_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ProviderOrderDocument_orderId_portalRef_key" ON "ProviderOrderDocument"("orderId", "portalRef");
CREATE INDEX "ProviderOrderDocument_tenantId_provider_idx" ON "ProviderOrderDocument"("tenantId", "provider");
CREATE INDEX "ProviderOrderDocument_orderId_idx" ON "ProviderOrderDocument"("orderId");
CREATE INDEX "ProviderOrderDocument_tenantId_updatedAt_idx" ON "ProviderOrderDocument"("tenantId", "updatedAt");

-- El hash de la API de pedidos se recalcula una vez sin avisar cuando el armado suma campos.
ALTER TABLE "ApiOrderState" ADD COLUMN "schema" INTEGER NOT NULL DEFAULT 1;

-- Elit y Solution Box: «pedido.facturado» pasa a salir cuando están los datos fiscales
-- (CAE, número), no solo el número que mostraba el seguimiento.
UPDATE "ApiOrderState" s SET "invoiced" = false
FROM "ProviderOrder" o
WHERE o."id" = s."orderId" AND o."provider" IN ('ELIT', 'SOLUTION_BOX');
