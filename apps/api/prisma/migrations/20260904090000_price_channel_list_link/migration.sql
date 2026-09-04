-- CreateEnum
CREATE TYPE "PriceChannel" AS ENUM ('API', 'LIST');

-- AlterEnum
ALTER TYPE "TenantLinkStatus" ADD VALUE 'LIST_CONNECTED';

-- AlterTable
ALTER TABLE "ProviderSyncConfig" ADD COLUMN     "manualIibbPercent" DECIMAL(6,2),
ADD COLUMN     "manualPerceptionsPercent" DECIMAL(6,2),
ADD COLUMN     "priceChannel" "PriceChannel" NOT NULL DEFAULT 'API';

