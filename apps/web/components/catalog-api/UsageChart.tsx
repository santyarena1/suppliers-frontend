"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import { catalogApiAdmin } from "@/lib/api";
import { apiMessage } from "./ui";

type Day = { day: string; requests: number; errors: number };

/** Completa los días sin uso para que el gráfico muestre los 30 días seguidos. */
function fillDays(rows: Day[], days: number): Day[] {
  const byDay = new Map(rows.map((r) => [r.day.slice(0, 10), r]));
  const out: Day[] = [];
  const today = new Date();
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() - i));
    const key = d.toISOString().slice(0, 10);
    out.push(byDay.get(key) ?? { day: key, requests: 0, errors: 0 });
  }
  return out;
}

/** Pedidos y errores por día de una key (últimos 30 días). */
export default function UsageChart({ clientId }: { clientId: string }) {
  const [rows, setRows] = useState<Day[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    setRows(null);
    setError(null);
    catalogApiAdmin
      .usage(clientId, 30)
      .then((res) => alive && setRows(fillDays(res.data.days ?? [], 30)))
      .catch((err) => alive && setError(apiMessage(err, "No se pudo cargar el uso")));
    return () => {
      alive = false;
    };
  }, [clientId]);

  const totals = useMemo(() => {
    const r = rows ?? [];
    return { requests: r.reduce((s, d) => s + d.requests, 0), errors: r.reduce((s, d) => s + d.errors, 0) };
  }, [rows]);

  if (error) return <p className="text-xs text-red-400">{error}</p>;
  if (!rows) {
    return (
      <div className="flex h-36 items-center justify-center">
        <Loader2 className="w-4 h-4 animate-spin text-brand-500" />
      </div>
    );
  }

  const max = Math.max(1, ...rows.map((d) => d.requests));
  const errorRate = totals.requests ? (totals.errors / totals.requests) * 100 : 0;

  return (
    <div>
      <div className="flex flex-wrap gap-6">
        <Stat label="Pedidos (30 días)" value={totals.requests.toLocaleString("es-AR")} />
        <Stat label="Errores" value={totals.errors.toLocaleString("es-AR")} tone={totals.errors ? "warn" : undefined} />
        <Stat label="Tasa de error" value={`${errorRate.toLocaleString("es-AR", { maximumFractionDigits: 1 })} %`} />
      </div>
      {totals.requests === 0 ? (
        <p className="mt-4 rounded-lg border border-dashed border-surface-700 px-3 py-6 text-center text-xs text-surface-500">
          Esta key todavía no hizo pedidos. Probala con el ejemplo de inicio rápido.
        </p>
      ) : (
        <div className="mt-4">
          <div className="flex h-32 items-end gap-[3px]" role="img" aria-label={`Pedidos por día: ${totals.requests} en 30 días`}>
            {rows.map((d) => {
              const h = (d.requests / max) * 100;
              const eh = d.requests ? (d.errors / d.requests) * h : 0;
              return (
                <div key={d.day} className="group relative flex h-full flex-1 flex-col justify-end">
                  <div className="relative w-full rounded-t-sm bg-brand-500/70 group-hover:bg-brand-400" style={{ height: `${Math.max(h, d.requests ? 2 : 0)}%` }}>
                    {eh > 0 && <div className="absolute inset-x-0 bottom-0 rounded-t-sm bg-red-400/80" style={{ height: `${(eh / h) * 100}%` }} />}
                  </div>
                  <div className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-1 hidden -translate-x-1/2 whitespace-nowrap rounded-md border border-surface-700 bg-surface-950 px-2 py-1 text-[10px] text-surface-200 shadow-lg group-hover:block">
                    {new Date(`${d.day}T12:00:00Z`).toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit" })} · {d.requests} pedidos
                    {d.errors ? ` · ${d.errors} errores` : ""}
                  </div>
                </div>
              );
            })}
          </div>
          <div className="mt-1.5 flex justify-between text-[10px] text-surface-600 tabular-nums">
            <span>hace 30 días</span>
            <span>hoy</span>
          </div>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: "warn" }) {
  return (
    <div>
      <p className="text-[11px] text-surface-500">{label}</p>
      <p className={`text-lg font-semibold tabular-nums ${tone === "warn" ? "text-amber-300" : "text-white"}`}>{value}</p>
    </div>
  );
}
