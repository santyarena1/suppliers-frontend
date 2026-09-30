-- Planes comerciales de comercios (BASE / PRO / CUSTOM) y suscripciones.
-- Estrategia (docs/PLAN_SUSCRIPCIONES.md → Migración):
--   * Nadie pierde funciones: todo comercio existente queda en PRO, también los
--     que estaban en LOCAL o CADENA (hoy ningún plan restringía nada).
--   * Cada comercio existente recibe una suscripción PRO en COURTESY sin
--     vencimiento: no entra en vencimientos ni suspensiones automáticas hasta que
--     Administración le cargue su suscripción real.
--   * El plan anterior queda registrado en el historial (evento MIGRATED).
--   * Distribuidores y marcas no reciben suscripción: siguen sin plan comercial.

-- CreateEnum
CREATE TYPE "SubscriptionStatus" AS ENUM ('TRIAL', 'ACTIVE', 'PAST_DUE', 'GRACE_PERIOD', 'SUSPENDED', 'COURTESY', 'CANCELLED');

-- CreateEnum
CREATE TYPE "SetupFeeStatus" AS ENUM ('NOT_APPLICABLE', 'PENDING', 'PAID', 'WAIVED');

-- CreateEnum
CREATE TYPE "SubscriptionPaymentKind" AS ENUM ('SUBSCRIPTION', 'SETUP_FEE');

-- CreateEnum
CREATE TYPE "SubscriptionPaymentStatus" AS ENUM ('PENDING', 'PAID', 'FAILED', 'REFUNDED', 'VOIDED');

-- CreateEnum
CREATE TYPE "SubscriptionPaymentProvider" AS ENUM ('MANUAL', 'TRANSFER', 'COURTESY', 'MERCADOPAGO', 'STRIPE', 'OTHER');

-- CreateTable
CREATE TABLE "Subscription" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "status" "SubscriptionStatus" NOT NULL DEFAULT 'ACTIVE',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "currentPeriodStart" TIMESTAMP(3),
    "currentPeriodEnd" TIMESTAMP(3),
    "nextBillingAt" TIMESTAMP(3),
    "gracePeriodEnd" TIMESTAMP(3),
    "trialEndsAt" TIMESTAMP(3),
    "suspendedAt" TIMESTAMP(3),
    "suspensionReason" TEXT,
    "cancelledAt" TIMESTAMP(3),
    "cancellationReason" TEXT,
    "courtesyUntil" TIMESTAMP(3),
    "courtesyReason" TEXT,
    "priceOverride" DECIMAL(10,2),
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "setupFee" DECIMAL(10,2),
    "setupFeeStatus" "SetupFeeStatus" NOT NULL DEFAULT 'NOT_APPLICABLE',
    "setupFeePaidAt" TIMESTAMP(3),
    "setupFeeBlocksCustom" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Subscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SubscriptionEvent" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "subscriptionId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "fromStatus" "SubscriptionStatus",
    "toStatus" "SubscriptionStatus",
    "fromPlan" TEXT,
    "toPlan" TEXT,
    "actorUserId" TEXT,
    "data" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SubscriptionEvent_pkey" PRIMARY KEY ("id")
);

-- Suscripción de cada comercio existente, antes de tocar el enum para poder leer el plan viejo.
INSERT INTO "Subscription" ("id", "tenantId", "status", "startedAt", "courtesyReason", "createdAt", "updatedAt")
SELECT
    gen_random_uuid()::text,
    t."id",
    'COURTESY',
    t."createdAt",
    'Comercio existente antes de los planes comerciales: queda en Pro sin vencimiento hasta que Administración defina su suscripción.',
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
FROM "Tenant" t
WHERE t."type" = 'RETAILER';

INSERT INTO "SubscriptionEvent" ("id", "tenantId", "subscriptionId", "type", "toStatus", "fromPlan", "toPlan", "data", "createdAt")
SELECT
    gen_random_uuid()::text,
    t."id",
    s."id",
    'MIGRATED',
    'COURTESY',
    t."plan"::text,
    'PRO',
    jsonb_build_object('legacyPlan', t."plan"::text, 'reason', 'Planes comerciales BASE/PRO/CUSTOM: los comercios existentes conservan todas sus funciones.'),
    CURRENT_TIMESTAMP
FROM "Tenant" t
JOIN "Subscription" s ON s."tenantId" = t."id"
WHERE t."type" = 'RETAILER';

