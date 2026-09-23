import { isPostgresStarting } from "./postgres-starting";

/** Lo que ve el usuario mientras Postgres rechaza conexiones. */
export const DB_RESTARTING_MESSAGE =
  "La base de datos está reiniciando. Probá de nuevo en un momento.";

export interface RecoveryHttpBody {
  status: number;
  body: { success: boolean; message?: string; data?: { status: string; db: string } } | null;
}

/**
 * Railway marca el deploy como fallido si `/health` no responde 200 en 90s
 * (`railway.json`). Esta respuesta deja el puerto abierto mientras las
 * migraciones esperan a Postgres: el health pasa, el resto avisa.
 */
export function recoveryHttpResponse(method: string | undefined, url: string | undefined): RecoveryHttpBody {
  if ((method ?? "GET").toUpperCase() === "OPTIONS") {
    return { status: 204, body: null };
  }
  const path = (url ?? "/").split("?")[0];
  if (path === "/health" || path === "/health/") {
    return { status: 200, body: { success: true, data: { status: "ok", db: "waiting" } } };
  }
  return { status: 503, body: { success: false, message: DB_RESTARTING_MESSAGE } };
}

/** 503 con el mensaje de arriba cuando el error es de conexión, no de negocio. */
export function dbOutageStatus(text: string): { status: number; message: string } | null {
  if (!isPostgresStarting(text)) return null;
  return { status: 503, message: DB_RESTARTING_MESSAGE };
}
