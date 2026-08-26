-- CreateTable
CREATE TABLE "CatalogEnrichmentSettings" (
    "id" TEXT NOT NULL,
    "openAiApiKeyEncrypted" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CatalogEnrichmentSettings_pkey" PRIMARY KEY ("id")
);
