-- Grid descontructurado: slot opcional en banners
ALTER TABLE "HomeBanner" ADD COLUMN "slot" TEXT;

-- Identidad visual global (preset de color)
CREATE TABLE "PlatformSettings" (
    "id" TEXT NOT NULL DEFAULT 'platform',
    "brandPreset" TEXT NOT NULL DEFAULT 'violet',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlatformSettings_pkey" PRIMARY KEY ("id")
);

INSERT INTO "PlatformSettings" ("id", "brandPreset", "updatedAt")
VALUES ('platform', 'violet', CURRENT_TIMESTAMP)
ON CONFLICT ("id") DO NOTHING;
