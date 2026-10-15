-- Tope diario de búsquedas de fotos con Serper por tienda.
ALTER TABLE "Storefront"
  ADD COLUMN "imageSearchDay" TEXT,
  ADD COLUMN "imageSearchCount" INTEGER NOT NULL DEFAULT 0;
