-- Presupuestos v2: estado, vencimiento, margen y descuento por presupuesto,
-- moneda, condiciones y plantilla del PDF por comercio. Solo agrega columnas.
CREATE TYPE "SalesQuoteStatus" AS ENUM ('DRAFT', 'SENT', 'ACCEPTED', 'REJECTED');

ALTER TABLE "SalesQuote"
  ADD COLUMN "clientEmail" TEXT,
  ADD COLUMN "status" "SalesQuoteStatus" NOT NULL DEFAULT 'DRAFT',
  ADD COLUMN "validUntil" TIMESTAMP(3),
  ADD COLUMN "marginPercent" DECIMAL(7,3),
  ADD COLUMN "discountPercent" DECIMAL(5,2),
  ADD COLUMN "currency" TEXT,
  ADD COLUMN "terms" TEXT,
  ADD COLUMN "sentAt" TIMESTAMP(3),
  ADD COLUMN "decidedAt" TIMESTAMP(3);

CREATE TABLE "QuoteSettings" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "theme" TEXT NOT NULL DEFAULT 'modern',
  "accentColor" TEXT NOT NULL DEFAULT '#4f46e5',
  "font" TEXT NOT NULL DEFAULT 'sans',
  "logoUrl" TEXT,
  "businessName" TEXT,
  "taxId" TEXT,
  "address" TEXT,
  "phone" TEXT,
  "email" TEXT,
  "website" TEXT,
  "intro" TEXT,
  "terms" TEXT,
  "footer" TEXT,
  "validityDays" INTEGER NOT NULL DEFAULT 7,
  "numberPrefix" TEXT NOT NULL DEFAULT 'P-',
  "showImages" BOOLEAN NOT NULL DEFAULT true,
  "showSku" BOOLEAN NOT NULL DEFAULT true,
  "showBrand" BOOLEAN NOT NULL DEFAULT true,
  "priceDisplay" TEXT NOT NULL DEFAULT 'FINAL',
  "maxSellerDiscount" DECIMAL(5,2),
  "updatedById" TEXT,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "QuoteSettings_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "QuoteSettings_tenantId_key" ON "QuoteSettings"("tenantId");

ALTER TABLE "QuoteSettings" ADD CONSTRAINT "QuoteSettings_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
