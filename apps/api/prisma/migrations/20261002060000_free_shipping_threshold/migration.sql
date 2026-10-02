-- Envío gratis desde un total por distribuidor (formas de envío propias).
ALTER TABLE "ProviderSyncConfig" ADD COLUMN "freeShippingFrom" DECIMAL(14,2);
ALTER TABLE "ProviderSyncConfig" ADD COLUMN "freeShippingCurrency" TEXT;
