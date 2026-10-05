/**
 * ¿Corre en un servidor (producción o un entorno de Railway)? No alcanza con
 * NODE_ENV: si en el servidor faltara, la API usaría el pepper de desarrollo o
 * dejaría mandar webhooks a localhost.
 */
export function isServerRuntime(): boolean {
  return (
    process.env.NODE_ENV === "production" ||
    Boolean(process.env.RAILWAY_ENVIRONMENT_NAME || process.env.RAILWAY_ENVIRONMENT || process.env.RAILWAY_PROJECT_ID)
  );
}
