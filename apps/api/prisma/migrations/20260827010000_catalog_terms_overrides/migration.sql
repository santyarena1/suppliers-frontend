-- Canonical catalog terms (brand / category / subcategory) with visibility + hierarchy
CREATE TABLE "PlatformCatalogTerm" (
    "id" TEXT NOT NULL,
    "kind" "CatalogAliasKind" NOT NULL,
    "label" TEXT NOT NULL,
    "parentId" TEXT,
    "visible" BOOLEAN NOT NULL DEFAULT true,
    "source" "CatalogEnrichmentSource" NOT NULL DEFAULT 'MANUAL',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlatformCatalogTerm_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PlatformCatalogTerm_kind_label_key" ON "PlatformCatalogTerm"("kind", "label");
CREATE INDEX "PlatformCatalogTerm_kind_visible_idx" ON "PlatformCatalogTerm"("kind", "visible");
CREATE INDEX "PlatformCatalogTerm_parentId_idx" ON "PlatformCatalogTerm"("parentId");

ALTER TABLE "PlatformCatalogTerm"
  ADD CONSTRAINT "PlatformCatalogTerm_parentId_fkey"
  FOREIGN KEY ("parentId") REFERENCES "PlatformCatalogTerm"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- Link aliases to terms
ALTER TABLE "PlatformCatalogAlias" ADD COLUMN "termId" TEXT;
CREATE INDEX "PlatformCatalogAlias_termId_idx" ON "PlatformCatalogAlias"("termId");
ALTER TABLE "PlatformCatalogAlias"
  ADD CONSTRAINT "PlatformCatalogAlias_termId_fkey"
  FOREIGN KEY ("termId") REFERENCES "PlatformCatalogTerm"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- Backfill terms from existing alias groups (one term per groupId, prefer longest label)
INSERT INTO "PlatformCatalogTerm" ("id", "kind", "label", "visible", "source", "createdAt", "updatedAt")
SELECT
  g."groupId",
  g."kind",
  g."label",
  true,
  'MANUAL',
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM (
  SELECT DISTINCT ON ("groupId")
    "groupId",
    "kind",
    "label"
  FROM "PlatformCatalogAlias"
  ORDER BY "groupId", LENGTH("label") DESC, "label" ASC
) g
ON CONFLICT ("kind", "label") DO NOTHING;

-- Attach aliases to the term that matches their label+kind, else the backfilled groupId term
UPDATE "PlatformCatalogAlias" a
SET "termId" = t."id",
    "groupId" = t."id"
FROM "PlatformCatalogTerm" t
WHERE t."kind" = a."kind" AND t."label" = a."label";

UPDATE "PlatformCatalogAlias" a
SET "termId" = a."groupId",
    "groupId" = a."groupId"
WHERE a."termId" IS NULL
  AND EXISTS (SELECT 1 FROM "PlatformCatalogTerm" t WHERE t."id" = a."groupId");

-- Per-product overrides
CREATE TABLE "PlatformProductCatalogOverride" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "displayBrand" TEXT,
    "displayCategory" TEXT,
    "displaySubcategory" TEXT,
    "source" "CatalogEnrichmentSource" NOT NULL DEFAULT 'MANUAL',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlatformProductCatalogOverride_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PlatformProductCatalogOverride_provider_externalId_key"
  ON "PlatformProductCatalogOverride"("provider", "externalId");
CREATE INDEX "PlatformProductCatalogOverride_provider_idx"
  ON "PlatformProductCatalogOverride"("provider");
