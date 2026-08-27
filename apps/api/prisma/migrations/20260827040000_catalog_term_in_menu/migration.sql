-- Menú de Nodo: subset de categorías (no hace falta unificarlas).
ALTER TABLE "PlatformCatalogTerm" ADD COLUMN "inMenu" BOOLEAN NOT NULL DEFAULT false;
CREATE INDEX "PlatformCatalogTerm_kind_inMenu_idx" ON "PlatformCatalogTerm"("kind", "inMenu");
