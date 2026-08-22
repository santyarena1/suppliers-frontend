-- CreateTable
CREATE TABLE "ProviderOrder" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "invidOrderNumber" TEXT,
    "invidWebOrderNumber" TEXT,
    "paymentOption" TEXT NOT NULL,
    "paymentLabel" TEXT,
    "deliveryOption" TEXT,
    "deliveryLabel" TEXT,
    "notes" TEXT,
    "subtotal" DECIMAL(14,4),
    "impuestos" DECIMAL(14,4),
    "percepciones" DECIMAL(14,4),
    "total" DECIMAL(14,4),
    "errorMessage" TEXT,
    "items" JSONB NOT NULL,
    "addressSnapshot" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProviderOrder_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProviderOrder_userId_provider_createdAt_idx" ON "ProviderOrder"("userId", "provider", "createdAt");

-- AddForeignKey
ALTER TABLE "ProviderOrder" ADD CONSTRAINT "ProviderOrder_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
