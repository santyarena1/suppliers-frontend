-- Nombre de referencia de los presupuestos e índices para listar miles.
ALTER TABLE "SalesQuote" ADD COLUMN "title" TEXT;

CREATE INDEX "SalesQuote_tenantId_archivedAt_updatedAt_idx" ON "SalesQuote"("tenantId", "archivedAt", "updatedAt");
CREATE INDEX "SalesQuote_tenantId_archivedAt_status_idx" ON "SalesQuote"("tenantId", "archivedAt", "status");
