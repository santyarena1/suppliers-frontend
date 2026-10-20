-- Vender en NODO: elegir qué pestaña de Google Sheets se lee y qué hoja de un Excel subido. Solo aditiva.

-- AlterTable
ALTER TABLE "Storefront" ADD COLUMN     "sheetTab" TEXT,
ADD COLUMN     "sheetTabs" JSONB;

-- AlterTable
ALTER TABLE "SupplierListImport" ADD COLUMN     "sheetIndex" INTEGER;
