-- Offline y esquema dejan de compartir el tratamiento de IVA.
ALTER TABLE "ProviderSyncConfig" ADD COLUMN "offlineIvaAdjustment" "IvaAdjustment",
ADD COLUMN "schemeIvaAdjustment" "IvaAdjustment";

UPDATE "ProviderSyncConfig"
SET "offlineIvaAdjustment" = "ivaAdjustment",
    "schemeIvaAdjustment" = "ivaAdjustment"
WHERE "ivaAdjustment" IS NOT NULL;

ALTER TABLE "ProviderSyncConfig" DROP COLUMN "ivaAdjustment";
