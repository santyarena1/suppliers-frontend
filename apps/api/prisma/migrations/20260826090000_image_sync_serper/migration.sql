-- CreateTable
CREATE TABLE "ImageSyncSettings" (
    "id" TEXT NOT NULL,
    "serperApiKeyEncrypted" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ImageSyncSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ImageSyncRun" (
    "id" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'RUNNING',
    "kind" TEXT NOT NULL DEFAULT 'first_photo',
    "provider" TEXT,
    "batchSize" INTEGER NOT NULL DEFAULT 50,
    "once" BOOLEAN NOT NULL DEFAULT false,
    "missingTotal" INTEGER NOT NULL DEFAULT 0,
    "processed" INTEGER NOT NULL DEFAULT 0,
    "updated" INTEGER NOT NULL DEFAULT 0,
    "skipped" INTEGER NOT NULL DEFAULT 0,
    "failed" INTEGER NOT NULL DEFAULT 0,
    "lastQuery" TEXT,
    "errorMessage" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "heartbeatAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedById" TEXT,

    CONSTRAINT "ImageSyncRun_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ImageSyncRun_startedAt_idx" ON "ImageSyncRun"("startedAt");

-- CreateIndex
CREATE INDEX "ProviderSyncCache_missing_image_idx" ON "ProviderSyncCache" ("provider") WHERE "imageUrl" IS NULL OR "imageUrl" = '';
