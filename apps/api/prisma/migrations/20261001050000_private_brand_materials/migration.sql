-- Los materiales de marca marcados "solo vinculados" pasan a ser archivos
-- privados de esa marca: sin link firmado no se descargan.
UPDATE "StoredAsset" a
SET "isPrivate" = true, "ownerTenantId" = r."tenantId"
FROM "BrandResource" r
WHERE r."isPublic" = false
  AND r."fileUrl" = '/assets/' || a."id"
  AND (a."ownerTenantId" IS NULL OR a."ownerTenantId" = r."tenantId");
