"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { brandStatsApi, type BrandPurchaseStats } from "@/lib/api";
import { MonthsPicker, PurchaseStatsBody } from "./BrandStatsView";

/**
 * "Tus compras de la marca" dentro de su espacio: cuánto, dónde y qué compró el
 * comercio de esta marca por NODO. Si no tiene permiso para ver pedidos, no aparece.
 */
export function ClientBrandStats({ linkId, brandName }: { linkId: string; brandName: string }) {
  const [months, setMonths] = useState(12);
  const [stats, setStats] = useState<BrandPurchaseStats | null>(null);
  const [hidden, setHidden] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    brandStatsApi
      .forLink(linkId, months)
      .then((res) => alive && setStats(res.data))
      .catch(() => alive && setHidden(true))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [linkId, months]);

  if (hidden) return null;

  return (
    <section id="mis-compras" className="scroll-mt-16 max-w-6xl mx-auto px-4 sm:px-6 w-full pt-8">
      <div className="flex flex-wrap items-end justify-between gap-3 mb-4">
        <div>
          <h2 className="text-xl sm:text-2xl font-semibold text-white tracking-tight">Tus compras de {brandName}</h2>
          <p className="text-sm text-surface-400 mt-1">Lo que compraste por NODO: cuánto, dónde y qué.</p>
        </div>
        <MonthsPicker value={months} onChange={setMonths} />
      </div>
      {loading && !stats ? (
        <div className="flex justify-center py-10">
          <Loader2 className="w-5 h-5 animate-spin text-brand-500" />
        </div>
      ) : stats && stats.totals.orders === 0 ? (
        <p className="rounded-2xl border border-dashed border-surface-700 px-5 py-6 text-sm text-surface-400">
          Todavía no compraste productos de {brandName} por NODO en los últimos {months} meses.
        </p>
      ) : stats ? (
        <div className={loading ? "opacity-60 transition-opacity" : ""}>
          <PurchaseStatsBody stats={stats} showAccounts={false} />
        </div>
      ) : null}
    </section>
  );
}
