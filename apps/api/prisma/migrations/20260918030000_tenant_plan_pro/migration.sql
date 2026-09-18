-- Renombrar el plan básico FREE → PRO
ALTER TYPE "TenantPlan" RENAME VALUE 'FREE' TO 'PRO';
ALTER TABLE "Tenant" ALTER COLUMN "plan" SET DEFAULT 'PRO';
