-- Módulo Noticias: blog B2B por red, hero pago y adjuntos.

ALTER TYPE "OrgNotificationKind" ADD VALUE 'NEWS';

CREATE TYPE "NewsKind" AS ENUM ('LAUNCH', 'INCOMING', 'PRICE_LIST', 'PROMO', 'CATALOG', 'NOTICE', 'OTHER');
CREATE TYPE "NewsStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');
CREATE TYPE "NewsAttachmentKind" AS ENUM ('PRICE_LIST', 'FILE', 'LINK', 'RESOURCE');
CREATE TYPE "NewsAttachmentVisibility" AS ENUM ('IN_APP', 'PUBLIC');

CREATE TABLE "NewsArticle" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "publicKey" TEXT NOT NULL,
  "status" "NewsStatus" NOT NULL DEFAULT 'DRAFT',
  "kind" "NewsKind" NOT NULL DEFAULT 'OTHER',
  "title" TEXT NOT NULL,
  "excerpt" TEXT NOT NULL DEFAULT '',
  "bodyHtml" TEXT NOT NULL DEFAULT '',
  "coverUrl" TEXT,
  "isPublic" BOOLEAN NOT NULL DEFAULT false,
  "notifyOnPublish" BOOLEAN NOT NULL DEFAULT false,
  "scopeBrandName" TEXT,
  "publishedAt" TIMESTAMP(3),
  "expiresAt" TIMESTAMP(3),
  "relatedSkus" JSONB NOT NULL DEFAULT '[]',
  "createdByUserId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "NewsArticle_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "NewsArticle_publicKey_key" ON "NewsArticle"("publicKey");
CREATE INDEX "NewsArticle_tenantId_status_publishedAt_idx" ON "NewsArticle"("tenantId", "status", "publishedAt");
CREATE INDEX "NewsArticle_status_publishedAt_idx" ON "NewsArticle"("status", "publishedAt");

ALTER TABLE "NewsArticle"
  ADD CONSTRAINT "NewsArticle_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "NewsArticle"
  ADD CONSTRAINT "NewsArticle_createdByUserId_fkey"
  FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "NewsAttachment" (
  "id" TEXT NOT NULL,
  "articleId" TEXT NOT NULL,
  "kind" "NewsAttachmentKind" NOT NULL,
  "title" TEXT NOT NULL,
  "fileUrl" TEXT,
  "contentUrl" TEXT,
  "resourceId" TEXT,
  "visibility" "NewsAttachmentVisibility" NOT NULL DEFAULT 'IN_APP',
  "sortOrder" INTEGER NOT NULL DEFAULT 0,

  CONSTRAINT "NewsAttachment_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "NewsAttachment_articleId_sortOrder_idx" ON "NewsAttachment"("articleId", "sortOrder");

ALTER TABLE "NewsAttachment"
  ADD CONSTRAINT "NewsAttachment_articleId_fkey"
  FOREIGN KEY ("articleId") REFERENCES "NewsArticle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "NewsImage" (
  "id" TEXT NOT NULL,
  "articleId" TEXT NOT NULL,
  "url" TEXT NOT NULL,
  "caption" TEXT,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,

  CONSTRAINT "NewsImage_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "NewsImage_articleId_sortOrder_idx" ON "NewsImage"("articleId", "sortOrder");

ALTER TABLE "NewsImage"
  ADD CONSTRAINT "NewsImage_articleId_fkey"
  FOREIGN KEY ("articleId") REFERENCES "NewsArticle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "NewsEvent" (
  "id" TEXT NOT NULL,
  "articleId" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "NewsEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "NewsEvent_articleId_kind_idx" ON "NewsEvent"("articleId", "kind");

ALTER TABLE "NewsEvent"
  ADD CONSTRAINT "NewsEvent_articleId_fkey"
  FOREIGN KEY ("articleId") REFERENCES "NewsArticle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AdCampaign" ADD COLUMN "articleId" TEXT;
CREATE INDEX "AdCampaign_articleId_idx" ON "AdCampaign"("articleId");
ALTER TABLE "AdCampaign"
  ADD CONSTRAINT "AdCampaign_articleId_fkey"
  FOREIGN KEY ("articleId") REFERENCES "NewsArticle"("id") ON DELETE SET NULL ON UPDATE CASCADE;
