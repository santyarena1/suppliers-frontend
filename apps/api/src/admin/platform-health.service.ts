import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Prisma } from "@prisma/client";
import axios from "axios";
import type { JwtPayload } from "@nodo/shared";
import { PrismaService } from "../prisma/prisma.service";
import {
  cronsAreGloballyEnabled,
  isCronQuietHours,
} from "../common/cron-window";
import type { ReportClientErrorDto } from "./dto/client-error.dto";
import type {
  HealthCheck,
  HealthStatus,
  PlatformHealthOverview,
} from "./platform-health.types";

const STALE_HEARTBEAT_MS = 20 * 60_000;
const RETAIL_STORE_STALE_MS = 6 * 60 * 60_000;
const CLIENT_ERROR_RETENTION_MS = 14 * 24 * 60 * 60_000;
const PROBE_TIMEOUT_MS = 8_000;

function summarize(checks: HealthCheck[]): PlatformHealthOverview["summary"] {
  const summary = { ok: 0, warn: 0, error: 0, info: 0 };
  for (const c of checks) summary[c.status] += 1;
  return summary;
}

function ageLabel(ms: number | null): string {
  if (ms == null || !Number.isFinite(ms)) return "nunca";
  if (ms < 60_000) return `${Math.round(ms / 1000)}s`;
  if (ms < 3_600_000) return `${Math.round(ms / 60_000)} min`;
  if (ms < 48 * 3_600_000) return `${(ms / 3_600_000).toFixed(1)} h`;
  return `${(ms / (24 * 3_600_000)).toFixed(1)} d`;
}

@Injectable()
export class PlatformHealthService {
  private readonly logger = new Logger(PlatformHealthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService
  ) {}

  async overview(): Promise<PlatformHealthOverview> {
    const now = new Date();
    const checks: HealthCheck[] = [];

    checks.push(...(await this.checkPlatform()));
    checks.push(...this.checkCrons(now));
    checks.push(...(await this.checkRetail(now)));
    checks.push(...(await this.checkCatalog(now)));
    checks.push(...(await this.checkImages(now)));
    checks.push(...(await this.checkImports()));
    checks.push(...(await this.checkFrontend()));

    const clientErrors = await this.clientErrorCounts(now);
    if (clientErrors.lastHour > 0) {
      checks.push({
        id: "frontend.client_errors_hour",
        group: "frontend",
        label: "Errores JS (última hora)",
        status: clientErrors.lastHour >= 10 ? "error" : "warn",
        message: `${clientErrors.lastHour} reporte(s) en la última hora · ${clientErrors.last24h} en 24 h`,
        href: "/admin?tab=health",
      });
    } else {
      checks.push({
        id: "frontend.client_errors_hour",
        group: "frontend",
        label: "Errores JS (última hora)",
        status: "ok",
        message:
          clientErrors.last24h > 0
            ? `Ninguno en la última hora · ${clientErrors.last24h} en 24 h`
            : "Sin reportes recientes",
        href: "/admin?tab=health",
      });
    }

    return {
      checkedAt: now.toISOString(),
      summary: summarize(checks),
      checks,
      clientErrors,
    };
  }

  async reportClientError(dto: ReportClientErrorDto, user?: JwtPayload) {
    const row = await this.prisma.clientErrorReport.create({
      data: {
        kind: dto.kind,
        message: dto.message.slice(0, 2000),
        stack: dto.stack?.slice(0, 8000) || null,
        source: dto.source?.slice(0, 2000) || null,
        line: dto.line ?? null,
        column: dto.column ?? null,
        url: dto.url?.slice(0, 2000) || null,
        userAgent: dto.userAgent?.slice(0, 500) || null,
        userId: user?.sub ?? null,
        meta: (dto.meta as Prisma.InputJsonValue | undefined) ?? undefined,
      },
      select: { id: true, createdAt: true },
    });
    // Limpieza oportunista, sin bloquear la respuesta.
    void this.pruneOldClientErrors().catch((err) =>
      this.logger.warn(`No se pudieron podar errores de cliente: ${String(err)}`)
    );
    return row;
  }

