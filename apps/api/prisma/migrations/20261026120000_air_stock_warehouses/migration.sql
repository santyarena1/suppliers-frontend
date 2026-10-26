-- Air: depósitos cuyo stock ve cada comercio. Vacío = todos.
ALTER TABLE "ProviderSyncConfig" ADD COLUMN "stockWarehouses" TEXT[] DEFAULT ARRAY[]::TEXT[];
