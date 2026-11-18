-- Renglones reales de cada factura y el kit del armado en esquema.
ALTER TABLE "ProviderOrderDocument" ADD COLUMN "lines" JSONB;
ALTER TABLE "ProviderOrderDocument" ADD COLUMN "scheme" JSONB;
ALTER TABLE "ProviderOrderDocument" ADD COLUMN "linesFetchedAt" TIMESTAMP(3);
ALTER TABLE "ApiInvoiceState" ADD COLUMN "schema" INTEGER NOT NULL DEFAULT 1;
