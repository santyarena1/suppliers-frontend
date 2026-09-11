-- Formas de pago con descuento o recargo, por comercio y proveedor.
ALTER TABLE "ProviderSyncConfig" ADD COLUMN "paymentOptions" JSONB;
