"use client";

import { formatUSD } from "@/lib/format";
import type { BrandPurchaseStats, BrandRankRow } from "@/lib/api";

export const STATS_MONTHS = [3, 6, 12] as const;

function monthLabel(key: string) {
  const [y, m] = key.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, 15)).toLocaleDateString("es-AR", { month: "short", timeZone: "UTC" });
}

export function MonthsPicker({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  return (
    <div className="inline-flex rounded-lg border border-surface-700 p-0.5" role="group" aria-label="Período">
      {STATS_MONTHS.map((m) => (
        <button
          key={m}
          type="button"
          onClick={() => onChange(m)}
          aria-pressed={value === m}
          className={`px-2.5 py-1 text-xs rounded-md transition-colors ${
            value === m ? "bg-brand-600 text-white" : "text-surface-400 hover:text-white"
          }`}
        >
          {m} meses
        </button>
      ))}
    </div>
  );
}

export function StatTile({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-2xl border border-surface-800 bg-surface-900/70 px-4 py-3">
      <p className="text-[11px] uppercase tracking-wide text-surface-500">{label}</p>
      <p className="text-xl font-semibold text-white tabular-nums mt-1">{value}</p>
      {hint && <p className="text-[11px] text-surface-500 mt-0.5">{hint}</p>}
    </div>
  );
}

/** Barras por mes: gasto en USD (alto) con las unidades en el tooltip. */
export function MonthlyBars({ monthly }: { monthly: BrandPurchaseStats["monthly"] }) {
  const max = Math.max(1, ...monthly.map((m) => m.spendUsd));
  return (
    <div className="rounded-2xl border border-surface-800 bg-surface-900/70 p-4">
      <p className="text-xs font-semibold text-surface-300 mb-3">Por mes</p>
      <div className="flex items-end gap-1.5 h-32" role="img" aria-label="Compras por mes">
        {monthly.map((m) => (
          <div key={m.month} className="flex-1 min-w-0 flex flex-col items-center gap-1 h-full justify-end">
            <div
              className="w-full rounded-t-md bg-gradient-to-t from-brand-600 to-brand-400 min-h-[2px] transition-[height]"
              style={{ height: `${Math.max(2, (m.spendUsd / max) * 100)}%`, opacity: m.spendUsd > 0 ? 1 : 0.25 }}
              title={`${monthLabel(m.month)}: ${formatUSD(m.spendUsd)} · ${m.units} u.`}
            />
            <span className="text-[10px] text-surface-500">{monthLabel(m.month)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Ranking con barra de participación. */
export function RankList({
  title,
  rows,
  empty,
  unitsOnly = false,
}: {
  title: string;
  rows: BrandRankRow[];
  empty: string;
  unitsOnly?: boolean;
}) {
  return (
    <div className="rounded-2xl border border-surface-800 bg-surface-900/70 p-4">
      <p className="text-xs font-semibold text-surface-300 mb-3">{title}</p>
      {rows.length === 0 ? (
        <p className="text-xs text-surface-500">{empty}</p>
      ) : (
        <ol className="flex flex-col gap-2.5">
          {rows.map((row, i) => (
            <li key={row.key}>
              <div className="flex items-baseline justify-between gap-2 text-sm">
                <span className="min-w-0 truncate text-white">
                  <span className="text-surface-500 tabular-nums mr-1.5">{i + 1}.</span>
                  {row.label}
                </span>
                <span className="flex-shrink-0 text-xs text-surface-300 tabular-nums">
                  {unitsOnly ? `${row.units} u.` : `${formatUSD(row.spendUsd)} · ${row.units} u.`}
                </span>
              </div>
              <div className="mt-1 h-1 rounded-full bg-surface-800 overflow-hidden">
                <div className="h-full rounded-full bg-brand-500/80" style={{ width: `${Math.max(2, row.share)}%` }} />
              </div>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

/** Lo común de las dos vistas: totales, serie por mes y rankings. */
export function PurchaseStatsBody({ stats, showAccounts }: { stats: BrandPurchaseStats; showAccounts: boolean }) {
  const ticket = stats.totals.orders > 0 ? stats.totals.spendUsd / stats.totals.orders : 0;
  return (
    <div className="flex flex-col gap-3">
      {stats.truncated && (
        <p className="text-xs rounded-md px-3 py-2 bg-amber-500/10 text-amber-200">
          Hay más pedidos de los que se pueden sumar de una vez: los números pueden estar por debajo. Probá con un período más corto.
        </p>
      )}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatTile label="Comprado" value={formatUSD(stats.totals.spendUsd)} hint={`Últimos ${stats.months} meses`} />
        <StatTile label="Unidades" value={String(stats.totals.units)} />
        <StatTile label="Pedidos" value={String(stats.totals.orders)} hint={ticket ? `${formatUSD(ticket)} por pedido` : undefined} />
        {showAccounts ? (
          <StatTile label="Cuentas que compraron" value={String(stats.totals.accounts)} />
        ) : (
          <StatTile label="Distribuidores" value={String(stats.byProvider.length)} hint="Donde compraste la marca" />
        )}
      </div>
      <MonthlyBars monthly={stats.monthly} />
      <div className={`grid gap-3 ${showAccounts ? "lg:grid-cols-3" : "lg:grid-cols-2"}`}>
        <RankList title="Qué: productos más comprados" rows={stats.topProducts} empty="Todavía no hay compras." />
        <RankList title="Dónde: por distribuidor" rows={stats.byProvider} empty="Todavía no hay compras." />
        {showAccounts && (
          <RankList title="Quién: cuentas que más compran" rows={stats.byAccount} empty="Tus cuentas todavía no compraron por NODO." />
        )}
      </div>
    </div>
  );
}
