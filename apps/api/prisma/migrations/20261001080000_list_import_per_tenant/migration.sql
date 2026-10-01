-- AlterTable
ALTER TABLE "ImportProfile" ADD COLUMN     "tenantId" TEXT;

-- AlterTable
ALTER TABLE "ProviderSyncConfig" ADD COLUMN     "listUpdateDays" INTEGER;

-- CreateIndex
CREATE INDEX "ImportProfile_provider_tenantId_status_idx" ON "ImportProfile"("provider", "tenantId", "status");


-- Dueño de cada perfil existente: la organización de la última carga que lo
-- usó (el proveedor en la lista base, el comercio en su lista propia).
WITH owners AS (
  SELECT DISTINCT ON (i."profileId")
    i."profileId" AS profile_id,
    CASE WHEN i."level" = 'BASE' THEN sup."id" ELSE i."tenantId" END AS owner_id
  FROM "SupplierListImport" i
  LEFT JOIN "Tenant" sup ON sup."providerKey" = i."provider"
  WHERE i."profileId" IS NOT NULL
  ORDER BY i."profileId", i."createdAt" DESC
)
UPDATE "ImportProfile" p
SET "tenantId" = owners.owner_id
FROM owners
WHERE p."id" = owners.profile_id AND owners.owner_id IS NOT NULL;

-- Un perfil ACTIVE que usaban varias organizaciones: cada una se lleva su copia,
-- así nadie arranca de cero ni sigue compartiendo el mismo perfil.
INSERT INTO "ImportProfile" (
  "id", "provider", "tenantId", "version", "status", "fingerprint", "headers", "sheetIndex", "sheetName",
  "headerRow", "columnMap", "currency", "priceIncludesIva", "ivaPercent", "numberFormat", "dividerMeaning",
  "sampleRows", "proposedByAi", "aiReasoning", "approvedByUserId", "createdAt", "updatedAt"
)
SELECT
  gen_random_uuid()::text, p."provider", u.owner_id, p."version", p."status", p."fingerprint", p."headers", p."sheetIndex", p."sheetName",
  p."headerRow", p."columnMap", p."currency", p."priceIncludesIva", p."ivaPercent", p."numberFormat", p."dividerMeaning",
  NULL, p."proposedByAi", p."aiReasoning", p."approvedByUserId", NOW(), NOW()
FROM "ImportProfile" p
JOIN (
  SELECT DISTINCT i."profileId" AS profile_id,
    CASE WHEN i."level" = 'BASE' THEN sup."id" ELSE i."tenantId" END AS owner_id
  FROM "SupplierListImport" i
  LEFT JOIN "Tenant" sup ON sup."providerKey" = i."provider"
  WHERE i."profileId" IS NOT NULL
) u ON u.profile_id = p."id"
WHERE p."status" = 'ACTIVE' AND u.owner_id IS NOT NULL AND u.owner_id <> p."tenantId";
