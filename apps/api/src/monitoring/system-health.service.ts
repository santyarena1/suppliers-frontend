import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { runIntegrityChecks, type CheckSeverity } from "./integrity-checks";
import { RequestMetricsService } from "./request-metrics.service";
import { summarizeTraffic, type TrafficSummary } from "./traffic-summary";

const MAX_HOURS = 24 * 30;

/**
 * Todo lo que el superadmin necesita para saber si NODO anda bien: tráfico y
 * errores del API, sincronizaciones con proveedores, tareas programadas,
 * integridad de los datos, seguridad y configuración de producción.
 */
@Injectable()
export class SystemHealthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly metrics: RequestMetricsService
  ) {}

  async overview(hoursRaw?: string) {
    const hours = Math.min(MAX_HOURS, Math.max(1, Math.round(Number(hoursRaw) || 24)));
    const since = new Date(Date.now() - hours * 3_600_000);
    // Lo que está en memoria también cuenta: así el panel muestra el último minuto.
    await this.metrics.flush();

    const dbStart = Date.now();
    await this.prisma.$queryRaw`select 1`;
    const dbLatencyMs = Date.now() - dbStart;

    const [metricRows, recentErrors, syncErrors, syncRuns, retailRun, imageRun, integrity, security] = await Promise.all([
      this.prisma.apiMetric.findMany({ where: { hourStart: { gte: since } } }),
      this.prisma.apiErrorEvent.findMany({ where: { createdAt: { gte: since } }, orderBy: { createdAt: "desc" }, take: 30 }),
      this.prisma.providerSyncConfig.findMany({
        where: { enabled: true, lastSyncError: { not: null } },
        select: { provider: true, lastSyncError: true, lastSyncedAt: true, tenant: { select: { name: true } } },
        orderBy: { updatedAt: "desc" },
        take: 30,
      }),
      this.prisma.catalogSyncRun.groupBy({ by: ["status"], where: { startedAt: { gte: since } }, _count: { _all: true } }),
      this.prisma.retailIngestRun.findFirst({ orderBy: { startedAt: "desc" } }),
      this.prisma.imageSyncRun.findFirst({ orderBy: { startedAt: "desc" } }),
      runIntegrityChecks(this.prisma),
      this.security(since),
    ]);

    const traffic = summarizeTraffic(metricRows, since, hours);
    const jobs = {
      catalogSyncs: Object.fromEntries(syncRuns.map((r) => [r.status, r._count._all])),
      retail: retailRun && {
        status: retailRun.status,
        startedAt: retailRun.startedAt,
        finishedAt: retailRun.finishedAt,
        storesDone: retailRun.storesDone,
        productsUpserted: retailRun.productsUpserted,
        error: retailRun.errorMessage,
      },
      images: imageRun && { status: imageRun.status, startedAt: imageRun.startedAt, finishedAt: imageRun.finishedAt },
    };
    const config = this.config();
    const status = overallStatus({ traffic, integrity, syncErrorCount: syncErrors.length, config, security });

    return {
      generatedAt: new Date(),
      hours,
      status,
      runtime: {
        uptimeSec: Math.round(process.uptime()),
        version: (process.env.RAILWAY_GIT_COMMIT_SHA || "").slice(0, 7) || null,
        dbLatencyMs,
        memoryMb: Math.round(process.memoryUsage().rss / 1_048_576),
      },
      traffic,
      recentErrors,
      syncErrors: syncErrors.map((s) => ({
        org: s.tenant.name,
        provider: s.provider,
        error: s.lastSyncError,
        lastSyncedAt: s.lastSyncedAt,
      })),
      jobs,
      integrity,
      security,
      config,
    };
  }

  private async security(since: Date) {
    const now = new Date();
    const [locked, struggling, impersonations, inactive, unverified, admins] = await Promise.all([
      this.prisma.user.findMany({ where: { loginLockedUntil: { gt: now } }, select: { username: true, loginLockedUntil: true } }),
      this.prisma.user.count({ where: { failedLoginCount: { gte: 3 } } }),
      this.prisma.auditLogEntry.findMany({
        where: { action: "IMPERSONATE", createdAt: { gte: since } },
        select: { createdAt: true, entityId: true, performedBy: { select: { username: true } } },
        orderBy: { createdAt: "desc" },
        take: 20,
      }),
      this.prisma.user.count({ where: { active: false } }),
      this.prisma.user.count({ where: { active: true, emailVerifiedAt: null } }),
      this.prisma.user.count({ where: { active: true, role: "ROLE_ADMIN" } }),
    ]);
    const targets = await this.prisma.user.findMany({
      where: { id: { in: impersonations.map((i) => i.entityId) } },
      select: { id: true, username: true },
    });
    const nameOf = new Map(targets.map((t) => [t.id, t.username]));
    return {
      lockedAccounts: locked,
      accountsWithFailedLogins: struggling,
      impersonations: impersonations.map((i) => ({
        at: i.createdAt,
        by: i.performedBy.username,
        as: nameOf.get(i.entityId) ?? i.entityId,
      })),
      inactiveUsers: inactive,
      unverifiedUsers: unverified,
      activeAdmins: admins,
    };
  }

  /** Qué está configurado en producción. Solo si está o no, nunca el valor. */
  private config() {
    const has = (k: string) => Boolean((process.env[k] || "").trim());
    const cors = (process.env.CORS_ORIGIN || "").split(",").map((s) => s.trim()).filter(Boolean);
    return {
      items: [
        { key: "mail", label: "Envío de mails (Resend o SMTP)", ok: has("RESEND_API_KEY") || has("SMTP_HOST") },
        { key: "mail_from", label: "Remitente de mails", ok: has("MAIL_FROM"), value: process.env.MAIL_FROM || null },
        { key: "google", label: "Login con Google", ok: has("GOOGLE_CLIENT_ID") },
        { key: "pepper", label: "Clave de los códigos de verificación", ok: has("EMAIL_CODE_PEPPER") },
        { key: "encryption", label: "Cifrado de credenciales de proveedores", ok: has("ENCRYPTION_KEY") },
        { key: "fetch_token", label: "Token de los proxies de egreso", ok: has("DISTECNA_FETCH_TOKEN") && has("RETAIL_HG_FETCH_TOKEN") },
        { key: "jwt_ttl", label: "Duración de la sesión", ok: true, value: process.env.JWT_EXPIRES_IN || "por defecto" },
        { key: "throttle", label: "Límite de pedidos por minuto e IP", ok: true, value: process.env.THROTTLE_LIMIT || "100" },
      ],
      corsOrigins: cors,
    };
  }
}

