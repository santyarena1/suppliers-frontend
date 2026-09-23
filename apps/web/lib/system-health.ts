/**
 * Estado de disponibilidad del backend.
 *
 * - `ok`: /health responde y no está en recovery de DB
 * - `updating`: health OK pero `db: "waiting"` (Postgres reiniciando / migrando)
 * - `down`: no hay respuesta de red o health falla
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

function parseHealthBody(body: unknown): { ok: boolean; waitingDb: boolean } {
  if (!body || typeof body !== "object") return { ok: false, waitingDb: false };
  const raw = body as HealthPayload;
  const data = raw.data && typeof raw.data === "object" ? raw.data : raw;
  const status = data.status;
  const db = data.db;
  const ok = status === "ok" || raw.success === true;
  return { ok: Boolean(ok), waitingDb: db === "waiting" };
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
    const { ok, waitingDb } = parseHealthBody(body);
    if (waitingDb) {
      return {
        kind: "updating",
        checkedAt: Date.now(),
        message: "La base de datos está reiniciando. Volvé en un momento.",
      };
    }
    if (!ok) {
      return {
        kind: "down",
        checkedAt: Date.now(),
        message: "El servidor respondió de forma inesperada.",
      };
    }
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

/** Mensaje de 503 de recovery de Postgres (apps/api recovery-gate). */
export const DB_RESTARTING_HINT = /base de datos está reiniciando|database.*restart/i;
