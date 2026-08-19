-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('ROLE_USER', 'ROLE_ADMIN', 'ROLE_BRAND');

-- CreateEnum
CREATE TYPE "AccessStatus" AS ENUM ('PENDING', 'INVITATION_SENT', 'ACCEPTED', 'ACTIVE', 'EXPIRED', 'REJECTED', 'REVOKED_BY_BRAND', 'BLOCKED_BY_ADMIN');

-- CreateEnum
CREATE TYPE "NewsType" AS ENUM ('INCOMING', 'LAUNCH', 'DISCONTINUED', 'WARRANTY_CHANGE', 'DISTRIBUTION_CHANGE', 'COMMERCIAL_NOTICE', 'PRE_SALE', 'DELAY', 'RECOMMENDED', 'IMPORTANT_ALERT');

-- CreateEnum
CREATE TYPE "PublicationStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "MaterialType" AS ENUM ('BANNER', 'IMAGE', 'DATASHEET', 'CATALOG', 'VIDEO', 'SOCIAL_TEXT', 'PROMOTION', 'PRESENTATION', 'COMPARISON', 'MANUAL', 'WARRANTY', 'COMMERCIAL');

-- CreateEnum
CREATE TYPE "TrainingType" AS ENUM ('VIDEO', 'LINK', 'PDF', 'COURSE', 'SALES_PITCH', 'MODEL_COMPARISON', 'TECH_DIFFERENTIAL', 'CERTIFICATION', 'SELLER_MATERIAL');

-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('BRAND_INVITATION', 'ACCESS_ACTIVATED', 'ACCESS_REVOKED', 'NEW_LAUNCH', 'NEW_INCOMING', 'FAVORITE_STATUS_CHANGE', 'FAVORITE_DISCONTINUED', 'NEW_CAMPAIGN', 'NEW_MATERIAL', 'NEW_TRAINING', 'BRAND_ALERT');

-- CreateEnum
CREATE TYPE "ImportStatus" AS ENUM ('PENDING', 'PREVIEW', 'PROCESSING', 'COMPLETED', 'FAILED', 'REVERTED');

-- CreateEnum
CREATE TYPE "StockStatus" AS ENUM ('HIGH_STOCK', 'MEDIUM_STOCK', 'LOW_STOCK', 'CRITICAL_STOCK', 'OUT_OF_STOCK', 'INCOMING', 'IN_TRANSIT', 'PRE_SALE', 'CONSULT', 'DISCONTINUED', 'SPOT_OFFER', 'RECOMMENDED', 'COMMERCIAL_PRIORITY', 'FEW_UNITS', 'DELAYED_ARRIVAL', 'REPLACEMENT_AVAILABLE');

