-- Presupuestos de venta (modo vendedor, docs/PLAN_MODO_VENDEDOR.md §8).
-- CreateTable
CREATE TABLE "SalesQuote" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "createdById" TEXT NOT NULL,
    "clientName" TEXT,
    "clientPhone" TEXT,
    "notes" TEXT,
    "items" JSONB NOT NULL DEFAULT '[]',
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SalesQuote_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SalesQuote_tenantId_createdById_archivedAt_idx" ON "SalesQuote"("tenantId", "createdById", "archivedAt");

-- CreateIndex
CREATE UNIQUE INDEX "SalesQuote_tenantId_number_key" ON "SalesQuote"("tenantId", "number");

-- AddForeignKey
ALTER TABLE "SalesQuote" ADD CONSTRAINT "SalesQuote_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

