"use client";

import { useEffect, useRef, useState } from "react";
import { History, Loader2, Search, X } from "lucide-react";
import { ordersApi, type PurchaseHistoryResult } from "@/lib/api";
import { formatUSD } from "@/lib/format";
import { formatPurchaseDate } from "@/lib/last-purchases";
import ProviderBadge from "@/components/ProviderBadge";

function daysAgo(iso: string): string {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (days <= 0) return "hoy";
  if (days === 1) return "ayer";
  if (days < 60) return `hace ${days} días`;
  const months = Math.round(days / 30);
  return months < 24 ? `hace ${months} meses` : `hace ${Math.round(days / 365)} años`;
}

/** Buscador «¿Cuándo lo compré?»: escribís un producto y ves cuándo y a quién se lo compraste. */
function HistorySearchBody({ autoFocus = false }: { autoFocus?: boolean }) {
  const [query, setQuery] = useState("");
  const [result, setResult] = useState<PurchaseHistoryResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const seq = useRef(0);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setResult(null);
      setError(null);
      setLoading(false);
      return;
    }
    const id = ++seq.current;
    setLoading(true);
    const t = setTimeout(() => {
      ordersApi
        .purchaseHistory(q)
        .then((res) => {
          if (id !== seq.current) return;
          setResult(res.data);
          setError(null);
        })
        .catch((err: { response?: { status?: number } }) => {
          if (id !== seq.current) return;
          setResult(null);
          setError(
            err?.response?.status === 403
              ? "Tu usuario no puede ver las compras del comercio."
              : "No se pudo buscar en tus compras. Probá de nuevo."
          );
        })
        .finally(() => {
          if (id === seq.current) setLoading(false);
        });
    }, 300);
    return () => clearTimeout(t);
  }, [query]);

  return (
    <div className="flex flex-col gap-3">
      <label className="relative block">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-surface-500" aria-hidden />
        <input
          type="search"
          value={query}
          autoFocus={autoFocus}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscá un producto o código, ej. 5600G"
          aria-label="Buscar en mis compras"
          className="w-full rounded-lg border border-surface-700 bg-surface-900 py-2 pl-9 pr-9 text-sm text-white placeholder:text-surface-500 focus:border-brand-500 focus:outline-none"
        />
        {loading && (
          <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-surface-500" aria-hidden />
        )}
      </label>

      {error && <p className="text-xs text-red-300">{error}</p>}

      {result && !loading && result.total === 0 && (
        <p className="text-sm text-surface-400">
          No encontramos compras de «{result.query}» en los pedidos hechos desde NODO.
        </p>
      )}

      {result && result.total > 0 && (
        <>
          <div className="flex flex-wrap gap-2">
            {result.lastByProvider.map((p) => (
              <div
                key={p.provider}
                className="flex items-center gap-2 rounded-lg border border-surface-800 bg-surface-900/60 px-3 py-2"
                title={p.name}
              >
                <ProviderBadge provider={p.provider} size="sm" />
                <div className="leading-tight">
                  <p className="text-sm font-medium text-white">{formatPurchaseDate(p.createdAt)}</p>
                  <p className="text-[11px] text-surface-500">Última compra · {daysAgo(p.createdAt)}</p>
                </div>
              </div>
            ))}
          </div>

          <div className="overflow-x-auto rounded-lg border border-surface-800">
            <table className="w-full min-w-[560px] text-left text-xs">
              <thead className="bg-surface-900 text-[11px] uppercase tracking-wide text-surface-500">
                <tr>
                  <th className="px-3 py-2 font-medium">Fecha</th>
                  <th className="px-3 py-2 font-medium">Proveedor</th>
                  <th className="px-3 py-2 font-medium">Producto</th>
                  <th className="px-3 py-2 text-right font-medium">Cant.</th>
                  <th className="px-3 py-2 text-right font-medium">Unitario</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-800">
                {result.lines.map((l, i) => (
                  <tr key={`${l.orderId}-${l.sku}-${i}`} className="text-surface-200">
                    <td className="whitespace-nowrap px-3 py-2 tabular-nums">
                      {formatPurchaseDate(l.createdAt)}
                      {l.channel === "OFFLINE" && <span className="ml-1.5 text-[10px] text-amber-300">offline</span>}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2">{l.providerName}</td>
                    <td className="px-3 py-2">
                      <span className="line-clamp-2">{l.name}</span>
                      <span className="font-mono text-[10px] text-surface-500">{l.sku}</span>
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">{l.qty}</td>
                    <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">
                      {l.unitUsd > 0 ? formatUSD(l.unitUsd) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {result.total > result.lines.length && (
            <p className="text-[11px] text-surface-500">
              Se ven las {result.lines.length} compras más nuevas de {result.total}. Escribí más palabras para afinar.
            </p>
          )}
        </>
      )}

      <p className="text-[11px] text-surface-500">
        Busca en los pedidos hechos desde NODO (online y offline). Lo que compraste directo en la página del distribuidor no aparece.
      </p>
    </div>
  );
}

/** Sección fija (Pedidos). */
export function PurchaseHistorySection() {
  return (
    <section className="rounded-xl border border-surface-800 bg-surface-950 p-4">
      <div className="mb-3 flex items-center gap-2">
        <History className="h-4 w-4 text-brand-400" aria-hidden />
        <h2 className="text-sm font-semibold text-white">¿Cuándo lo compré?</h2>
      </div>
      <HistorySearchBody />
    </section>
  );
}

/** Botón que abre el buscador en una ventana (Carrito). */
export function PurchaseHistoryButton({ className }: { className?: string }) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={
          className ??
          "flex items-center gap-1.5 text-sm text-surface-300 hover:text-white border border-surface-700 hover:border-surface-500 rounded-sm px-3 py-1.5 transition-colors"
        }
        title="Buscá un producto y mirá cuándo lo compraste"
      >
        <History className="h-3.5 w-3.5" aria-hidden />
        <span className="hidden sm:inline">¿Cuándo lo compré?</span>
      </button>
      {open && (
        <div className="fixed inset-0 z-[60] flex items-start justify-center p-4 pt-[10dvh]">
          <button type="button" aria-label="Cerrar" className="absolute inset-0 bg-black/70" onClick={() => setOpen(false)} />
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="purchase-history-title"
            className="relative flex max-h-[80dvh] w-full max-w-3xl flex-col rounded-xl border border-surface-800 bg-surface-950 shadow-[0_24px_80px_rgba(0,0,0,0.55)]"
          >
            <div className="flex items-center justify-between gap-3 border-b border-surface-800 px-4 py-3">
              <h2 id="purchase-history-title" className="text-sm font-semibold text-white">
                ¿Cuándo lo compré?
              </h2>
              <button
                type="button"
                aria-label="Cerrar"
                onClick={() => setOpen(false)}
                className="text-surface-400 transition-colors hover:text-white"
              >
                <X className="h-4 w-4" aria-hidden />
              </button>
            </div>
            <div className="overflow-y-auto p-4">
              <HistorySearchBody autoFocus />
            </div>
          </div>
        </div>
      )}
    </>
  );
}
