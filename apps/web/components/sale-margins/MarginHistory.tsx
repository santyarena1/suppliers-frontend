"use client";

import { useEffect, useState } from "react";
import { ChevronDown, History } from "lucide-react";
import { saleMarginsApi } from "@/lib/api";
import { formatMargin, type SaleMarginHistoryEntry } from "@/lib/sale-margins";

/** Texto de la regla cuando el backend no manda uno legible (STORE | P:x | C:x:cat | X:x:id). */
function ruleLabel(entry: SaleMarginHistoryEntry): string {
  if (entry.label) return entry.label;
  const [kind, , ...rest] = entry.ruleKey.split(":");
  if (kind === "STORE") return "Margen general del comercio";
  if (kind === "P") return "Margen general del distribuidor";
  if (kind === "C") return `Categoría ${rest.join(":")}`;
  if (kind === "X") return `Producto #${rest.join(":")}`;
  return entry.ruleKey;
}

function when(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleString("es-AR", { dateStyle: "short", timeStyle: "short" });
}

/** Quién cambió qué margen, de cuánto a cuánto. Se carga al abrirlo. */
export default function MarginHistory({ provider, refreshKey }: { provider: string; refreshKey: number }) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<SaleMarginHistoryEntry[] | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!open) return;
    let alive = true;
    setError(false);
    saleMarginsApi
      .history({ provider, limit: 50 })
      .then((res) => {
        if (alive) setItems(Array.isArray(res.data?.items) ? res.data.items : []);
      })
      .catch(() => {
        if (alive) setError(true);
      });
    return () => {
      alive = false;
    };
  }, [open, provider, refreshKey]);

  return (
    <section className="rounded-xl border border-surface-800">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
      >
        <span className="flex items-center gap-2 text-sm font-semibold text-white">
          <History className="h-4 w-4 text-surface-400" />
          Historial de cambios
        </span>
        <ChevronDown className={`h-4 w-4 text-surface-500 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="border-t border-surface-800 px-4 py-3">
          {error ? (
            <p className="text-xs text-surface-400">No se pudo cargar el historial.</p>
          ) : items == null ? (
            <p className="text-xs text-surface-500">Cargando…</p>
          ) : items.length === 0 ? (
            <p className="text-xs text-surface-500">Todavía no hay cambios de margen en este distribuidor.</p>
          ) : (
            <ol className="flex flex-col divide-y divide-surface-800/70">
              {items.map((entry) => (
                <li key={entry.id} className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 py-2 text-xs">
                  <span className="min-w-0 text-surface-200">{ruleLabel(entry)}</span>
                  <span className="font-mono tabular-nums text-surface-300">
                    {entry.before == null ? "heredado" : formatMargin(entry.before)}
                    <span className="mx-1.5 text-surface-600">→</span>
                    <span className={entry.after == null ? "text-surface-400" : "text-emerald-300"}>
                      {entry.after == null ? "heredado" : formatMargin(entry.after)}
                    </span>
                  </span>
                  <span className="basis-full text-[11px] text-surface-500">
                    {entry.userName ? `${entry.userName} · ` : ""}
                    {when(entry.createdAt)}
                  </span>
                </li>
              ))}
            </ol>
          )}
        </div>
      )}
    </section>
  );
}
