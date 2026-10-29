-- Segunda corrección del seguimiento (29/10), verificada contra los portales reales:
-- Elit manda «0» sin factura/remito (se tomaba como despachado), el «MIN-…» de New Bytes
-- no es un envío y «Cerrado» de Invid no dice si facturó. Se recalcula todo; la primera
-- lectura de pedidos viejos no avisa. El aviso falso «Elit despachó tu pedido» se borra.
UPDATE "ProviderOrder" SET "trackingStage" = NULL, "trackingStatus" = NULL, "trackingInvoice" = NULL,
  "trackingNumber" = NULL, "trackingCarrier" = NULL, "trackingHistory" = NULL,
  "trackingCheckedAt" = NULL, "trackingChangedAt" = NULL
WHERE "trackingCheckedAt" IS NOT NULL;

DELETE FROM "OrgNotification" WHERE "landingKey" LIKE 'order:%';
