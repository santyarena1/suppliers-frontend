-- Comprobantes de pago cargados desde NODO: el portal de Invid no muestra cuáles ya se enviaron.
CREATE TABLE "ProviderPaymentReceipt" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "orderNumber" TEXT NOT NULL,
    "bank" TEXT,
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProviderPaymentReceipt_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ProviderPaymentReceipt_tenantId_provider_orderNumber_idx" ON "ProviderPaymentReceipt"("tenantId", "provider", "orderNumber");

ALTER TABLE "ProviderPaymentReceipt" ADD CONSTRAINT "ProviderPaymentReceipt_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
