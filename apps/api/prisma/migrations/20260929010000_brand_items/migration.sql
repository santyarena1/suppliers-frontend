-- Productos de la marca agrupando sus códigos en cada distribuidor, y configuración del semáforo.
-- CreateEnum
CREATE TYPE "BrandStockMode" AS ENUM ('AUTO', 'MANUAL');

-- CreateEnum
CREATE TYPE "BrandStockLevel" AS ENUM ('NONE', 'LOW', 'MEDIUM', 'HIGH');

-- CreateEnum
CREATE TYPE "BrandItemState" AS ENUM ('INCOMING', 'DISCONTINUED');

-- CreateTable
CREATE TABLE "BrandStockSettings" (
    "tenantId" TEXT NOT NULL,
    "mode" "BrandStockMode" NOT NULL DEFAULT 'AUTO',
    "lowBelow" INTEGER NOT NULL DEFAULT 5,
    "highFrom" INTEGER NOT NULL DEFAULT 20,
    "brandSeesExact" BOOLEAN NOT NULL DEFAULT false,
    "publicStock" BOOLEAN NOT NULL DEFAULT true,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BrandStockSettings_pkey" PRIMARY KEY ("tenantId")
);

-- CreateTable
CREATE TABLE "BrandItem" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "partNumber" TEXT,
    "ean" TEXT,
    "imageUrl" TEXT,
    "referencePrice" DECIMAL(14,4),
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "state" "BrandItemState",
    "incomingAt" TIMESTAMP(3),
    "notes" TEXT,
    "position" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BrandItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BrandItemLink" (
    "id" TEXT NOT NULL,
    "brandItemId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "manualLevel" "BrandStockLevel",
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BrandItemLink_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BrandItem_tenantId_active_position_idx" ON "BrandItem"("tenantId", "active", "position");

-- CreateIndex
CREATE INDEX "BrandItemLink_provider_externalId_idx" ON "BrandItemLink"("provider", "externalId");

-- CreateIndex
CREATE UNIQUE INDEX "BrandItemLink_brandItemId_provider_externalId_key" ON "BrandItemLink"("brandItemId", "provider", "externalId");

-- AddForeignKey
ALTER TABLE "BrandStockSettings" ADD CONSTRAINT "BrandStockSettings_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BrandItem" ADD CONSTRAINT "BrandItem_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BrandItemLink" ADD CONSTRAINT "BrandItemLink_brandItemId_fkey" FOREIGN KEY ("brandItemId") REFERENCES "BrandItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Lo que las marcas ya cargaron en el semáforo por código pasa a productos.
-- Verde=Alto, Amarillo=Bajo, Rojo=Sin stock; Azul/Gris son estados del producto.
INSERT INTO "BrandItem" ("id", "tenantId", "name", "imageUrl", "referencePrice", "state", "incomingAt", "notes", "updatedAt")
SELECT s."id", s."tenantId", s."name", s."imageUrl", s."suggestedPrice",
       (CASE s."light" WHEN 'BLUE' THEN 'INCOMING' WHEN 'GRAY' THEN 'DISCONTINUED' END)::"BrandItemState",
       s."incomingAt", s."notes", NOW()
FROM "BrandSkuSignal" s;

INSERT INTO "BrandItemLink" ("id", "brandItemId", "provider", "externalId", "manualLevel", "updatedAt")
SELECT md5(s."id" || ':link'), s."id", s."provider", s."externalId",
       (CASE s."light" WHEN 'GREEN' THEN 'HIGH' WHEN 'YELLOW' THEN 'LOW' WHEN 'RED' THEN 'NONE' END)::"BrandStockLevel",
       NOW()
FROM "BrandSkuSignal" s;

-- Quien ya usaba el semáforo lo hacía a mano: sigue en manual.
INSERT INTO "BrandStockSettings" ("tenantId", "mode", "updatedAt")
SELECT DISTINCT s."tenantId", 'MANUAL'::"BrandStockMode", NOW()
FROM "BrandSkuSignal" s
ON CONFLICT ("tenantId") DO NOTHING;
