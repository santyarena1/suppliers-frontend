-- Foto del carrito del portal del proveedor tal como NODO lo dejó en la última
-- verificación, para que el carrito sea el mismo de los dos lados.
ALTER TABLE "ProviderSyncConfig" ADD COLUMN "portalCartSnapshot" JSONB;
ALTER TABLE "ProviderSyncConfig" ADD COLUMN "portalCartSyncedAt" TIMESTAMP(3);
