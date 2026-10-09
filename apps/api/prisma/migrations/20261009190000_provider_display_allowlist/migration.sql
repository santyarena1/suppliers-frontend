-- Distribuidor oculto pero visible para algunas organizaciones.
ALTER TABLE "ProviderDisplayConfig" ADD COLUMN "allowedTenantIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
