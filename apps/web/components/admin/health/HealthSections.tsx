"use client";

import { useState } from "react";
import { AlertTriangle, CheckCircle2, ChevronDown, XCircle } from "lucide-react";
import type { HealthLevel, RouteStat, SystemHealth } from "@/lib/system-health";

export const LEVEL_TONE: Record<HealthLevel, string> = {
  ok: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
  warning: "bg-amber-500/15 text-amber-200 border-amber-500/30",
  critical: "bg-red-500/15 text-red-300 border-red-500/30",
};

export const LEVEL_LABEL: Record<HealthLevel, string> = {
  ok: "Todo en orden",
  warning: "Para revisar",
  critical: "Crítico",
};

export function LevelIcon({ level, className = "w-4 h-4" }: { level: HealthLevel; className?: string }) {
  if (level === "ok") return <CheckCircle2 className={`${className} text-emerald-400`} />;
  if (level === "warning") return <AlertTriangle className={`${className} text-amber-300`} />;
  return <XCircle className={`${className} text-red-400`} />;
}

export function Section({ title, hint, children, right }: { title: string; hint?: string; children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <section className="border border-surface-800 rounded-xl p-4 flex flex-col gap-3 min-w-0">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-white">{title}</h3>
          {hint && <p className="text-[11px] text-surface-500 mt-0.5">{hint}</p>}
        </div>
        {right}
      </div>
      {children}
    </section>
  );
}

export function Empty({ children }: { children: React.ReactNode }) {
  return <p className="text-xs text-surface-500 py-2">{children}</p>;
}

export function when(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("es-AR", { dateStyle: "short", timeStyle: "short" });
}

/** Barras por hora: total en gris, errores de cliente en ámbar y errores internos en rojo. */
export function Timeline({ data }: { data: SystemHealth["traffic"]["timeline"] }) {
  const max = Math.max(1, ...data.map((d) => d.requests));
  return (
    <div>
      <div className="flex h-28 items-end gap-[2px]" role="img" aria-label="Pedidos y errores por hora">
        {data.map((d) => {
          const total = (d.requests / max) * 100;
          const err4 = d.requests ? (d.clientErrors / d.requests) * total : 0;
          const err5 = d.requests ? (d.serverErrors / d.requests) * total : 0;
          return (
            <div key={d.hour} className="flex h-full flex-1 flex-col justify-end" title={`${when(d.hour)} · ${d.requests} pedidos · ${d.clientErrors} rechazados · ${d.serverErrors} errores internos`}>
              <div className="w-full rounded-t-sm bg-surface-700" style={{ height: `${Math.max(0, total - err4 - err5)}%` }} />
              {err4 > 0 && <div className="w-full bg-amber-400/70" style={{ height: `${err4}%` }} />}
              {err5 > 0 && <div className="w-full bg-red-500" style={{ height: `${Math.max(err5, 2)}%` }} />}
            </div>
          );
        })}
      </div>
      <div className="mt-2 flex justify-between text-[10px] text-surface-500 tabular-nums">
        <span>{when(data[0]?.hour)}</span>
        <span className="flex gap-3">
          <span className="inline-flex items-center gap-1"><i className="h-2 w-2 rounded-sm bg-surface-700" /> pedidos</span>
          <span className="inline-flex items-center gap-1"><i className="h-2 w-2 rounded-sm bg-amber-400/70" /> rechazados</span>
          <span className="inline-flex items-center gap-1"><i className="h-2 w-2 rounded-sm bg-red-500" /> errores internos</span>
        </span>
        <span>{when(data[data.length - 1]?.hour)}</span>
      </div>
    </div>
  );
}

export function RouteTable({ rows, mode }: { rows: RouteStat[]; mode: "errors" | "slow" }) {
  if (!rows.length) return <Empty>{mode === "errors" ? "Ninguna ruta con errores en el período." : "Sin datos suficientes."}</Empty>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="text-left text-surface-500">
            <th className="py-1.5 pr-3 font-medium">Ruta</th>
            <th className="py-1.5 px-2 font-medium text-right">Pedidos</th>
            {mode === "errors" ? (
              <>
                <th className="py-1.5 px-2 font-medium text-right">Internos</th>
                <th className="py-1.5 px-2 font-medium text-right">Rechazados</th>
                <th className="py-1.5 pl-2 font-medium text-right">Por límite</th>
              </>
            ) : (
              <>
                <th className="py-1.5 px-2 font-medium text-right">Promedio</th>
                <th className="py-1.5 pl-2 font-medium text-right">Máximo</th>
              </>
            )}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.route} className="border-t border-surface-800">
              <td className="py-1.5 pr-3 font-mono text-[11px] text-surface-200 break-all">{r.route}</td>
              <td className="py-1.5 px-2 text-right tabular-nums text-surface-300">{r.requests.toLocaleString("es-AR")}</td>
              {mode === "errors" ? (
                <>
                  <td className={`py-1.5 px-2 text-right tabular-nums ${r.serverErrors ? "text-red-300 font-semibold" : "text-surface-500"}`}>{r.serverErrors}</td>
                  <td className={`py-1.5 px-2 text-right tabular-nums ${r.clientErrors ? "text-amber-200" : "text-surface-500"}`}>{r.clientErrors}</td>
                  <td className={`py-1.5 pl-2 text-right tabular-nums ${r.rateLimited ? "text-amber-200" : "text-surface-500"}`}>{r.rateLimited}</td>
                </>
              ) : (
                <>
                  <td className="py-1.5 px-2 text-right tabular-nums text-surface-200">{r.avgMs} ms</td>
                  <td className="py-1.5 pl-2 text-right tabular-nums text-surface-400">{r.maxMs} ms</td>
                </>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function IntegrityList({ checks }: { checks: SystemHealth["integrity"] }) {
  const [open, setOpen] = useState<string | null>(null);
  return (
    <ul className="flex flex-col divide-y divide-surface-800">
      {checks.map((c) => (
        <li key={c.key} className="py-2">
          <button
            type="button"
            onClick={() => setOpen((v) => (v === c.key ? null : c.key))}
            disabled={!c.examples.length}
            className="flex w-full items-center gap-2.5 text-left disabled:cursor-default"
          >
            <LevelIcon level={c.severity} />
            <span className="flex-1 min-w-0">
              <span className="block text-xs text-surface-200">{c.label}</span>
              {c.severity !== "ok" && <span className="block text-[11px] text-surface-500">{c.hint}</span>}
            </span>
            <span className={`tabular-nums text-xs ${c.count ? "text-white font-semibold" : "text-surface-500"}`}>{c.count}</span>
            {c.examples.length > 0 && <ChevronDown className={`w-3.5 h-3.5 text-surface-500 transition-transform ${open === c.key ? "rotate-180" : ""}`} />}
          </button>
          {open === c.key && (
            <ul className="mt-2 ml-6 flex flex-col gap-1">
              {c.examples.map((e) => (
                <li key={e} className="font-mono text-[11px] text-surface-400 break-all">{e}</li>
              ))}
            </ul>
          )}
        </li>
      ))}
    </ul>
  );
}
