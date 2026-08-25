-- Tipo 2: chat por vínculo y búsqueda de clientes por vendedor asignado.

CREATE TABLE "TenantLinkMessage" (
    "id" TEXT NOT NULL,
    "linkId" TEXT NOT NULL,
    "senderUserId" TEXT NOT NULL,
    "senderTenantId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TenantLinkMessage_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "TenantLinkMessage_linkId_createdAt_idx" ON "TenantLinkMessage"("linkId", "createdAt");

ALTER TABLE "TenantLinkMessage" ADD CONSTRAINT "TenantLinkMessage_linkId_fkey" FOREIGN KEY ("linkId") REFERENCES "TenantLink"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TenantLinkMessage" ADD CONSTRAINT "TenantLinkMessage_senderUserId_fkey" FOREIGN KEY ("senderUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TenantLinkMessage" ADD CONSTRAINT "TenantLinkMessage_senderTenantId_fkey" FOREIGN KEY ("senderTenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "TenantLink_accountManagerId_idx" ON "TenantLink"("accountManagerId");
