-- Paso del recorrido guardado en el servidor: una sola fuente de verdad para
-- retomar donde quedó (antes vivía en el navegador y se desincronizaba).
ALTER TABLE "User" ADD COLUMN "onboardingStep" TEXT;
