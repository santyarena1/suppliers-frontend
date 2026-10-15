-- Vender en NODO: perfil público, condiciones, fotos por producto, tienda privada
-- con invitación, comercios que eligen verla y cierre/reapertura. Solo aditiva,
-- salvo que los comercios que veían una tienda sin haberlo elegido pasan a
-- tener la propuesta pendiente (los que ya le compraron quedan aceptados).

-- CreateEnum
CREATE TYPE "StorefrontVisibility" AS ENUM ('PUBLIC', 'PRIVATE');

-- CreateEnum
CREATE TYPE "StorefrontAudienceStatus" AS ENUM ('PENDING', 'ACCEPTED', 'DECLINED', 'REMOVED');

-- AlterEnum
ALTER TYPE "StorefrontStatus" ADD VALUE 'CLOSED';

-- AlterTable
ALTER TABLE "StoredAsset" ADD COLUMN     "purpose" TEXT;

-- AlterTable
ALTER TABLE "Storefront" ADD COLUMN     "about" TEXT,
ADD COLUMN     "closedAt" TIMESTAMP(3),
ADD COLUMN     "defaultWarranty" TEXT,
ADD COLUMN     "deliveryOptions" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "displayName" TEXT,
ADD COLUMN     "inviteToken" TEXT,
ADD COLUMN     "invoiceTypes" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "logoUrl" TEXT,
ADD COLUMN     "paymentMethods" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "salesTerms" TEXT,
ADD COLUMN     "sellsOffline" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "staleAction" TEXT NOT NULL DEFAULT 'KEEP',
ADD COLUMN     "visibility" "StorefrontVisibility" NOT NULL DEFAULT 'PUBLIC';

-- CreateTable
CREATE TABLE "StorefrontItem" (
    "id" TEXT NOT NULL,
    "storefrontId" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "images" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "condition" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StorefrontItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StorefrontAudience" (
    "id" TEXT NOT NULL,
    "storefrontId" TEXT NOT NULL,
    "buyerTenantId" TEXT NOT NULL,
    "status" "StorefrontAudienceStatus" NOT NULL DEFAULT 'PENDING',
    "source" TEXT NOT NULL DEFAULT 'PUBLIC',
    "decidedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StorefrontAudience_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "StorefrontItem_storefrontId_externalId_key" ON "StorefrontItem"("storefrontId", "externalId");

-- CreateIndex
CREATE INDEX "StorefrontAudience_buyerTenantId_status_idx" ON "StorefrontAudience"("buyerTenantId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "StorefrontAudience_storefrontId_buyerTenantId_key" ON "StorefrontAudience"("storefrontId", "buyerTenantId");

-- CreateIndex
CREATE INDEX "StoredAsset_ownerTenantId_purpose_idx" ON "StoredAsset"("ownerTenantId", "purpose");

-- CreateIndex
CREATE UNIQUE INDEX "Storefront_inviteToken_key" ON "Storefront"("inviteToken");

-- AddForeignKey
ALTER TABLE "StorefrontItem" ADD CONSTRAINT "StorefrontItem_storefrontId_fkey" FOREIGN KEY ("storefrontId") REFERENCES "Storefront"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StorefrontAudience" ADD CONSTRAINT "StorefrontAudience_storefrontId_fkey" FOREIGN KEY ("storefrontId") REFERENCES "Storefront"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StorefrontAudience" ADD CONSTRAINT "StorefrontAudience_buyerTenantId_fkey" FOREIGN KEY ("buyerTenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Quién ve cada tienda abierta hoy.
INSERT INTO "StorefrontAudience" ("id", "storefrontId", "buyerTenantId", "status", "source", "decidedAt", "createdAt")
SELECT md5(random()::text || clock_timestamp()::text || l."id")::uuid::text, s."id", l."clientTenantId",
       CASE
         WHEN l."status" = 'REVOKED' THEN 'DECLINED'::"StorefrontAudienceStatus"
         WHEN EXISTS (
           SELECT 1 FROM "ProviderOrder" o
           JOIN "Tenant" sup ON sup."id" = s."supplierTenantId"
           WHERE o."tenantId" = l."clientTenantId" AND o."provider" = sup."providerKey" AND o."storefrontStatus" IS NOT NULL
         ) THEN 'ACCEPTED'::"StorefrontAudienceStatus"
         ELSE 'PENDING'::"StorefrontAudienceStatus"
       END,
       'PUBLIC',
       CASE WHEN l."status" = 'REVOKED' THEN CURRENT_TIMESTAMP ELSE NULL END,
       CURRENT_TIMESTAMP
FROM "Storefront" s
JOIN "TenantLink" l ON l."supplierTenantId" = s."supplierTenantId"
WHERE l."status" IN ('LIST_CONNECTED', 'REVOKED');

UPDATE "StorefrontAudience" SET "decidedAt" = CURRENT_TIMESTAMP WHERE "status" = 'ACCEPTED';

-- Hasta que elijan, la tienda no se les muestra.
UPDATE "TenantLink" l SET "status" = 'REVOKED'
FROM "StorefrontAudience" a, "Storefront" s
WHERE a."status" = 'PENDING' AND a."storefrontId" = s."id"
  AND l."supplierTenantId" = s."supplierTenantId" AND l."clientTenantId" = a."buyerTenantId"
  AND l."status" = 'LIST_CONNECTED';
