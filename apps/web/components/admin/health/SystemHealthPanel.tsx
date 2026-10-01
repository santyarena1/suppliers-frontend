"use client";

import { useCallback, useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import { systemHealthApi, type SystemHealth } from "@/lib/system-health";
import {
  Empty,
  IntegrityList,
  LEVEL_LABEL,
  LEVEL_TONE,
  LevelIcon,
  RouteTable,
  Section,
  Timeline,
  when,
} from "./HealthSections";

const PERIODS = [
  { hours: 1, label: "1 h" },
  { hours: 24, label: "24 h" },
  { hours: 24 * 7, label: "7 días" },
  { hours: 24 * 30, label: "30 días" },
];
const REFRESH_MS = 60_000;

function uptime(sec: number) {
  const d = Math.floor(sec / 86_400);
  const h = Math.floor((sec % 86_400) / 3600);
  const m = Math.floor((sec % 3600) / 60);
  return d ? `${d} d ${h} h` : h ? `${h} h ${m} min` : `${m} min`;
}

function Kpi({ label, value, hint, tone = "text-white" }: { label: string; value: string; hint?: string; tone?: string }) {
  return (
    <div className="rounded-xl border border-surface-800 bg-surface-900/50 px-3.5 py-3 min-w-0">
      <p className="text-[11px] text-surface-500">{label}</p>
      <p className={`mt-1 text-lg font-semibold tabular-nums ${tone}`}>{value}</p>
      {hint && <p className="text-[11px] text-surface-500 truncate">{hint}</p>}
    </div>
  );
}

/**
 * "Salud del sistema": errores del API, sincronizaciones, tareas programadas,
 * integridad de los datos, seguridad y configuración de producción. Se
 * actualiza solo cada minuto.
 */
export default function SystemHealthPanel() {
  const [hours, setHours] = useState(24);
  const [data, setData] = useState<SystemHealth | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await systemHealthApi.overview(hours);
      setData(res.data);
      setError(null);
    } catch (err) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
      setError(msg || "No se pudo cargar la salud del sistema");
    } finally {
      setLoading(false);
    }
  }, [hours]);

  useEffect(() => {
    void load();
    const id = setInterval(() => void load(), REFRESH_MS);
    return () => clearInterval(id);
  }, [load]);

  const t = data?.traffic;
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        {data && (
          <span className={`inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm font-semibold ${LEVEL_TONE[data.status.level]}`}>
            <LevelIcon level={data.status.level} /> {LEVEL_LABEL[data.status.level]}
          </span>
        )}
        <div className="flex gap-1 rounded-lg border border-surface-800 bg-surface-900 p-0.5">
          {PERIODS.map((p) => (
            <button
              key={p.hours}
              type="button"
              onClick={() => setHours(p.hours)}
              className={`rounded-md px-2.5 py-1 text-[11px] font-medium ${hours === p.hours ? "bg-brand-600 text-white" : "text-surface-400 hover:text-white"}`}
            >
              {p.label}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={() => void load()}
          className="ml-auto inline-flex items-center gap-1.5 rounded-lg border border-surface-700 px-2.5 py-1.5 text-xs text-surface-300 hover:text-white"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} /> Actualizar
        </button>
        {data && <span className="text-[11px] text-surface-500">Actualizado {when(data.generatedAt)}</span>}
      </div>

      {error && <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">{error}</div>}

      {data && data.status.reasons.length > 0 && (
        <ul className="flex flex-col gap-1 rounded-xl border border-surface-800 px-4 py-3">
          {data.status.reasons.map((r) => (
            <li key={r} className="text-xs text-surface-300">• {r}</li>
          ))}
        </ul>
      )}

      {data && t && (
        <>
          <div className="grid grid-cols-2 gap-2.5 md:grid-cols-4 xl:grid-cols-7">
            <Kpi label="Pedidos al API" value={t.requests.toLocaleString("es-AR")} hint={`${t.avgMs} ms promedio`} />
            <Kpi
              label="Errores internos"
              value={t.serverErrors.toLocaleString("es-AR")}
              hint={`${(t.serverErrorRate * 100).toFixed(2)} % de los pedidos`}
              tone={t.serverErrors ? "text-red-300" : "text-emerald-300"}
            />
            <Kpi label="Rechazados" value={t.clientErrors.toLocaleString("es-AR")} hint="datos inválidos, sin permiso" tone={t.clientErrors ? "text-amber-200" : "text-white"} />
            <Kpi label="Frenados por límite" value={t.rateLimited.toLocaleString("es-AR")} hint="429" tone={t.rateLimited ? "text-amber-200" : "text-white"} />
            <Kpi label="Logins fallidos" value={t.failedLogins.toLocaleString("es-AR")} hint={`${t.unauthorized} sesiones rechazadas`} />
            <Kpi label="Base de datos" value={`${data.runtime.dbLatencyMs} ms`} hint="respuesta ahora" tone={data.runtime.dbLatencyMs > 300 ? "text-amber-200" : "text-white"} />
            <Kpi label="API en línea" value={uptime(data.runtime.uptimeSec)} hint={`versión ${data.runtime.version ?? "—"} · ${data.runtime.memoryMb} MB`} />
          </div>

          <Section title="Pedidos por hora" hint="Rechazados no incluye sesiones vencidas ni links viejos (401/404), que son uso normal.">
            <Timeline data={t.timeline} />
          </Section>

          <div className="grid gap-4 lg:grid-cols-2">
            <Section title="Rutas con errores">
              <RouteTable rows={t.topErrorRoutes} mode="errors" />
            </Section>
            <Section title="Rutas más lentas" hint="Con al menos 5 pedidos en el período.">
              <RouteTable rows={t.slowestRoutes} mode="slow" />
            </Section>
          </div>

          <Section title="Errores internos recientes" hint="Lo que el API no pudo resolver, con el mensaje real.">
            {data.recentErrors.length === 0 ? (
              <Empty>Sin errores internos en el período.</Empty>
            ) : (
              <ul className="flex flex-col divide-y divide-surface-800">
                {data.recentErrors.map((e) => (
                  <li key={e.id} className="py-2 text-xs">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded bg-red-500/15 px-1.5 py-0.5 font-mono text-[10px] text-red-300">{e.status}</span>
                      <span className="font-mono text-[11px] text-surface-200">{e.method} {e.route}</span>
                      <span className="ml-auto text-[11px] text-surface-500">{when(e.createdAt)}</span>
                    </div>
                    <p className="mt-1 text-surface-300 break-words">{e.message}</p>
                    {(e.userId || e.tenantId) && (
                      <p className="mt-0.5 font-mono text-[10px] text-surface-600">
                        usuario {e.userId ?? "—"} · org {e.tenantId ?? "—"}
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </Section>

          <div className="grid gap-4 lg:grid-cols-2">
            <Section title="Sincronizaciones con proveedores" hint="Cuentas de comercio cuya última sincronización falló.">
              {data.syncErrors.length === 0 ? (
                <Empty>Todas las sincronizaciones activas están al día.</Empty>
              ) : (
                <ul className="flex flex-col divide-y divide-surface-800">
                  {data.syncErrors.map((s) => (
                    <li key={`${s.org}-${s.provider}`} className="py-2 text-xs">
                      <p className="text-surface-200">
                        <span className="font-semibold">{s.org}</span> · {s.provider}
                      </p>
                      <p className="text-amber-200/90 break-words">{s.error}</p>
                      <p className="text-[11px] text-surface-500">Última buena: {when(s.lastSyncedAt)}</p>
                    </li>
                  ))}
                </ul>
              )}
            </Section>
            <Section title="Tareas programadas">
              <dl className="grid grid-cols-1 gap-2 text-xs">
                <div className="rounded-lg bg-surface-900 px-3 py-2">
                  <dt className="text-surface-500">Catálogos de proveedores en el período</dt>
                  <dd className="mt-0.5 text-surface-200">
                    {Object.keys(data.jobs.catalogSyncs).length
                      ? Object.entries(data.jobs.catalogSyncs).map(([k, v]) => `${k}: ${v}`).join(" · ")
                      : "Sin corridas"}
                  </dd>
                </div>
                <div className="rounded-lg bg-surface-900 px-3 py-2">
                  <dt className="text-surface-500">Precios de locales (última corrida)</dt>
                  <dd className="mt-0.5 text-surface-200">
                    {data.jobs.retail
                      ? `${data.jobs.retail.status} · ${when(data.jobs.retail.startedAt)} · ${data.jobs.retail.storesDone} tiendas / ${data.jobs.retail.productsUpserted} productos`
                      : "Sin corridas"}
                  </dd>
                  {data.jobs.retail?.error && <dd className="text-amber-200/90 break-words">{data.jobs.retail.error}</dd>}
                </div>
                <div className="rounded-lg bg-surface-900 px-3 py-2">
                  <dt className="text-surface-500">Fotos de productos (última corrida)</dt>
                  <dd className="mt-0.5 text-surface-200">
                    {data.jobs.images ? `${data.jobs.images.status} · ${when(data.jobs.images.startedAt)}` : "Sin corridas"}
                  </dd>
                </div>
              </dl>
            </Section>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Section title="Integridad de los datos" hint="Lo crítico cruza datos entre organizaciones; lo demás es para ordenar.">
              <IntegrityList checks={data.integrity} />
            </Section>
            <Section title="Seguridad">
              <div className="grid grid-cols-2 gap-2 text-xs">
                <Kpi label="Cuentas bloqueadas ahora" value={String(data.security.lockedAccounts.length)} tone={data.security.lockedAccounts.length ? "text-amber-200" : "text-white"} />
                <Kpi label="Con 3+ contraseñas fallidas" value={String(data.security.accountsWithFailedLogins)} />
                <Kpi label="Superadmins activos" value={String(data.security.activeAdmins)} />
                <Kpi label="Cuentas desactivadas" value={String(data.security.inactiveUsers)} />
              </div>
              {data.security.lockedAccounts.length > 0 && (
                <ul className="text-xs text-surface-300">
                  {data.security.lockedAccounts.map((l) => (
                    <li key={l.username}>{l.username} · hasta {when(l.loginLockedUntil)}</li>
                  ))}
                </ul>
              )}
              <div>
                <p className="text-[11px] font-semibold text-surface-400">“Entrar como” en el período</p>
                {data.security.impersonations.length === 0 ? (
                  <Empty>Nadie usó “entrar como”.</Empty>
                ) : (
                  <ul className="mt-1 flex flex-col gap-0.5 text-xs text-surface-300">
                    {data.security.impersonations.map((i) => (
                      <li key={`${i.at}-${i.as}`}>
                        {when(i.at)} · <span className="text-white">{i.by}</span> entró como <span className="text-white">{i.as}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </Section>
          </div>

          <Section title="Configuración de producción" hint="Solo si está cargada; nunca se muestran claves.">
            <ul className="grid gap-1.5 sm:grid-cols-2">
              {data.config.items.map((c) => (
                <li key={c.key} className="flex items-center gap-2 text-xs">
                  <LevelIcon level={c.ok ? "ok" : "critical"} className="w-3.5 h-3.5" />
                  <span className="text-surface-200">{c.label}</span>
                  {c.value && <span className="ml-auto font-mono text-[11px] text-surface-400">{c.value}</span>}
                </li>
              ))}
            </ul>
            <p className="text-[11px] text-surface-500">Orígenes permitidos (CORS): {data.config.corsOrigins.join(" · ") || "—"}</p>
          </Section>
        </>
      )}
    </div>
  );
}