  async listClientErrors(opts: { take?: number; hours?: number } = {}) {
    const take = Math.min(100, Math.max(1, opts.take ?? 40));
    const hours = Math.min(168, Math.max(1, opts.hours ?? 24));
    const since = new Date(Date.now() - hours * 3_600_000);
    await this.pruneOldClientErrors();
    const items = await this.prisma.clientErrorReport.findMany({
      where: { createdAt: { gte: since } },
      orderBy: { createdAt: "desc" },
      take,
    });
    return { items, since: since.toISOString() };
  }

  private async pruneOldClientErrors() {
    const cutoff = new Date(Date.now() - CLIENT_ERROR_RETENTION_MS);
    await this.prisma.clientErrorReport.deleteMany({
      where: { createdAt: { lt: cutoff } },
    });
  }

  private async clientErrorCounts(now: Date) {
    const hourAgo = new Date(now.getTime() - 3_600_000);
    const dayAgo = new Date(now.getTime() - 24 * 3_600_000);
    const [lastHour, last24h] = await Promise.all([
      this.prisma.clientErrorReport.count({ where: { createdAt: { gte: hourAgo } } }),
      this.prisma.clientErrorReport.count({ where: { createdAt: { gte: dayAgo } } }),
    ]);
    return { lastHour, last24h };
  }

  private async checkPlatform(): Promise<HealthCheck[]> {
    const checks: HealthCheck[] = [
      {
        id: "platform.api",
        group: "platform",
        label: "API (proceso)",
        status: "ok",
        message: `En pie · uptime ${ageLabel(process.uptime() * 1000)}`,
        detail: { uptimeSec: Math.round(process.uptime()) },
      },
    ];

    try {
      const t0 = Date.now();
      await this.prisma.$queryRaw`SELECT 1`;
      checks.push({
        id: "platform.db",
        group: "platform",
        label: "Postgres",
        status: "ok",
        message: `Responde · ${Date.now() - t0} ms`,
      });
    } catch (err) {
      checks.push({
        id: "platform.db",
        group: "platform",
        label: "Postgres",
        status: "error",
        message: err instanceof Error ? err.message : "No responde",
      });
    }

    return checks;
  }

  private checkCrons(now: Date): HealthCheck[] {
    const globallyOn = cronsAreGloballyEnabled();
    const quiet = isCronQuietHours(now);
    const envName =
      process.env.RAILWAY_ENVIRONMENT_NAME || process.env.RAILWAY_ENVIRONMENT || "";
    const cronDisabled = process.env.CRON_DISABLED === "true";

    const checks: HealthCheck[] = [
      {
        id: "crons.global",
        group: "crons",
        label: "Crons globales",
        status: globallyOn ? "ok" : "warn",
        message: globallyOn
          ? "Habilitados"
          : cronDisabled
            ? "Apagados (CRON_DISABLED=true)"
            : envName.toLowerCase().includes("staging")
              ? `Apagados en staging (${envName})`
              : "Apagados",
        detail: { CRON_DISABLED: cronDisabled, envName: envName || null },
      },
      {
        id: "crons.quiet_hours",
        group: "crons",
        label: "Ventana horaria (AR)",
        status: quiet ? "info" : "ok",
        message: quiet
          ? "Noche quieta (23:00–06:00 AR): los crons no corren"
          : "Dentro de la ventana diurna (06:00–23:00 AR)",
      },
    ];

    const retailOff = this.config.get("RETAIL_INGEST_DISABLED") === "true";
    const hgOff = this.config.get("RETAIL_HG_DISABLED") === "true";
    const imagesOff = this.config.get("IMAGE_SYNC_CRON_DISABLED") === "true";

    checks.push({
      id: "crons.retail_flag",
      group: "crons",
      label: "Flag ingest de locales",
      status: retailOff ? "warn" : "ok",
      message: retailOff ? "RETAIL_INGEST_DISABLED=true" : "Ingest de locales habilitado",
      href: "/admin?tab=retail",
    });
    checks.push({
      id: "crons.hg_flag",
      group: "crons",
      label: "Flag HardGamers",
      status: hgOff ? "info" : "ok",
      message: hgOff ? "RETAIL_HG_DISABLED=true" : "Fuente HardGamers habilitada",
      href: "/admin?tab=retail",
    });
    checks.push({
      id: "crons.images_flag",
      group: "crons",
      label: "Flag imágenes",
      status: imagesOff ? "warn" : "ok",
      message: imagesOff ? "IMAGE_SYNC_CRON_DISABLED=true" : "Cron de imágenes habilitado (env)",
      href: "/admin?tab=images",
    });

    return checks;
  }

