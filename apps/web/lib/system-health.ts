/**
 * Estado de disponibilidad del backend.
 *
 * - `ok`: /health responde y `db` está ok (o ausente en builds viejos)
 * - `updating`: API vivo pero Postgres en `waiting` / `down`, o 503 de recovery
 * - `down`: no hay respuesta de red o health HTTP falla
 */

export type SystemHealthKind = "ok" | "updating" | "down";

export type SystemHealthSnapshot = {
  kind: SystemHealthKind;
  checkedAt: number;
  message?: string;
};

const API_BASE = (process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080").replace(/\/$/, "");

type Listener = (snap: SystemHealthSnapshot) => void;

let snapshot: SystemHealthSnapshot = { kind: "ok", checkedAt: 0 };
const listeners = new Set<Listener>();

export function getSystemHealth(): SystemHealthSnapshot {
  return snapshot;
}

export function subscribeSystemHealth(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function publish(next: SystemHealthSnapshot) {
  snapshot = next;
  listeners.forEach((fn) => fn(next));
}

export function reportSystemOk() {
  if (snapshot.kind === "ok") {
    snapshot = { kind: "ok", checkedAt: Date.now() };
    return;
  }
  publish({ kind: "ok", checkedAt: Date.now() });
}

export function reportSystemDown(message?: string) {
  const next: SystemHealthSnapshot = {
    kind: "down",
    checkedAt: Date.now(),
    message: message || "NODO no responde en este momento.",
  };
  if (snapshot.kind === "down" && snapshot.message === next.message) {
    snapshot = next;
    return;
  }
  publish(next);
}

export function reportSystemUpdating(message?: string) {
  const next: SystemHealthSnapshot = {
    kind: "updating",
    checkedAt: Date.now(),
    message: message || "Estamos actualizando el sistema.",
  };
  if (snapshot.kind === "updating" && snapshot.message === next.message) {
    snapshot = next;
    return;
  }
  publish(next);
}

type HealthPayload = {
  success?: boolean;
  data?: { status?: string; db?: string; uptime?: number };
  status?: string;
  db?: string;
};

export function parseHealthBody(body: unknown): {
  ok: boolean;
  db: "ok" | "waiting" | "down" | "unknown";
} {
  if (!body || typeof body !== "object") return { ok: false, db: "unknown" };
  const raw = body as HealthPayload;
  const data = raw.data && typeof raw.data === "object" ? raw.data : raw;
  const status = data.status;
  const dbRaw = data.db;
  const ok = status === "ok" || raw.success === true;
  const db =
    dbRaw === "ok" || dbRaw === "waiting" || dbRaw === "down" ? dbRaw : "unknown";
  return { ok: Boolean(ok), db };
}

/**
 * Una pasada contra GET /health. No usa Axios.
 * No publica sola: el caller decide cuándo reportar (umbral de fallos).
 */
export async function probeSystemHealth(signal?: AbortSignal): Promise<SystemHealthSnapshot> {
  try {
    const res = await fetch(`${API_BASE}/health`, {
      method: "GET",
      cache: "no-store",
      signal,
      headers: { Accept: "application/json" },
    });
    if (!res.ok) {
      return {
        kind: "down",
        checkedAt: Date.now(),
        message: "El servidor no está disponible por ahora.",
      };
    }
    let body: unknown = null;
    try {
      body = await res.json();
    } catch {
      body = null;
    }
    const { ok, db } = parseHealthBody(body);
    if (db === "waiting") {
      return {
        kind: "updating",
        checkedAt: Date.now(),
        message: "La base de datos está reiniciando. Volvé en un momento.",
      };
    }
    if (db === "down") {
      return {
        kind: "updating",
        checkedAt: Date.now(),
        message: "La base de datos no está disponible. Volvé en un momento.",
      };
    }
    if (!ok) {
      return {
        kind: "down",
        checkedAt: Date.now(),
        message: "El servidor respondió de forma inesperada.",
      };
    }
    // `db: "unknown"`: builds viejos del API sin campo db → tratamos como ok
    // si status es ok (el probe de red ya pasó).
    return { kind: "ok", checkedAt: Date.now() };
  } catch {
    if (signal?.aborted) return snapshot;
    return {
      kind: "down",
      checkedAt: Date.now(),
      message: "No se pudo contactar al servidor.",
    };
  }
}

/** 503 de recovery / outage de Postgres (apps/api recovery-gate). */
export const DB_OUTAGE_HINT =
  /base de datos está reiniciando|base de datos no está disponible|database.*(restart|unavailable)/i;
