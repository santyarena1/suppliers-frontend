-- CreateTable
CREATE TABLE "InboxRequest" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "type" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'NEW',
    "title" TEXT NOT NULL,
    "message" TEXT,
    "contactName" TEXT,
    "contactEmail" TEXT,
    "contactPhone" TEXT,
    "company" TEXT,
    "tenantId" TEXT,
    "userId" TEXT,
    "data" JSONB,
    "note" TEXT,
    "handledAt" TIMESTAMP(3),
    "handledById" TEXT,
    "emailedAt" TIMESTAMP(3),

    CONSTRAINT "InboxRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "InboxRequest_status_createdAt_idx" ON "InboxRequest"("status", "createdAt");

-- CreateIndex
CREATE INDEX "InboxRequest_type_createdAt_idx" ON "InboxRequest"("type", "createdAt");