  private async checkRetail(now: Date): Promise<HealthCheck[]> {
    const checks: HealthCheck[] = [];
    const last = await this.prisma.retailIngestRun.findFirst({
      orderBy: { startedAt: "desc" },
    });

    if (!last) {
      checks.push({
        id: "retail.ingest_last",
        group: "retail",
        label: "Última ingest de locales",
        status: "warn",
        message: "Nunca corrió",
        href: "/admin?tab=retail",
      });
    } else {
      const age = now.getTime() - last.startedAt.getTime();
      let status: HealthStatus = "ok";
      let message = `${last.status} · hace ${ageLabel(age)}`;
      if (last.status === "ERROR") {
        status = "error";
        message = `ERROR · ${last.errorMessage || "sin detalle"} · hace ${ageLabel(age)}`;
      } else if (last.status === "RUNNING") {
        const hbAge = now.getTime() - last.heartbeatAt.getTime();
        if (hbAge > STALE_HEARTBEAT_MS) {
          status = "error";
          message = `Corrida trabada (heartbeat hace ${ageLabel(hbAge)})`;
        } else {
          status = "info";
          message = `En curso (${last.mode}) · ${last.currentStoreName || "…"}`;
        }
      } else if (last.status === "OK" && age > RETAIL_STORE_STALE_MS && !isCronQuietHours(now)) {
        status = "warn";
        message = `OK pero hace ${ageLabel(age)} (esperado ~15 min de día)`;
      }
      checks.push({
        id: "retail.ingest_last",
        group: "retail",
        label: "Última ingest de locales",
        status,
        message,
        detail: {
          id: last.id,
          status: last.status,
          mode: last.mode,
          errorMessage: last.errorMessage,
          startedAt: last.startedAt.toISOString(),
        },
        href: "/admin?tab=retail",
      });
    }

    const staleCutoff = new Date(now.getTime() - RETAIL_STORE_STALE_MS);
    const [activeStores, staleStores, neverSynced] = await Promise.all([
      this.prisma.retailStore.count({ where: { active: true } }),
      this.prisma.retailStore.count({
        where: { active: true, syncedAt: { lt: staleCutoff } },
      }),
      this.prisma.retailStore.count({
        where: {
          active: true,
          // "Nunca" = syncedAt ≈ createdAt y sin productos, o syncedAt muy viejo al crear.
          // Usamos productos = 0 como señal práctica de nunca sincronizado.
          products: { none: {} },
        },
      }),
    ]);

    checks.push({
      id: "retail.stores_stale",
      group: "retail",
      label: "Locales desactualizados",
      status:
        staleStores === 0
          ? "ok"
          : staleStores > Math.max(3, Math.floor(activeStores / 2))
            ? "error"
            : "warn",
      message:
        activeStores === 0
          ? "No hay locales activos"
          : staleStores === 0
            ? `${activeStores} locales al día`
            : `${staleStores}/${activeStores} sin sync hace >6 h` +
              (neverSynced ? ` · ${neverSynced} sin productos` : ""),
      href: "/admin?tab=retail",
    });

    const plBase = (
      this.config.get<string>("RETAIL_SOURCE_BASE_URL") || "https://api.preciolider.com.ar"
    ).replace(/\/$/, "");
    checks.push(await this.probeHttp({
      id: "retail.source_preciolider",
      group: "retail",
      label: "Fuente PrecioLider",
      url: `${plBase}/api/stores`,
      href: "/admin?tab=retail",
      okStatuses: [200],
    }));

    if (this.config.get("RETAIL_CG_DISABLED") !== "true") {
      const cgUrl = (this.config.get<string>("RETAIL_CG_URL") || "https://static.compragamer.com/productos").trim();
      checks.push(await this.probeHttp({
        id: "retail.source_compragamer",
        group: "retail",
        label: "Fuente Compra Gamer",
        url: cgUrl,
        href: "/admin?tab=retail",
        okStatuses: [200],
        // No bajamos el catálogo entero: solo comprobamos que el host conteste.
        method: "head",
      }));
    }

    return checks;
  }

