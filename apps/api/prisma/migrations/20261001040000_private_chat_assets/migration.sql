-- AlterTable
ALTER TABLE "StoredAsset" ADD COLUMN     "isPrivate" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "ownerTenantId" TEXT;

-- Los archivos que ya se mandaron por el chat pasan a ser privados: desde ahora
-- solo se sirven con link firmado a quien ve la conversación.
UPDATE "StoredAsset" a
SET "isPrivate" = true
FROM "ChatMessage" m
WHERE m."kind" IN ('IMAGE', 'FILE')
  AND m."payload"->>'url' = '/assets/' || a."id";
