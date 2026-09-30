"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  healthApi,
  type ClientErrorReport,
  type HealthCheck,
  type HealthStatus,
  type PlatformHealthOverview,
} from "@/lib/api";
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Info,
  Loader2,
  RefreshCw,
  XCircle,
} from "lucide-react";

const GROUP_LABEL: Record<string, string> = {
  platform: "Plataforma",
  crons: "Tareas programadas",
  retail: "Locales / precios",
  catalog: "Catálogo / proveedores",
  images: "Imágenes",
  imports: "Listas Excel",
  frontend: "Frontend",
};

const GROUP_ORDER = [
  "platform",
  "crons",
  "retail",
  "catalog",
  "images",
  "imports",
  "frontend",
] as const;

function StatusIcon({ status }: { status: HealthStatus }) {
  if (status === "ok") return <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />;
  if (status === "warn") return <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />;
  if (status === "error") return <XCircle className="w-4 h-4 text-red-400 shrink-0" />;
  return <Info className="w-4 h-4 text-sky-400 shrink-0" />;
}

function statusTone(status: HealthStatus) {
  if (status === "ok") return "border-emerald-500/20 bg-emerald-500/5";
  if (status === "warn") return "border-amber-500/20 bg-amber-500/5";
  if (status === "error") return "border-red-500/25 bg-red-500/5";
  return "border-sky-500/20 bg-sky-500/5";
}

function fmtWhen(iso: string) {
  return new Date(iso).toLocaleString("es-AR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function errMsg(err: unknown, fallback: string) {
  return (err as { response?: { data?: { message?: string } } })?.response?.data?.message || fallback;
}

export default function HealthPanel({
  showToast,
}: {
  showToast: (m: string, ok?: boolean) => void;
}) {
  const [overview, setOverview] = useState<PlatformHealthOverview | null>(null);
  const [errors, setErrors] = useState<ClientErrorReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    else setRefreshing(true);
    try {
      const [ovRes, errRes] = await Promise.all([
        healthApi.overview(),
        healthApi.clientErrors({ take: 40, hours: 48 }),
      ]);
      setOverview(ovRes.data);
      setErrors(errRes.data.items);
    } catch (e) {
      showToast(errMsg(e, "No se pudo cargar el estado de salud"), false);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [showToast]);

  useEffect(() => {
    void load();
    const t = setInterval(() => void load(true), 60_000);
    return () => clearInterval(t);
  }, [load]);

  if (loading && !overview) {
    return (
      <div className="flex items-center gap-2 text-sm text-surface-500 py-10 justify-center">
        <Loader2 className="w-4 h-4 animate-spin" /> Revisando plataforma…
      </div>
    );
  }

  if (!overview) {
    return (
      <div className="text-sm text-red-300 py-8 text-center">
        No se pudo obtener el overview. ¿El API está arriba?
      </div>
    );
  }

  const byGroup = new Map<string, HealthCheck[]>();
  for (const c of overview.checks) {
    const list = byGroup.get(c.group) || [];
    list.push(c);
    byGroup.set(c.group, list);
  }

  return (
    <div className="space-y-6 max-w-5xl">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Activity className="w-4 h-4 text-brand-400" />
            <h2 className="text-sm font-semibold text-white">Salud y errores</h2>
          </div>
          <p className="text-xs text-surface-500 mt-1">
            Chequeo de API, base, crons, fuentes de locales, syncs trabadas y errores de JS del
            navegador. Actualizado {fmtWhen(overview.checkedAt)}.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load(true)}
          disabled={refreshing}
          className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg border border-surface-700 text-surface-300 hover:text-white hover:border-surface-500 disabled:opacity-50"
        >
          {refreshing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
          Actualizar
        </button>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {(
          [
            ["error", overview.summary.error, "Errores"],
            ["warn", overview.summary.warn, "Avisos"],
            ["ok", overview.summary.ok, "OK"],
            ["info", overview.summary.info, "Info"],
          ] as const
        ).map(([status, n, label]) => (
          <div
            key={status}
            className={`rounded-xl border px-3 py-2.5 ${statusTone(status)}`}
          >
            <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-surface-400">
              <StatusIcon status={status} />
              {label}
            </div>
            <div className="text-2xl font-semibold text-white mt-1 tabular-nums">{n}</div>
          </div>
        ))}
      </div>

      {GROUP_ORDER.map((group) => {
        const items = byGroup.get(group);
        if (!items?.length) return null;
        const worst = items.some((i) => i.status === "error")
          ? "error"
          : items.some((i) => i.status === "warn")
            ? "warn"
            : items.every((i) => i.status === "ok")
              ? "ok"
              : "info";
        return (
          <section key={group} className="space-y-2">
            <div className="flex items-center gap-2">
              <StatusIcon status={worst} />
              <h3 className="text-xs font-semibold text-surface-300 uppercase tracking-wide">
                {GROUP_LABEL[group] || group}
              </h3>
            </div>
            <ul className="space-y-1.5">
              {items.map((check) => (
                <li
                  key={check.id}
                  className={`rounded-lg border px-3 py-2.5 ${statusTone(check.status)}`}
                >
                  <div className="flex items-start gap-2">
                    <StatusIcon status={check.status} />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                        <span className="text-sm font-medium text-white">{check.label}</span>
                        {check.href && (
                          <Link
                            href={check.href}
                            className="text-[11px] text-brand-400 hover:text-brand-300"
                          >
                            Ir →
                          </Link>
                        )}
                      </div>
                      <p className="text-xs text-surface-400 mt-0.5 break-words">{check.message}</p>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        );
      })}

      <section className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-xs font-semibold text-surface-300 uppercase tracking-wide">
            Errores de cliente (48 h)
          </h3>
          <span className="text-[11px] text-surface-500">
            {overview.clientErrors.lastHour} / última hora · {overview.clientErrors.last24h} / 24 h
          </span>
        </div>
        {errors.length === 0 ? (
          <p className="text-xs text-surface-500 border border-surface-800 rounded-lg px-3 py-4">
            No hay reportes recientes del navegador.
          </p>
        ) : (
          <ul className="space-y-1.5">
            {errors.map((e) => (
              <li
                key={e.id}
                className="rounded-lg border border-surface-800 bg-surface-900/40 px-3 py-2.5"
              >
                <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-surface-500">
                  <span className="font-medium text-amber-300/90 uppercase">{e.kind}</span>
                  <span>{fmtWhen(e.createdAt)}</span>
                  {e.url && (
                    <span className="truncate max-w-[240px] text-surface-400" title={e.url}>
                      {e.url.replace(/^https?:\/\/[^/]+/, "") || e.url}
                    </span>
                  )}
                </div>
                <p className="text-xs text-surface-200 mt-1 break-words">{e.message}</p>
                {e.source && (
                  <p className="text-[11px] text-surface-500 mt-1 font-mono truncate">
                    {e.source}
                    {e.line != null ? `:${e.line}` : ""}
                    {e.column != null ? `:${e.column}` : ""}
                  </p>
                )}
                {e.stack && (
                  <pre className="mt-2 text-[10px] leading-relaxed text-surface-500 overflow-x-auto max-h-28 whitespace-pre-wrap font-mono">
                    {e.stack.slice(0, 1200)}
                  </pre>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
