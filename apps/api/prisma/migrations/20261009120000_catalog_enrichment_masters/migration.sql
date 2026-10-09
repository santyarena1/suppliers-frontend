-- Enriquecimiento del catálogo (docs/PLAN_ENRIQUECIMIENTO.md). Aditiva: solo tablas y tipos nuevos;
-- ni el buscador ni lo que leen los comercios usan estas tablas.

-- CreateEnum
CREATE TYPE "EnrichmentStatus" AS ENUM ('NEW', 'ENRICHING', 'ENRICHED', 'REVIEW', 'FAILED');

-- CreateEnum
CREATE TYPE "EnrichmentProposalStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'APPLIED');

-- CreateEnum
CREATE TYPE "EnrichmentRunStatus" AS ENUM ('RUNNING', 'DONE', 'CANCELLED', 'FAILED');

-- CreateTable
CREATE TABLE "CatalogMaster" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "matchKind" TEXT NOT NULL,
    "brand" TEXT,
    "brandKey" TEXT,
    "partNumber" TEXT,
    "ean" TEXT,
    "name" TEXT NOT NULL,
    "categoryRaw" TEXT,
    "categoryKey" TEXT,
    "status" "EnrichmentStatus" NOT NULL DEFAULT 'NEW',
    "doubtful" BOOLEAN NOT NULL DEFAULT false,
    "doubtReason" TEXT,
    "memberCount" INTEGER NOT NULL DEFAULT 0,
    "hasAiImage" BOOLEAN NOT NULL DEFAULT false,
    "missingDescription" BOOLEAN NOT NULL DEFAULT false,
    "bestConfidence" DOUBLE PRECISION,
    "enrichedAt" TIMESTAMP(3),
    "lockedManual" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CatalogMaster_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CatalogMasterMember" (
    "id" TEXT NOT NULL,
    "masterId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "manual" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CatalogMasterMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EnrichmentProposal" (
    "id" TEXT NOT NULL,
    "masterId" TEXT NOT NULL,
    "field" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "source" TEXT NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL,
    "evidence" JSONB,
    "status" "EnrichmentProposalStatus" NOT NULL DEFAULT 'PENDING',
    "runId" TEXT,
    "decidedById" TEXT,
    "decidedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EnrichmentProposal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EnrichmentSourceCache" (
    "id" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "status" INTEGER NOT NULL,
    "body" JSONB NOT NULL,
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EnrichmentSourceCache_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EnrichmentRun" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "filter" JSONB,
    "status" "EnrichmentRunStatus" NOT NULL DEFAULT 'RUNNING',
    "total" INTEGER NOT NULL DEFAULT 0,
    "processed" INTEGER NOT NULL DEFAULT 0,
    "failed" INTEGER NOT NULL DEFAULT 0,
    "proposals" INTEGER NOT NULL DEFAULT 0,
    "aiCalls" INTEGER NOT NULL DEFAULT 0,
    "estCostUsd" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "maxItems" INTEGER NOT NULL,
    "maxCostUsd" DOUBLE PRECISION NOT NULL,
    "cancelRequested" BOOLEAN NOT NULL DEFAULT false,
    "startedById" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "error" TEXT,
    "log" JSONB,

    CONSTRAINT "EnrichmentRun_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CatalogMaster_key_key" ON "CatalogMaster"("key");

-- CreateIndex
CREATE INDEX "CatalogMaster_status_idx" ON "CatalogMaster"("status");

-- CreateIndex
CREATE INDEX "CatalogMaster_categoryKey_idx" ON "CatalogMaster"("categoryKey");

-- CreateIndex
CREATE INDEX "CatalogMaster_brandKey_idx" ON "CatalogMaster"("brandKey");

-- CreateIndex
CREATE INDEX "CatalogMaster_doubtful_idx" ON "CatalogMaster"("doubtful");

-- CreateIndex
CREATE INDEX "CatalogMaster_memberCount_idx" ON "CatalogMaster"("memberCount");

-- CreateIndex
CREATE INDEX "CatalogMasterMember_masterId_idx" ON "CatalogMasterMember"("masterId");

-- CreateIndex
CREATE UNIQUE INDEX "CatalogMasterMember_provider_externalId_key" ON "CatalogMasterMember"("provider", "externalId");

-- CreateIndex
CREATE INDEX "EnrichmentProposal_status_idx" ON "EnrichmentProposal"("status");

-- CreateIndex
CREATE INDEX "EnrichmentProposal_field_status_idx" ON "EnrichmentProposal"("field", "status");

-- CreateIndex
CREATE UNIQUE INDEX "EnrichmentProposal_masterId_field_key" ON "EnrichmentProposal"("masterId", "field");

-- CreateIndex
CREATE UNIQUE INDEX "EnrichmentSourceCache_source_key_key" ON "EnrichmentSourceCache"("source", "key");

-- CreateIndex
CREATE INDEX "EnrichmentRun_startedAt_idx" ON "EnrichmentRun"("startedAt");

-- AddForeignKey
ALTER TABLE "CatalogMasterMember" ADD CONSTRAINT "CatalogMasterMember_masterId_fkey" FOREIGN KEY ("masterId") REFERENCES "CatalogMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EnrichmentProposal" ADD CONSTRAINT "EnrichmentProposal_masterId_fkey" FOREIGN KEY ("masterId") REFERENCES "CatalogMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

