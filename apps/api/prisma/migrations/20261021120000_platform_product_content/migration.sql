-- Contenido enriquecido de plataforma (AcuStock): fotos, descripción y especificaciones por ficha.
CREATE TABLE "PlatformProductContent" (
    "id" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "brand" TEXT,
    "ean" TEXT,
    "partNumber" TEXT,
    "category" TEXT[],
    "shortDescription" TEXT,
    "descriptionHtml" TEXT,
    "specs" JSONB NOT NULL DEFAULT '[]',
    "images" JSONB NOT NULL DEFAULT '[]',
    "warrantyMonths" INTEGER,
    "sourceUpdatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlatformProductContent_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PlatformProductContentLink" (
    "id" TEXT NOT NULL,
    "contentId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "matchedBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlatformProductContentLink_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PlatformContentImportRun" (
    "id" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "mode" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'RUNNING',
    "stats" JSONB,
    "errorMessage" TEXT,
    "startedById" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "heartbeatAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "PlatformContentImportRun_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PlatformProductContent_source_sourceId_key" ON "PlatformProductContent"("source", "sourceId");
CREATE UNIQUE INDEX "PlatformProductContentLink_provider_externalId_key" ON "PlatformProductContentLink"("provider", "externalId");
CREATE INDEX "PlatformProductContentLink_contentId_idx" ON "PlatformProductContentLink"("contentId");
CREATE INDEX "PlatformContentImportRun_startedAt_idx" ON "PlatformContentImportRun"("startedAt");

ALTER TABLE "PlatformProductContentLink" ADD CONSTRAINT "PlatformProductContentLink_contentId_fkey" FOREIGN KEY ("contentId") REFERENCES "PlatformProductContent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Una sola corrida en curso por fuente, aunque haya varias réplicas.
CREATE UNIQUE INDEX "PlatformContentImportRun_one_running_per_source" ON "PlatformContentImportRun"("source") WHERE "status" = 'RUNNING';
