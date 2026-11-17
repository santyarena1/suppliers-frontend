-- API de pedidos: el aviso pedido.facturado sale una sola vez por pedido.
ALTER TABLE "ApiOrderState" ADD COLUMN "invoiced" BOOLEAN NOT NULL DEFAULT false;
UPDATE "ApiOrderState" s SET "invoiced" = true
FROM "ProviderOrder" o
WHERE o."id" = s."orderId" AND COALESCE(TRIM(o."trackingInvoice"), '') <> '';
