-- Chat comercial: un hilo por TenantLink. La historia es de la organización.

CREATE TYPE "ChatMessageKind" AS ENUM ('TEXT', 'IMAGE', 'FILE', 'ORDER', 'PRODUCT', 'SYSTEM');

CREATE TABLE "ChatThread" (
  "id" TEXT NOT NULL,
  "linkId" TEXT NOT NULL,
  "lastMessageAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "ChatThread_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ChatThread_linkId_key" ON "ChatThread"("linkId");

ALTER TABLE "ChatThread"
  ADD CONSTRAINT "ChatThread_linkId_fkey"
  FOREIGN KEY ("linkId") REFERENCES "TenantLink"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "ChatMessage" (
  "id" TEXT NOT NULL,
  "threadId" TEXT NOT NULL,
  "authorUserId" TEXT,
  "kind" "ChatMessageKind" NOT NULL DEFAULT 'TEXT',
  "body" TEXT NOT NULL DEFAULT '',
  "payload" JSONB,
  "replyToId" TEXT,
  "editedAt" TIMESTAMP(3),
  "deletedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "ChatMessage_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ChatMessage_threadId_createdAt_idx" ON "ChatMessage"("threadId", "createdAt");
CREATE INDEX "ChatMessage_authorUserId_idx" ON "ChatMessage"("authorUserId");

ALTER TABLE "ChatMessage"
  ADD CONSTRAINT "ChatMessage_threadId_fkey"
  FOREIGN KEY ("threadId") REFERENCES "ChatThread"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ChatMessage"
  ADD CONSTRAINT "ChatMessage_authorUserId_fkey"
  FOREIGN KEY ("authorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ChatMessage"
  ADD CONSTRAINT "ChatMessage_replyToId_fkey"
  FOREIGN KEY ("replyToId") REFERENCES "ChatMessage"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "ChatRead" (
  "threadId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "lastReadAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "ChatRead_pkey" PRIMARY KEY ("threadId", "userId")
);

ALTER TABLE "ChatRead"
  ADD CONSTRAINT "ChatRead_threadId_fkey"
  FOREIGN KEY ("threadId") REFERENCES "ChatThread"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ChatRead"
  ADD CONSTRAINT "ChatRead_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "ChatPin" (
  "threadId" TEXT NOT NULL,
  "messageId" TEXT NOT NULL,
  "pinnedById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "ChatPin_pkey" PRIMARY KEY ("threadId", "messageId")
);

ALTER TABLE "ChatPin"
  ADD CONSTRAINT "ChatPin_threadId_fkey"
  FOREIGN KEY ("threadId") REFERENCES "ChatThread"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ChatPin"
  ADD CONSTRAINT "ChatPin_messageId_fkey"
  FOREIGN KEY ("messageId") REFERENCES "ChatMessage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ChatPin"
  ADD CONSTRAINT "ChatPin_pinnedById_fkey"
  FOREIGN KEY ("pinnedById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "ChatReaction" (
  "messageId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "emoji" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "ChatReaction_pkey" PRIMARY KEY ("messageId", "userId")
);

CREATE INDEX "ChatReaction_messageId_idx" ON "ChatReaction"("messageId");

ALTER TABLE "ChatReaction"
  ADD CONSTRAINT "ChatReaction_messageId_fkey"
  FOREIGN KEY ("messageId") REFERENCES "ChatMessage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ChatReaction"
  ADD CONSTRAINT "ChatReaction_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
