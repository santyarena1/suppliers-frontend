-- Tope diario de fichas enriquecidas por usuario y registro de copias.
CREATE TABLE "PlatformContentAccess" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "day" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "copied" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlatformContentAccess_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PlatformContentAccess_userId_day_provider_externalId_key" ON "PlatformContentAccess"("userId", "day", "provider", "externalId");
CREATE INDEX "PlatformContentAccess_userId_day_idx" ON "PlatformContentAccess"("userId", "day");
