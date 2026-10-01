/**
 * Resumen del tráfico del API a partir de las métricas por hora: totales,
 * errores, línea de tiempo y las rutas que más fallan o más tardan.
 */

export interface MetricInput {
  hourStart: Date;
  method: string;
  route: string;
  status: number;
  count: number;
  totalMs: number;
  maxMs: number;
}

export interface RouteStat {
  route: string;
  requests: number;
  clientErrors: number;
  serverErrors: number;
  rateLimited: number;
  avgMs: number;
  maxMs: number;
}

export interface TrafficSummary {
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
}

/** 401 y 404 son parte del uso normal (sesión vencida, link viejo): no cuentan como falla del sistema. */
const NORMAL_CLIENT_STATUS = new Set([401, 404]);

export function summarizeTraffic(rows: MetricInput[], since: Date, hours: number): TrafficSummary {
  let requests = 0, ok = 0, clientErrors = 0, serverErrors = 0, rateLimited = 0, unauthorized = 0, failedLogins = 0, totalMs = 0;
  const byHour = new Map<string, { requests: number; clientErrors: number; serverErrors: number }>();
  const byRoute = new Map<string, RouteStat & { totalMs: number }>();

  for (const r of rows) {
    if (r.method === "OPTIONS") continue;
    requests += r.count;
    totalMs += r.totalMs;
    const hour = r.hourStart.toISOString();
    const h = byHour.get(hour) ?? { requests: 0, clientErrors: 0, serverErrors: 0 };
    h.requests += r.count;
    const key = `${r.method} ${r.route}`;
    const s = byRoute.get(key) ?? { route: key, requests: 0, clientErrors: 0, serverErrors: 0, rateLimited: 0, avgMs: 0, maxMs: 0, totalMs: 0 };
    s.requests += r.count;
    s.totalMs += r.totalMs;
    s.maxMs = Math.max(s.maxMs, r.maxMs);

    if (r.status >= 500) {
      serverErrors += r.count;
      h.serverErrors += r.count;
      s.serverErrors += r.count;
    } else if (r.status >= 400) {
      if (r.status === 429) {
        rateLimited += r.count;
        s.rateLimited += r.count;
      }
      if (r.status === 401) unauthorized += r.count;
      if (r.status === 401 && r.route === "/auth/login") failedLogins += r.count;
      if (!NORMAL_CLIENT_STATUS.has(r.status)) {
        clientErrors += r.count;
        h.clientErrors += r.count;
        s.clientErrors += r.count;
      }
    } else {
      ok += r.count;
    }
    byHour.set(hour, h);
    byRoute.set(key, s);
  }

  const timeline: TrafficSummary["timeline"] = [];
  const start = new Date(since);
  start.setUTCMinutes(0, 0, 0);
  for (let i = 0; i <= hours; i++) {
    const hour = new Date(start.getTime() + i * 3_600_000).toISOString();
    timeline.push({ hour, ...(byHour.get(hour) ?? { requests: 0, clientErrors: 0, serverErrors: 0 }) });
  }

  const routes = [...byRoute.values()].map(({ totalMs: t, ...s }) => ({ ...s, avgMs: s.requests ? Math.round(t / s.requests) : 0 }));
  return {
    requests,
    ok,
    clientErrors,
    serverErrors,
    rateLimited,
    unauthorized,
    failedLogins,
    serverErrorRate: requests ? serverErrors / requests : 0,
    avgMs: requests ? Math.round(totalMs / requests) : 0,
    timeline,
    topErrorRoutes: routes
      .filter((r) => r.serverErrors + r.clientErrors > 0)
      .sort((a, b) => b.serverErrors - a.serverErrors || b.clientErrors - a.clientErrors)
      .slice(0, 12),
    slowestRoutes: routes.filter((r) => r.requests >= 5).sort((a, b) => b.avgMs - a.avgMs).slice(0, 8),
  };
}