  private async checkCatalog(now: Date): Promise<HealthCheck[]> {
    const checks: HealthCheck[] = [];
    const dayAgo = new Date(now.getTime() - 24 * 3_600_000);
    const staleHb = new Date(now.getTime() - STALE_HEARTBEAT_MS);

    const [recentErrors, stuck, enabledConfigs] = await Promise.all([
      this.prisma.catalogSyncRun.findMany({
        where: { status: "ERROR", startedAt: { gte: dayAgo } },
        orderBy: { startedAt: "desc" },
        take: 8,
        select: {
          id: true,
          provider: true,
          tenantId: true,
          errorMessage: true,
          startedAt: true,
          tenant: { select: { name: true } },
        },
      }),
      this.prisma.catalogSyncRun.findMany({
        where: { status: "RUNNING", heartbeatAt: { lt: staleHb } },
        take: 10,
        select: {
          id: true,
          provider: true,
          tenantId: true,
          heartbeatAt: true,
          tenant: { select: { name: true } },
        },
      }),
      this.prisma.providerSyncConfig.findMany({
        where: { enabled: true, priceChannel: "API" },
        select: {
          id: true,
          provider: true,
          tenantId: true,
          syncIntervalMinutes: true,
          lastSyncedAt: true,
          lastSyncError: true,
          tenant: { select: { name: true } },
        },
      }),
    ]);

    checks.push({
      id: "catalog.sync_errors_24h",
      group: "catalog",
      label: "Sync de catálogo con error (24 h)",
      status: recentErrors.length === 0 ? "ok" : recentErrors.length >= 5 ? "error" : "warn",
      message:
        recentErrors.length === 0
          ? "Ninguna corrida en ERROR"
          : `${recentErrors.length} corrida(s): ` +
            recentErrors
              .slice(0, 3)
              .map((r) => `${r.tenant.name}/${r.provider}`)
              .join(", "),
      detail: {
        samples: recentErrors.map((r) => ({
          provider: r.provider,
          tenant: r.tenant.name,
          error: r.errorMessage,
          at: r.startedAt.toISOString(),
        })),
      },
      href: "/admin?tab=diagnostics",
    });

    checks.push({
      id: "catalog.stuck_runs",
      group: "catalog",
      label: "Corridas de catálogo trabadas",
      status: stuck.length === 0 ? "ok" : "error",
      message:
        stuck.length === 0
          ? "Ninguna RUNNING sin heartbeat"
          : stuck.map((r) => `${r.tenant.name}/${r.provider}`).join(", "),
      href: "/proveedores",
    });

    const overdue = enabledConfigs.filter((c) => {
      if (!c.lastSyncedAt) return true;
      const dueAt =
        c.lastSyncedAt.getTime() + c.syncIntervalMinutes * 60_000 + 30 * 60_000;
      return now.getTime() > dueAt;
    });
    // De noche o con crons off no alarmamos por atraso.
    const schedulingActive = cronsAreGloballyEnabled() && !isCronQuietHours(now);
    checks.push({
      id: "catalog.overdue",
      group: "catalog",
      label: "Sync API vencidas",
      status:
        !schedulingActive || overdue.length === 0
          ? "ok"
          : overdue.length >= 5
            ? "error"
            : "warn",
      message: !schedulingActive
        ? "Fuera de ventana / crons off — no se evalúa atraso"
        : overdue.length === 0
          ? `${enabledConfigs.length} config(s) API al día`
          : `${overdue.length}/${enabledConfigs.length} pasaron su intervalo: ` +
            overdue
              .slice(0, 4)
              .map((c) => `${c.tenant.name}/${c.provider}`)
              .join(", "),
      detail: {
        withLastError: enabledConfigs.filter((c) => c.lastSyncError).length,
      },
    });

    const withError = enabledConfigs.filter((c) => c.lastSyncError);
    if (withError.length > 0) {
      checks.push({
        id: "catalog.last_sync_error",
        group: "catalog",
        label: "Último error guardado en config",
        status: "warn",
        message: withError
          .slice(0, 4)
          .map((c) => `${c.tenant.name}/${c.provider}: ${(c.lastSyncError || "").slice(0, 80)}`)
          .join(" · "),
      });
    }

    return checks;
  }

