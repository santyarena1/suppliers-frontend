-- CreateEnum
CREATE TYPE "TenantPlan" AS ENUM ('FREE', 'LOCAL', 'CADENA');

-- AlterTable
ALTER TABLE "User" ADD COLUMN "onboardingCompletedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Tenant" ADD COLUMN "plan" "TenantPlan" NOT NULL DEFAULT 'FREE';
ALTER TABLE "Tenant" ADD COLUMN "demoSeededAt" TIMESTAMP(3);

-- Quienes ya operaban antes del recorrido self-serve no vuelven a ver el wizard.
UPDATE "User" SET "onboardingCompletedAt" = CURRENT_TIMESTAMP WHERE "onboardingCompletedAt" IS NULL;
