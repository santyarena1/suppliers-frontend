-- Errores de cliente reportados al panel de Salud (superadmin).
CREATE TABLE "ClientErrorReport" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "stack" TEXT,
    "source" TEXT,
    "line" INTEGER,
    "column" INTEGER,
    "url" TEXT,
    "userAgent" TEXT,
    "userId" TEXT,
    "meta" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClientErrorReport_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ClientErrorReport_createdAt_idx" ON "ClientErrorReport"("createdAt");
CREATE INDEX "ClientErrorReport_kind_createdAt_idx" ON "ClientErrorReport"("kind", "createdAt");
