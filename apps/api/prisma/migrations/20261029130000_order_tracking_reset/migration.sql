-- La primera vuelta del seguimiento (29/10) leyó mal «No preparado» (Elit) y
-- «Armado Finalizado» (New Bytes) y avisó de golpe pedidos viejos: se recalcula
-- todo (la primera lectura de un pedido viejo ya no avisa) y se borran esos avisos.
UPDATE "ProviderOrder" SET "trackingStage" = NULL, "trackingStatus" = NULL, "trackingInvoice" = NULL,
  "trackingNumber" = NULL, "trackingCarrier" = NULL, "trackingHistory" = NULL,
  "trackingCheckedAt" = NULL, "trackingChangedAt" = NULL
WHERE "trackingCheckedAt" IS NOT NULL;

DELETE FROM "OrgNotification" WHERE "landingKey" LIKE 'order:%';
