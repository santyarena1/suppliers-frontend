-- Armador de PC: armados guardados / plantillas y lo que cobra cada comercio por armar.
CREATE TABLE "PcBuild" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "clientName" TEXT,
    "template" BOOLEAN NOT NULL DEFAULT false,
    "data" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "PcBuild_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "PcBuild_tenantId_template_updatedAt_idx" ON "PcBuild"("tenantId", "template", "updatedAt");
ALTER TABLE "PcBuild" ADD CONSTRAINT "PcBuild_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "PcBuilderSettings" (
    "tenantId" TEXT NOT NULL,
    "laborName" TEXT,
    "laborPrice" DECIMAL(14,2),
    "laborIva" DECIMAL(5,2) NOT NULL DEFAULT 21,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "PcBuilderSettings_pkey" PRIMARY KEY ("tenantId")
);
ALTER TABLE "PcBuilderSettings" ADD CONSTRAINT "PcBuilderSettings_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