-- CreateEnum
CREATE TYPE "CampaignStatus" AS ENUM ('DRAFT', 'ACTIVE', 'ENDED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "Visibility" AS ENUM ('ALL_AUTHORIZED', 'SPECIFIC_USERS');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" "UserRole" NOT NULL DEFAULT 'ROLE_USER',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "endDate" TIMESTAMP(3),
    "brandId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Credential" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "providerName" TEXT NOT NULL,
    "credentialsEncrypted" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Credential_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProviderSyncCache" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "price" TEXT NOT NULL,
    "imageUrl" TEXT NOT NULL,
    "locationAir" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProviderSyncCache_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CartItem" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "price" TEXT NOT NULL,
    "imageUrl" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CartItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BrandAccount" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "logoUrl" TEXT,
    "description" TEXT,
    "commercialData" TEXT,
    "contactEmail" TEXT,
    "contactPhone" TEXT,
    "website" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "suspended" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BrandAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Distributor" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT,
    "region" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Distributor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BrandDistributor" (
    "id" TEXT NOT NULL,
    "brandId" TEXT NOT NULL,
    "distributorId" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "visibleToUsers" BOOLEAN NOT NULL DEFAULT true,
    "commercialNotes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BrandDistributor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Category" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "parentId" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "Category_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BrandProduct" (
    "id" TEXT NOT NULL,
    "brandId" TEXT NOT NULL,
    "categoryId" TEXT,
    "subcategoryId" TEXT,
    "internalSku" TEXT,
    "brandSku" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "commercialName" TEXT NOT NULL,
    "eanUpc" TEXT,
    "shortDescription" TEXT,
    "technicalDescription" TEXT,
    "imageUrls" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "datasheetUrl" TEXT,
    "generalCommercialStatus" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "discontinued" BOOLEAN NOT NULL DEFAULT false,
    "isLaunch" BOOLEAN NOT NULL DEFAULT false,
    "recommended" BOOLEAN NOT NULL DEFAULT false,
    "featured" BOOLEAN NOT NULL DEFAULT false,
    "hasReplacement" BOOLEAN NOT NULL DEFAULT false,
    "replacementProductId" TEXT,
    "internalNotes" TEXT,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BrandProduct_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductAvailability" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "distributorId" TEXT NOT NULL,
    "status" "StockStatus" NOT NULL,
    "estimatedQuantity" INTEGER,
    "estimatedArrivalDate" TIMESTAMP(3),
    "notes" TEXT,
    "suggestedPrice" DECIMAL(12,2),
    "commercialAction" TEXT,
    "replacementSuggested" TEXT,
    "commercialPriority" INTEGER,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedBy" TEXT,

    CONSTRAINT "ProductAvailability_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AvailabilityHistoryEntry" (
    "id" TEXT NOT NULL,
    "availabilityId" TEXT NOT NULL,
    "previousStatus" "StockStatus",
    "newStatus" "StockStatus" NOT NULL,
    "changedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AvailabilityHistoryEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BrandAccess" (
    "id" TEXT NOT NULL,
    "brandId" TEXT NOT NULL,
    "userId" TEXT,
    "userEmail" TEXT NOT NULL,
    "status" "AccessStatus" NOT NULL DEFAULT 'PENDING',
    "invitedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "acceptedAt" TIMESTAMP(3),
    "lastActivityAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "userGroup" TEXT,
    "userTags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "blockedByAdmin" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "BrandAccess_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BrandNews" (
    "id" TEXT NOT NULL,
    "brandId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "type" "NewsType" NOT NULL,
    "relatedProductIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "relatedDistributorIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "publishedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "featuredImageUrl" TEXT,
    "attachmentUrls" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "visibility" "Visibility" NOT NULL DEFAULT 'ALL_AUTHORIZED',
    "visibleUserIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "status" "PublicationStatus" NOT NULL DEFAULT 'DRAFT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BrandNews_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BrandCampaign" (
    "id" TEXT NOT NULL,
    "brandId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "productIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "distributorIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "commercialConditions" TEXT,
    "attachmentUrls" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "visibleUserIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "status" "CampaignStatus" NOT NULL DEFAULT 'DRAFT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BrandCampaign_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BrandMaterial" (
    "id" TEXT NOT NULL,
    "brandId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "type" "MaterialType" NOT NULL,
    "fileUrl" TEXT NOT NULL,
    "productIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BrandMaterial_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BrandTraining" (
    "id" TEXT NOT NULL,
    "brandId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "type" "TrainingType" NOT NULL,
    "contentUrl" TEXT NOT NULL,
    "productIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BrandTraining_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BrandFavorite" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "brandId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BrandFavorite_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BrandNotification" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "brandId" TEXT,
    "type" "NotificationType" NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "read" BOOLEAN NOT NULL DEFAULT false,
    "relatedProductId" TEXT,
    "relatedEntityId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BrandNotification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ImportRecord" (
    "id" TEXT NOT NULL,
    "brandId" TEXT NOT NULL,
    "importedBy" TEXT NOT NULL,
    "originalFileName" TEXT NOT NULL,
    "storedFileUrl" TEXT,
    "importedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "rowsProcessed" INTEGER NOT NULL DEFAULT 0,
    "productsCreated" INTEGER NOT NULL DEFAULT 0,
    "productsUpdated" INTEGER NOT NULL DEFAULT 0,
    "errorCount" INTEGER NOT NULL DEFAULT 0,
    "status" "ImportStatus" NOT NULL DEFAULT 'PENDING',
    "canRevert" BOOLEAN NOT NULL DEFAULT false,
    "snapshot" JSONB,

    CONSTRAINT "ImportRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ImportRowError" (
    "id" TEXT NOT NULL,
    "importId" TEXT NOT NULL,
    "row" INTEGER NOT NULL,
    "column" TEXT,
    "message" TEXT NOT NULL,

    CONSTRAINT "ImportRowError_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLogEntry" (
    "id" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "performedById" TEXT NOT NULL,
    "brandId" TEXT,
    "changes" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLogEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_brandId_idx" ON "User"("brandId");

-- CreateIndex
CREATE UNIQUE INDEX "Credential_userId_providerName_key" ON "Credential"("userId", "providerName");

-- CreateIndex
CREATE INDEX "ProviderSyncCache_provider_name_idx" ON "ProviderSyncCache"("provider", "name");

-- CreateIndex
CREATE UNIQUE INDEX "ProviderSyncCache_provider_externalId_key" ON "ProviderSyncCache"("provider", "externalId");

-- CreateIndex
CREATE UNIQUE INDEX "CartItem_userId_provider_externalId_key" ON "CartItem"("userId", "provider", "externalId");

-- CreateIndex
CREATE UNIQUE INDEX "BrandAccount_slug_key" ON "BrandAccount"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "Distributor_code_key" ON "Distributor"("code");

-- CreateIndex
CREATE UNIQUE INDEX "BrandDistributor_brandId_distributorId_key" ON "BrandDistributor"("brandId", "distributorId");

-- CreateIndex
CREATE INDEX "BrandProduct_brandId_categoryId_idx" ON "BrandProduct"("brandId", "categoryId");

-- CreateIndex
CREATE UNIQUE INDEX "BrandProduct_brandId_brandSku_key" ON "BrandProduct"("brandId", "brandSku");

-- CreateIndex
CREATE UNIQUE INDEX "ProductAvailability_productId_distributorId_key" ON "ProductAvailability"("productId", "distributorId");

-- CreateIndex
CREATE UNIQUE INDEX "BrandAccess_brandId_userEmail_key" ON "BrandAccess"("brandId", "userEmail");

-- CreateIndex
CREATE UNIQUE INDEX "BrandFavorite_userId_productId_key" ON "BrandFavorite"("userId", "productId");

-- CreateIndex
CREATE INDEX "BrandNotification_userId_read_idx" ON "BrandNotification"("userId", "read");

-- CreateIndex
CREATE INDEX "AuditLogEntry_entityType_entityId_idx" ON "AuditLogEntry"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "AuditLogEntry_brandId_idx" ON "AuditLogEntry"("brandId");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "BrandAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Credential" ADD CONSTRAINT "Credential_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CartItem" ADD CONSTRAINT "CartItem_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BrandDistributor" ADD CONSTRAINT "BrandDistributor_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "BrandAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BrandDistributor" ADD CONSTRAINT "BrandDistributor_distributorId_fkey" FOREIGN KEY ("distributorId") REFERENCES "Distributor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Category" ADD CONSTRAINT "Category_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Category"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BrandProduct" ADD CONSTRAINT "BrandProduct_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "BrandAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BrandProduct" ADD CONSTRAINT "BrandProduct_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductAvailability" ADD CONSTRAINT "ProductAvailability_productId_fkey" FOREIGN KEY ("productId") REFERENCES "BrandProduct"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductAvailability" ADD CONSTRAINT "ProductAvailability_distributorId_fkey" FOREIGN KEY ("distributorId") REFERENCES "Distributor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AvailabilityHistoryEntry" ADD CONSTRAINT "AvailabilityHistoryEntry_availabilityId_fkey" FOREIGN KEY ("availabilityId") REFERENCES "ProductAvailability"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BrandAccess" ADD CONSTRAINT "BrandAccess_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "BrandAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BrandAccess" ADD CONSTRAINT "BrandAccess_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BrandNews" ADD CONSTRAINT "BrandNews_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "BrandAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BrandCampaign" ADD CONSTRAINT "BrandCampaign_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "BrandAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BrandMaterial" ADD CONSTRAINT "BrandMaterial_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "BrandAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BrandTraining" ADD CONSTRAINT "BrandTraining_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "BrandAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BrandFavorite" ADD CONSTRAINT "BrandFavorite_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BrandFavorite" ADD CONSTRAINT "BrandFavorite_productId_fkey" FOREIGN KEY ("productId") REFERENCES "BrandProduct"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BrandNotification" ADD CONSTRAINT "BrandNotification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BrandNotification" ADD CONSTRAINT "BrandNotification_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "BrandAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImportRecord" ADD CONSTRAINT "ImportRecord_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "BrandAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImportRowError" ADD CONSTRAINT "ImportRowError_importId_fkey" FOREIGN KEY ("importId") REFERENCES "ImportRecord"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLogEntry" ADD CONSTRAINT "AuditLogEntry_performedById_fkey" FOREIGN KEY ("performedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLogEntry" ADD CONSTRAINT "AuditLogEntry_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "BrandAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

