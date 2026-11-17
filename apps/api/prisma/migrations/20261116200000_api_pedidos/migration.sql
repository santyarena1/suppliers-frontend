-- API de pedidos (Sistema TGS / AcuStock): número legible por comercio,
-- estado publicado de cada pedido, eventos y cursor de webhooks.

ALTER TABLE "ProviderOrder" ADD COLUMN "number" INTEGER;

-- Numera los pedidos existentes por comercio, en orden de creación.
UPDATE "ProviderOrder" p
SET "number" = n.rn
FROM (
  SELECT "id", ROW_NUMBER() OVER (PARTITION BY "tenantId" ORDER BY "createdAt", "id") AS rn
  FROM "ProviderOrder"
) n
WHERE p."id" = n."id";

CREATE UNIQUE INDEX "ProviderOrder_tenantId_number_key" ON "ProviderOrder"("tenantId", "number");

ALTER TABLE "ApiWebhookEndpoint" ADD COLUMN "orderCursor" BIGINT;

CREATE TABLE "ApiOrderState" (
    "orderId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "hash" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "changedAt" TIMESTAMP(3) NOT NULL,
    "cancelled" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ApiOrderState_pkey" PRIMARY KEY ("orderId")
);
CREATE INDEX "ApiOrderState_tenantId_changedAt_idx" ON "ApiOrderState"("tenantId", "changedAt");

CREATE TABLE "ApiOrderEvent" (
    "id" BIGSERIAL NOT NULL,
    "tenantId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ApiOrderEvent_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "ApiOrderEvent_tenantId_id_idx" ON "ApiOrderEvent"("tenantId", "id");

CREATE TABLE "ApiOrderTracker" (
    "tenantId" TEXT NOT NULL,
    "checkedUntil" TIMESTAMP(3) NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ApiOrderTracker_pkey" PRIMARY KEY ("tenantId")
);
