-- AlterTable
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "onboardingPreviewRestoreTenantId" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "onboardingPreviewRestoreRole" "TenantRole";
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "onboardingReplay" BOOLEAN NOT NULL DEFAULT false;
