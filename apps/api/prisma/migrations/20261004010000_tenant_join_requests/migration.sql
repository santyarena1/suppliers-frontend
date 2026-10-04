-- Pedidos para sumarse a un comercio (por mail del dueño).
-- CreateEnum
CREATE TYPE "JoinRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED');

-- CreateTable
CREATE TABLE "TenantJoinRequest" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT,
    "userId" TEXT NOT NULL,
    "ownerEmail" TEXT NOT NULL,
    "status" "JoinRequestStatus" NOT NULL DEFAULT 'PENDING',
    "role" "TenantRole",
    "decidedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decidedAt" TIMESTAMP(3),

    CONSTRAINT "TenantJoinRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TenantJoinRequest_tenantId_status_idx" ON "TenantJoinRequest"("tenantId", "status");

-- CreateIndex
CREATE INDEX "TenantJoinRequest_userId_idx" ON "TenantJoinRequest"("userId");

-- AddForeignKey
ALTER TABLE "TenantJoinRequest" ADD CONSTRAINT "TenantJoinRequest_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TenantJoinRequest" ADD CONSTRAINT "TenantJoinRequest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
