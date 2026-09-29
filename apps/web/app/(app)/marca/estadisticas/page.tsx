"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Loader2 } from "lucide-react";
import PrefsPanel from "@/components/PrefsPanel";
import { brandStatsApi, type BrandPanelStats } from "@/lib/api";
import { MonthsPicker, PurchaseStatsBody, StatTile } from "@/components/brands/BrandStatsView";

function errMsg(err: unknown, fallback: string) {
  return (err as { response?: { data?: { message?: string } } })?.response?.data?.message ?? fallback;
}

/** Estadísticas de la marca: compras de sus cuentas por NODO y presencia de stock. */
export default function BrandStatsPage() {
  const [months, setMonths] = useState(12);
  const [stats, setStats] = useState<BrandPanelStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    brandStatsApi
      .mine(months)
      .then((res) => {
        if (!alive) return;
        setStats(res.data);
        setError(null);
      })
      .catch((err) => alive && setError(errMsg(err, "No se pudieron cargar las estadísticas")))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [months]);

  return (
    <>
      <header className="flex-shrink-0 border-b border-surface-800 bg-surface-950 px-4 sm:px-6 py-3 flex items-center justify-between gap-3">
        <div>
          <h1 className="text-base font-semibold text-white">Estadísticas</h1>
          <p className="text-xs text-surface-500 hidden sm:block">
            Qué compran tus cuentas por NODO y dónde hay stock de tus productos.
          </p>
        </div>
        <PrefsPanel />
      </header>
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-5 flex flex-col gap-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            {stats && (
              <p className="text-sm text-surface-300">
                {stats.linkedAccounts.retailers} comercios y {stats.linkedAccounts.distributors} distribuidores vinculados
              </p>
            )}
            <MonthsPicker value={months} onChange={setMonths} />
          </div>

          {error && <p className="text-xs rounded-md px-3 py-2 bg-red-500/10 text-red-400">{error}</p>}

          {loading && !stats ? (
            <div className="flex justify-center py-16">
              <Loader2 className="w-5 h-5 animate-spin text-brand-500" />
            </div>
          ) : stats ? (
            <div className={`flex flex-col gap-8 ${loading ? "opacity-60 transition-opacity" : ""}`}>
              <section>
                <h2 className="text-sm font-semibold text-white mb-3">Compras de tus cuentas</h2>
                {stats.totals.orders === 0 ? (
                  <p className="rounded-2xl border border-dashed border-surface-700 px-5 py-6 text-sm text-surface-400">
                    Tus cuentas vinculadas todavía no compraron tus productos por NODO en los últimos {months} meses.
                    Compartí tu link público para sumar comercios.
                  </p>
                ) : (
                  <PurchaseStatsBody stats={stats} showAccounts />
                )}
              </section>

              <section>
                <div className="flex flex-wrap items-end justify-between gap-2 mb-3">
                  <h2 className="text-sm font-semibold text-white">Presencia por distribuidor</h2>
                  <Link href="/marca/productos" className="text-xs font-semibold text-brand-400 hover:text-brand-300">
                    Ver el semáforo →
                  </Link>
                </div>
                {stats.presence.products === 0 ? (
                  <p className="rounded-2xl border border-dashed border-surface-700 px-5 py-6 text-sm text-surface-400">
                    Sumá tus productos en “Productos” para ver en qué distribuidores están y con qué stock.
                  </p>
                ) : (
                  <>
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-3">
                      <StatTile label="Productos activos" value={String(stats.presence.products)} />
                      <StatTile label="Distribuidores" value={String(stats.presence.distributors.length)} />
                    </div>
                    <div className="overflow-x-auto rounded-2xl border border-surface-800">
                      <table className="w-full text-sm">
                        <thead className="bg-surface-900 text-[11px] uppercase tracking-wide text-surface-500">
                          <tr>
                            <th className="text-left font-medium px-4 py-2">Distribuidor</th>
                            <th className="text-right font-medium px-4 py-2">Tiene</th>
                            <th className="text-right font-medium px-4 py-2">Con stock</th>
                            <th className="text-right font-medium px-4 py-2">Sin stock</th>
                            <th className="text-right font-medium px-4 py-2">Sin dato</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-surface-800">
                          {stats.presence.distributors.map((d) => (
                            <tr key={d.provider}>
                              <td className="px-4 py-2 text-white">{d.label}</td>
                              <td className="px-4 py-2 text-right text-surface-300 tabular-nums">
                                {d.products} <span className="text-surface-500">({d.coverage}%)</span>
                              </td>
                              <td className="px-4 py-2 text-right text-emerald-300 tabular-nums">{d.inStock}</td>
                              <td className="px-4 py-2 text-right text-red-300 tabular-nums">{d.none}</td>
                              <td className="px-4 py-2 text-right text-surface-500 tabular-nums">{d.unknown}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </>
                )}
              </section>
            </div>
          ) : null}
        </div>
      </div>
    </>
  );
}
