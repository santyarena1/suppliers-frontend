-- El chat es de persona a persona, no de organización a organización.

ALTER TABLE "ChatThread" ADD COLUMN "distroUserId" TEXT;
ALTER TABLE "ChatThread" ADD COLUMN "storeUserId" TEXT;

UPDATE "ChatThread" AS t
SET
  "distroUserId" = COALESCE(
    l."accountManagerId",
    (
      SELECT m."userId"
      FROM "TenantMembership" m
      WHERE m."tenantId" = l."supplierTenantId"
        AND m.active = true
        AND m.role IN ('OWNER', 'ADMIN', 'SELLER', 'PRODUCT_MANAGER')
      ORDER BY
        CASE m.role
          WHEN 'OWNER' THEN 0
          WHEN 'ADMIN' THEN 1
          WHEN 'SELLER' THEN 2
          ELSE 3
        END,
        m."createdAt"
      LIMIT 1
    )
  ),
  "storeUserId" = (
    SELECT m."userId"
    FROM "TenantMembership" m
    WHERE m."tenantId" = l."clientTenantId"
      AND m.active = true
      AND m.role IN ('OWNER', 'ADMIN', 'BUYER')
    ORDER BY
      CASE m.role
        WHEN 'OWNER' THEN 0
        WHEN 'ADMIN' THEN 1
        ELSE 2
      END,
      m."createdAt"
    LIMIT 1
  )
FROM "TenantLink" l
WHERE t."linkId" = l.id;

DELETE FROM "ChatThread" WHERE "distroUserId" IS NULL OR "storeUserId" IS NULL;

ALTER TABLE "ChatThread" ALTER COLUMN "distroUserId" SET NOT NULL;
ALTER TABLE "ChatThread" ALTER COLUMN "storeUserId" SET NOT NULL;

DROP INDEX IF EXISTS "ChatThread_linkId_key";

CREATE UNIQUE INDEX "ChatThread_linkId_distroUserId_storeUserId_key"
  ON "ChatThread"("linkId", "distroUserId", "storeUserId");
CREATE INDEX "ChatThread_distroUserId_idx" ON "ChatThread"("distroUserId");
CREATE INDEX "ChatThread_storeUserId_idx" ON "ChatThread"("storeUserId");
CREATE INDEX "ChatThread_linkId_idx" ON "ChatThread"("linkId");

ALTER TABLE "ChatThread"
  ADD CONSTRAINT "ChatThread_distroUserId_fkey"
  FOREIGN KEY ("distroUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ChatThread"
  ADD CONSTRAINT "ChatThread_storeUserId_fkey"
  FOREIGN KEY ("storeUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