-- TenantPlan: PRO / LOCAL / CADENA → BASE / PRO / CUSTOM. Todo lo existente queda en PRO.
CREATE TYPE "TenantPlan_new" AS ENUM ('BASE', 'PRO', 'CUSTOM');
ALTER TABLE "Tenant" ALTER COLUMN "plan" DROP DEFAULT;
ALTER TABLE "Tenant" ALTER COLUMN "plan" TYPE "TenantPlan_new" USING ('PRO'::"TenantPlan_new");
ALTER TYPE "TenantPlan" RENAME TO "TenantPlan_old";
ALTER TYPE "TenantPlan_new" RENAME TO "TenantPlan";
DROP TYPE "TenantPlan_old";
ALTER TABLE "Tenant" ALTER COLUMN "plan" SET DEFAULT 'PRO';

-- El historial guarda el plan viejo en data.legacyPlan; las columnas pasan al enum nuevo.
UPDATE "SubscriptionEvent" SET "fromPlan" = 'PRO' WHERE "fromPlan" NOT IN ('BASE', 'PRO', 'CUSTOM');
ALTER TABLE "SubscriptionEvent" ALTER COLUMN "fromPlan" TYPE "TenantPlan" USING ("fromPlan"::"TenantPlan");
ALTER TABLE "SubscriptionEvent" ALTER COLUMN "toPlan" TYPE "TenantPlan" USING ("toPlan"::"TenantPlan");

-- AlterTable
ALTER TABLE "ProviderSyncConfig" ADD COLUMN     "includeInSearch" BOOLEAN,
ADD COLUMN     "includeInSearchAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "SubscriptionPayment" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "subscriptionId" TEXT NOT NULL,
    "kind" "SubscriptionPaymentKind" NOT NULL DEFAULT 'SUBSCRIPTION',
    "plan" "TenantPlan",
    "amount" DECIMAL(10,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "status" "SubscriptionPaymentStatus" NOT NULL DEFAULT 'PAID',
    "provider" "SubscriptionPaymentProvider" NOT NULL DEFAULT 'MANUAL',
    "externalReference" TEXT,
    "paidAt" TIMESTAMP(3),
    "periodStart" TIMESTAMP(3),
    "periodEnd" TIMESTAMP(3),
    "notes" TEXT,
    "recordedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SubscriptionPayment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SubscriptionReminder" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "subscriptionId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "anchorAt" TIMESTAMP(3) NOT NULL,
    "channel" TEXT NOT NULL DEFAULT 'IN_APP',
    "status" TEXT NOT NULL DEFAULT 'SENT',
    "sentAt" TIMESTAMP(3),
    "notificationId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SubscriptionReminder_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Subscription_tenantId_key" ON "Subscription"("tenantId");

-- CreateIndex
CREATE INDEX "Subscription_status_idx" ON "Subscription"("status");

-- CreateIndex
CREATE INDEX "Subscription_currentPeriodEnd_idx" ON "Subscription"("currentPeriodEnd");

-- CreateIndex
CREATE INDEX "SubscriptionPayment_tenantId_createdAt_idx" ON "SubscriptionPayment"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "SubscriptionPayment_subscriptionId_createdAt_idx" ON "SubscriptionPayment"("subscriptionId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "SubscriptionPayment_provider_externalReference_key" ON "SubscriptionPayment"("provider", "externalReference");

-- CreateIndex
CREATE INDEX "SubscriptionEvent_subscriptionId_createdAt_idx" ON "SubscriptionEvent"("subscriptionId", "createdAt");

-- CreateIndex
CREATE INDEX "SubscriptionEvent_tenantId_createdAt_idx" ON "SubscriptionEvent"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "SubscriptionReminder_tenantId_createdAt_idx" ON "SubscriptionReminder"("tenantId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "SubscriptionReminder_subscriptionId_kind_anchorAt_channel_key" ON "SubscriptionReminder"("subscriptionId", "kind", "anchorAt", "channel");

-- AddForeignKey
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubscriptionPayment" ADD CONSTRAINT "SubscriptionPayment_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "Subscription"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubscriptionEvent" ADD CONSTRAINT "SubscriptionEvent_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "Subscription"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubscriptionReminder" ADD CONSTRAINT "SubscriptionReminder_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "Subscription"("id") ON DELETE CASCADE ON UPDATE CASCADE;