  private async checkImages(now: Date): Promise<HealthCheck[]> {
    const checks: HealthCheck[] = [];
    const settings = await this.prisma.imageSyncSettings.findUnique({
      where: { id: "default" },
    });
    const cronDbOn = settings?.cronEnabled !== false;
    checks.push({
      id: "images.cron_db",
      group: "images",
      label: "Cron de imágenes (DB)",
      status: cronDbOn ? "ok" : "warn",
      message: cronDbOn ? "Habilitado en ajustes" : "Deshabilitado desde Admin → Imágenes",
      href: "/admin?tab=images",
    });

    const last = await this.prisma.imageSyncRun.findFirst({
      orderBy: { startedAt: "desc" },
    });
    if (!last) {
      checks.push({
        id: "images.last_run",
        group: "images",
        label: "Última corrida de imágenes",
        status: "info",
        message: "Nunca corrió",
        href: "/admin?tab=images",
      });
      return checks;
    }

    const age = now.getTime() - last.startedAt.getTime();
    let status: HealthStatus = "ok";
    let message = `${last.status} · hace ${ageLabel(age)} · +${last.updated} fotos`;
    if (last.status === "ERROR") {
      status = "error";
      message = `ERROR · ${last.errorMessage || "sin detalle"}`;
    } else if (last.status === "RUNNING") {
      const hbAge = now.getTime() - last.heartbeatAt.getTime();
      if (hbAge > STALE_HEARTBEAT_MS) {
        status = "error";
        message = `Trabada (heartbeat hace ${ageLabel(hbAge)})`;
      } else {
        status = "info";
        message = `En curso · ${last.processed}/${last.missingTotal || "?"}`;
      }
    }
    checks.push({
      id: "images.last_run",
      group: "images",
      label: "Última corrida de imágenes",
      status,
      message,
      href: "/admin?tab=images",
    });
    return checks;
  }

