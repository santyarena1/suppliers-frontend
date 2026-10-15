-- Vender en NODO: catálogo de la tienda desde Google Sheets. Solo aditiva.

-- AlterTable
ALTER TABLE "Storefront" ADD COLUMN     "sheetChangedAt" TIMESTAMP(3),
ADD COLUMN     "sheetCheckedAt" TIMESTAMP(3),
ADD COLUMN     "sheetError" TEXT,
ADD COLUMN     "sheetGid" TEXT,
ADD COLUMN     "sheetHash" TEXT,
ADD COLUMN     "sheetId" TEXT,
ADD COLUMN     "sheetImportId" TEXT,
ADD COLUMN     "sheetLinkedByUserId" TEXT;

