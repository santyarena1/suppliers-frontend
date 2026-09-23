-- Cada local puede ocultar las fichas de un distribuidor que todavía no sincronizó.
ALTER TABLE "ProviderSyncConfig" ADD COLUMN "hideUnsyncedCatalog" BOOLEAN NOT NULL DEFAULT false;
