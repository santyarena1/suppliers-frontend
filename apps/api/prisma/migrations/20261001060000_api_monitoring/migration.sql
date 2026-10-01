-- CreateTable
CREATE TABLE "ApiMetric" (
    "hourStart" TIMESTAMP(3) NOT NULL,
    "method" TEXT NOT NULL,
    "route" TEXT NOT NULL,
    "status" INTEGER NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,
    "totalMs" INTEGER NOT NULL DEFAULT 0,
    "maxMs" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ApiMetric_pkey" PRIMARY KEY ("hourStart","method","route","status")
);

-- CreateTable
CREATE TABLE "ApiErrorEvent" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "method" TEXT NOT NULL,
    "route" TEXT NOT NULL,
    "status" INTEGER NOT NULL,
    "message" TEXT NOT NULL,
    "userId" TEXT,
    "tenantId" TEXT,

    CONSTRAINT "ApiErrorEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ApiMetric_hourStart_idx" ON "ApiMetric"("hourStart");

-- CreateIndex
CREATE INDEX "ApiErrorEvent_createdAt_idx" ON "ApiErrorEvent"("createdAt");

