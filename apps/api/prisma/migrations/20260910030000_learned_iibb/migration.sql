-- Percepción aprendida del portal del proveedor, por comercio.
ALTER TABLE "ProviderSyncConfig" ADD COLUMN "learnedIibbPercent" DECIMAL(6,2);
ALTER TABLE "ProviderSyncConfig" ADD COLUMN "learnedIibbAt" TIMESTAMP(3);
