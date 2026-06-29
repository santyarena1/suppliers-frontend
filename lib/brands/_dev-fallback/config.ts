/**
 * ═══════════════════════════════════════════════════════════════════
 * DEV FALLBACK — Datos hardcodeados para probar el módulo de Marcas
 * sin backend implementado.
 *
 * ELIMINAR CUANDO EL BACKEND ESTÉ LISTO:
 *   1. Borrar la carpeta lib/brands/_dev-fallback/
 *   2. En lib/brands/api.ts dejar solo las exportaciones de api.live.ts
 *   3. Quitar MockFallbackBanner de BrandModuleShell
 *   4. Deploy
 *
 * Desactivar temporalmente sin borrar:
 *   NEXT_PUBLIC_BRANDS_DISABLE_MOCK_FALLBACK=true
 * ═══════════════════════════════════════════════════════════════════
 */

export const MOCK_FALLBACK_ENABLED =
  process.env.NEXT_PUBLIC_BRANDS_DISABLE_MOCK_FALLBACK !== "true";

export const MOCK_SESSION_KEY = "tgs_brands_using_mock";
