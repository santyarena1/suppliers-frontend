-- Fase 5 del plan de aislamiento: el carrito y los pedidos son de la organización.
--
-- El carrito sigue siendo personal (dos vendedores del mismo local no se pisan),
-- pero pasa a vivir dentro de una organización: si alguien cambia de comercio, el
-- carrito que armó en el anterior no lo sigue.
--
-- Los pedidos pasan a ser de la organización: el dueño ve y aprueba lo que armaron
-- sus vendedores, y nadie ve los pedidos de otro comercio.

-- ---------- CartItem ----------

ALTER TABLE "CartItem" ADD COLUMN "tenantId" TEXT;

-- La organización se resuelve igual que en la sesión: la membresía activa más antigua.
UPDATE "CartItem" c
SET "tenantId" = (
  SELECT m."tenantId"
  FROM "TenantMembership" m
  JOIN "Tenant" t ON t.id = m."tenantId"
  WHERE m."userId" = c."userId" AND m.active AND t.active
  ORDER BY m."createdAt" ASC
  LIMIT 1
);

-- Un carrito sin organización no se puede mostrar en el modelo nuevo, y rehacerlo
-- es cuestión de volver a buscar los productos.
DELETE FROM "CartItem" WHERE "tenantId" IS NULL;

ALTER TABLE "CartItem" ALTER COLUMN "tenantId" SET NOT NULL;

DROP INDEX "CartItem_userId_provider_externalId_key";
CREATE UNIQUE INDEX "CartItem_userId_tenantId_provider_externalId_key"
  ON "CartItem"("userId", "tenantId", "provider", "externalId");
CREATE INDEX "CartItem_tenantId_idx" ON "CartItem"("tenantId");

ALTER TABLE "CartItem" ADD CONSTRAINT "CartItem_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"(id) ON DELETE CASCADE ON UPDATE CASCADE;

-- ---------- ProviderOrder ----------

ALTER TABLE "ProviderOrder" ADD COLUMN "tenantId" TEXT;
ALTER TABLE "ProviderOrder" ADD COLUMN "rejectionReason" TEXT;
ALTER TABLE "ProviderOrder" ADD COLUMN "draftInput" JSONB;

UPDATE "ProviderOrder" o
SET "tenantId" = (
  SELECT m."tenantId"
  FROM "TenantMembership" m
  JOIN "Tenant" t ON t.id = m."tenantId"
  WHERE m."userId" = o."userId" AND m.active AND t.active
  ORDER BY m."createdAt" ASC
  LIMIT 1
);

-- Quien armó el pedido es quien figuraba como dueño hasta ahora.
UPDATE "ProviderOrder" SET "createdByUserId" = "userId" WHERE "createdByUserId" IS NULL;

-- Un pedido sin organización no tiene lugar en el modelo nuevo. Antes de borrarlo
-- queda su contenido en la auditoría, porque es historial de compra real.
INSERT INTO "AuditLogEntry" (id, "entityType", "entityId", action, "performedById", changes, "createdAt")
SELECT gen_random_uuid()::TEXT, 'ProviderOrder', o.id, 'DISCARDED_ON_TENANT_MIGRATION', o."userId",
       jsonb_build_object(
         'motivo', 'Quien lo creó no pertenece a ninguna organización',
         'provider', o.provider,
         'status', o.status,
         'total', o.total,
         'items', o.items,
         'createdAt', o."createdAt"
       ),
       now()
FROM "ProviderOrder" o
WHERE o."tenantId" IS NULL;

DELETE FROM "ProviderOrder" WHERE "tenantId" IS NULL;

ALTER TABLE "ProviderOrder" ALTER COLUMN "tenantId" SET NOT NULL;

CREATE INDEX "ProviderOrder_tenantId_provider_createdAt_idx"
  ON "ProviderOrder"("tenantId", "provider", "createdAt");
CREATE INDEX "ProviderOrder_tenantId_approvalStatus_idx"
  ON "ProviderOrder"("tenantId", "approvalStatus");

ALTER TABLE "ProviderOrder" ADD CONSTRAINT "ProviderOrder_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"(id) ON DELETE CASCADE ON UPDATE CASCADE;

-- Quién lo armó y quién lo aprobó, para poder mostrarlos por nombre.
ALTER TABLE "ProviderOrder" ADD CONSTRAINT "ProviderOrder_createdByUserId_fkey"
  FOREIGN KEY ("createdByUserId") REFERENCES "User"(id) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ProviderOrder" ADD CONSTRAINT "ProviderOrder_approvedByUserId_fkey"
  FOREIGN KEY ("approvedByUserId") REFERENCES "User"(id) ON DELETE SET NULL ON UPDATE CASCADE;
