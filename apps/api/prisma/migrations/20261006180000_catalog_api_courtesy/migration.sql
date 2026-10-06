-- Módulo de API de catálogo activo sin cargo (cortesía de Administración).
ALTER TABLE "Subscription" ADD COLUMN "catalogApiAddonCourtesy" BOOLEAN NOT NULL DEFAULT false;
