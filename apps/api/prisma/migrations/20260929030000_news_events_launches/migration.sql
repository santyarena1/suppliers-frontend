-- AlterTable
ALTER TABLE "NewsArticle" ADD COLUMN     "brandItemId" TEXT,
ADD COLUMN     "eventEndsAt" TIMESTAMP(3),
ADD COLUMN     "eventLocation" TEXT,
ADD COLUMN     "eventStartsAt" TIMESTAMP(3),
ADD COLUMN     "eventUrl" TEXT,
ADD COLUMN     "rsvpEnabled" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "NewsRsvp" (
    "id" TEXT NOT NULL,
    "articleId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NewsRsvp_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "NewsRsvp_articleId_idx" ON "NewsRsvp"("articleId");

-- CreateIndex
CREATE UNIQUE INDEX "NewsRsvp_articleId_userId_key" ON "NewsRsvp"("articleId", "userId");

-- AddForeignKey
ALTER TABLE "NewsArticle" ADD CONSTRAINT "NewsArticle_brandItemId_fkey" FOREIGN KEY ("brandItemId") REFERENCES "BrandItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NewsRsvp" ADD CONSTRAINT "NewsRsvp_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "NewsArticle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