  private async checkImports(): Promise<HealthCheck[]> {
    const dayAgo = new Date(Date.now() - 24 * 3_600_000);
    const stale = new Date(Date.now() - STALE_HEARTBEAT_MS);
    const [failed, stuck] = await Promise.all([
      this.prisma.supplierListImport.count({
        where: { status: "FAILED", createdAt: { gte: dayAgo } },
      }),
      this.prisma.supplierListImport.count({
        where: { status: "PROCESSING", createdAt: { lt: stale } },
      }),
    ]);

    return [
      {
        id: "imports.failed_24h",
        group: "imports",
        label: "Importaciones de lista fallidas (24 h)",
        status: failed === 0 ? "ok" : failed >= 3 ? "error" : "warn",
        message: failed === 0 ? "Ninguna FAILED" : `${failed} FAILED`,
      },
      {
        id: "imports.stuck",
        group: "imports",
        label: "Importaciones trabadas",
        status: stuck === 0 ? "ok" : "error",
        message:
          stuck === 0
            ? "Ninguna PROCESSING antigua"
            : `${stuck} en PROCESSING >20 min`,
      },
    ];
  }

  private async checkFrontend(): Promise<HealthCheck[]> {
    const raw =
      process.env.WEB_ORIGIN ||
      process.env.FRONTEND_URL ||
      (process.env.CORS_ORIGIN || "").split(",")[0] ||
      "";
    const origin = raw.trim().replace(/\/$/, "");
    if (!origin) {
      return [
        {
          id: "frontend.origin",
          group: "frontend",
          label: "Front (origen configurado)",
          status: "info",
          message: "Sin WEB_ORIGIN / FRONTEND_URL / CORS_ORIGIN para sondear",
        },
      ];
    }
    // Localhost desde el API en Railway no tiene sentido.
    if (/localhost|127\.0\.0\.1/i.test(origin)) {
      return [
        {
          id: "frontend.origin",
          group: "frontend",
          label: "Front (origen configurado)",
          status: "info",
          message: `Origen local (${origin}) — no se sondea desde el API`,
        },
      ];
    }
    const probe = await this.probeHttp({
      id: "frontend.origin",
      group: "frontend",
      label: "Front (HTTP)",
      url: origin,
      okStatuses: [200, 301, 302, 307, 308, 401, 403],
      method: "get",
    });
    return [probe];
  }

  private async probeHttp(opts: {
    id: string;
    group: HealthCheck["group"];
    label: string;
    url: string;
    href?: string;
    okStatuses: number[];
    method?: "get" | "head";
  }): Promise<HealthCheck> {
    const method = opts.method ?? "get";
    const t0 = Date.now();
    try {
      const res = await axios.request({
        url: opts.url,
        method,
        timeout: PROBE_TIMEOUT_MS,
        maxRedirects: 3,
        validateStatus: () => true,
        // Evitar bajar cuerpos enormes (Compra Gamer).
        headers: method === "get" ? { Range: "bytes=0-0", Accept: "*/*" } : undefined,
        responseType: "arraybuffer",
        maxContentLength: 256_000,
        maxBodyLength: 256_000,
      });
      const ms = Date.now() - t0;
      const ok = opts.okStatuses.includes(res.status);
      return {
        id: opts.id,
        group: opts.group,
        label: opts.label,
        status: ok ? "ok" : res.status >= 500 ? "error" : "warn",
        message: ok
          ? `HTTP ${res.status} · ${ms} ms`
          : `HTTP ${res.status} · ${ms} ms · ${opts.url}`,
        detail: { url: opts.url, status: res.status, ms },
        href: opts.href,
      };
    } catch (err) {
      const ms = Date.now() - t0;
      const ax = axios.isAxiosError(err) ? err : null;
      const code = ax?.code || "";
      const msg = ax?.message || (err instanceof Error ? err.message : String(err));
      const certMismatch = /altnames|certificate|SSL|TLS|ENOTFOUND|ECONNREFUSED/i.test(
        `${code} ${msg}`
      );
      return {
        id: opts.id,
        group: opts.group,
        label: opts.label,
        status: "error",
        message: certMismatch
          ? `${msg}`.slice(0, 240)
          : `No responde · ${msg}`.slice(0, 240),
        detail: { url: opts.url, code, ms },
        href: opts.href,
      };
    }
  }
}
