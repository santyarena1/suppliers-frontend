-- Claves de AcuStock del módulo SISTEMA TGS, cifradas por organización.

CREATE TABLE "TgsSettings" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "apiKeyEncrypted" TEXT,
    "apiSecretEncrypted" TEXT,
    "baseUrl" TEXT,
    "savedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TgsSettings_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "TgsSettings_tenantId_key" ON "TgsSettings"("tenantId");

ALTER TABLE "TgsSettings" ADD CONSTRAINT "TgsSettings_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "TgsSettings" ADD CONSTRAINT "TgsSettings_savedById_fkey" FOREIGN KEY ("savedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
