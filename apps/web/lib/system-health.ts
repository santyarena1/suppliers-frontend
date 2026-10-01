import api from "@/lib/api";

/** Respuesta de GET /admin/health/overview ("Salud del sistema"). */

export type HealthLevel = "ok" | "warning" | "critical";

export interface RouteStat {
  route: string;
  requests: number;
  clientErrors: number;
  serverErrors: number;
  rateLimited: number;
  avgMs: number;
  maxMs: number;
}

export interface SystemHealth {
  generatedAt: string;
  hours: number;
  status: { level: HealthLevel; reasons: string[] };
  runtime: { uptimeSec: number; version: string | null; dbLatencyMs: number; memoryMb: number };
  traffic: {
    requests: number;
    ok: number;
    clientErrors: number;
    serverErrors: number;
    rateLimited: number;
    unauthorized: number;
    failedLogins: number;
    serverErrorRate: number;
    avgMs: number;
    timeline: { hour: string; requests: number; clientErrors: number; serverErrors: number }[];
    topErrorRoutes: RouteStat[];
    slowestRoutes: RouteStat[];
  };
  recentErrors: { id: string; createdAt: string; method: string; route: string; status: number; message: string; userId: string | null; tenantId: string | null }[];
  syncErrors: { org: string; provider: string; error: string | null; lastSyncedAt: string | null }[];
  jobs: {
    catalogSyncs: Record<string, number>;
    retail: { status: string; startedAt: string; finishedAt: string | null; storesDone: number; productsUpserted: number; error: string | null } | null;
    images: { status: string; startedAt: string; finishedAt: string | null } | null;
  };
  integrity: { key: string; label: string; hint: string; severity: HealthLevel; count: number; examples: string[] }[];
  security: {
    lockedAccounts: { username: string; loginLockedUntil: string }[];
    accountsWithFailedLogins: number;
    impersonations: { at: string; by: string; as: string }[];
    inactiveUsers: number;
    unverifiedUsers: number;
    activeAdmins: number;
  };
  config: { items: { key: string; label: string; ok: boolean; value?: string | null }[]; corsOrigins: string[] };
}

export const systemHealthApi = {
  overview: (hours: number) => api.get<SystemHealth>("/admin/health/overview", { params: { hours } }),
};