function overallStatus(input: {
  traffic: TrafficSummary;
  integrity: { severity: CheckSeverity }[];
  syncErrorCount: number;
  config: { items: { ok: boolean }[] };
  security: { lockedAccounts: unknown[] };
}): { level: CheckSeverity; reasons: string[] } {
  const critical: string[] = [];
  const warning: string[] = [];
  const t = input.traffic;
  if (t.serverErrors > 0 && t.serverErrorRate >= 0.01) critical.push(`${(t.serverErrorRate * 100).toFixed(1)} % de errores internos`);
  else if (t.serverErrors > 0) warning.push(`${t.serverErrors} errores internos`);
  if (t.rateLimited > 50) warning.push(`${t.rateLimited} pedidos frenados por límite`);
  const crit = input.integrity.filter((c) => c.severity === "critical").length;
  const warn = input.integrity.filter((c) => c.severity === "warning").length;
  if (crit) critical.push(`${crit} chequeos de integridad críticos`);
  if (warn) warning.push(`${warn} chequeos de integridad para revisar`);
  if (input.syncErrorCount) warning.push(`${input.syncErrorCount} sincronizaciones con error`);
  if (input.config.items.some((i) => !i.ok)) critical.push("Falta configuración de producción");
  if (input.security.lockedAccounts.length) warning.push(`${input.security.lockedAccounts.length} cuentas bloqueadas por intentos`);
  if (critical.length) return { level: "critical", reasons: [...critical, ...warning] };
  if (warning.length) return { level: "warning", reasons: warning };
  return { level: "ok", reasons: [] };
}
