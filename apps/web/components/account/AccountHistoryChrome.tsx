"use client";

import { ChevronLeft, ChevronRight, RefreshCw } from "lucide-react";
import {
  currentMonthKey,
  formatMonthLabel,
  shiftMonth,
  type MonthFilter,
} from "@/lib/account-history";

export type AccountSection = { id: string; label: string };

type Props = {
  sections: AccountSection[];
  section: string;
  onSection: (id: string) => void;
  month: MonthFilter;
  onMonth: (m: MonthFilter) => void;
  page: number;
  pages: number;
  total: number;
  onPage: (p: number) => void;
  onRefresh: () => void;
  refreshing?: boolean;
  fromCache?: boolean;
  /** Suma de importes del filtro actual (mes / todos), no solo la página. */
  amountTotal?: string | null;
  amountTotalLabel?: string;
  /** Tres cifras con etiqueta propia (cta cte Elit). Si hay, reemplaza `amountTotal`. */
  amountBreakdown?: {
    label: string;
    hint?: string;
    value: string;
    tone?: "debit" | "credit" | "neutral";
  }[];
  /** Contenido de la sección activa (tabla, etc.). */
  children: React.ReactNode;
  /** Bloque fijo arriba del listado (saldo, formularios…). */
  header?: React.ReactNode;
  hint?: string;
  /** Tablas anchas (cta cte Elit: cupo + historial). */
  wide?: boolean;
};

export default function AccountHistoryChrome({
  sections,
  section,
  onSection,
  month,
  onMonth,
  page,
  pages,
  total,
  onPage,
  onRefresh,
  refreshing,
  fromCache,
  amountTotal,
  amountTotalLabel = "Total período",
  amountBreakdown,
  children,
  header,
  hint,
  wide,
}: Props) {
  const monthLabel = month === "all" ? "Todos" : formatMonthLabel(month);

  return (
    <div className={`flex flex-col gap-4 ${wide ? "max-w-6xl" : "max-w-3xl"}`}>
      {hint && <p className="text-xs text-surface-500">{hint}</p>}

      <div className="flex flex-wrap items-center gap-2 border-b border-surface-800 pb-px">
        {sections.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => onSection(s.id)}
            className={`px-3 py-2 text-xs font-semibold transition-colors border-b-2 -mb-px ${
              section === s.id
                ? "border-brand-500 text-white"
                : "border-transparent text-surface-500 hover:text-surface-300"
            }`}
          >
            {s.label}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1 rounded-lg border border-surface-800 bg-surface-900/60">
          <button
            type="button"
            disabled={month === "all"}
            onClick={() => onMonth(month === "all" ? month : shiftMonth(month, -1))}
            className="p-1.5 text-surface-400 hover:text-white disabled:opacity-30"
            title="Mes anterior"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <span className="min-w-[9.5rem] text-center text-xs font-medium text-surface-200 tabular-nums px-1">
            {monthLabel}
          </span>
          <button
            type="button"
            disabled={month === "all"}
            onClick={() => onMonth(month === "all" ? month : shiftMonth(month, 1))}
            className="p-1.5 text-surface-400 hover:text-white disabled:opacity-30"
            title="Mes siguiente"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
        <button
          type="button"
          onClick={() => onMonth(month === "all" ? currentMonthKey() : "all")}
          className={`text-[11px] px-2.5 py-1.5 rounded-md border ${
            month === "all"
              ? "border-brand-500/40 text-brand-300 bg-brand-500/10"
              : "border-surface-800 text-surface-400 hover:text-white"
          }`}
        >
          {month === "all" ? "Ver mes actual" : "Ver todos"}
        </button>
        <button
          type="button"
          onClick={onRefresh}
          disabled={refreshing}
          className="ml-auto inline-flex items-center gap-1.5 text-[11px] px-2.5 py-1.5 rounded-md border border-surface-800 text-surface-400 hover:text-white disabled:opacity-50"
          title="Actualizar desde el portal"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? "animate-spin" : ""}`} />
          Actualizar
        </button>
        {fromCache && !refreshing && (
          <span className="text-[10px] text-surface-600">cache local</span>
        )}
      </div>

      {header}

      {amountBreakdown && amountBreakdown.length > 0 ? (
        <div className="rounded-xl border border-surface-800 bg-surface-900/50 px-4 py-3">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-surface-500 mb-3">
            {amountTotalLabel}
            {month !== "all" ? ` · ${monthLabel}` : ""}
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {amountBreakdown.map((item) => (
              <div key={item.label}>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-surface-400">
                  {item.label}
                </p>
                {item.hint ? (
                  <p className="text-[11px] text-surface-500 mt-0.5 leading-snug">{item.hint}</p>
                ) : null}
                <p
                  className={`text-lg font-bold tabular-nums mt-1 ${
                    item.tone === "debit"
                      ? "text-red-400"
                      : item.tone === "credit"
                        ? "text-emerald-400"
                        : "text-white"
                  }`}
                >
                  {item.value}
                </p>
              </div>
            ))}
          </div>
        </div>
      ) : amountTotal ? (
        <div className="flex items-baseline justify-between gap-3 rounded-xl border border-surface-800 bg-surface-900/50 px-4 py-3">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-surface-500">
            {amountTotalLabel}
            {month !== "all" ? ` · ${monthLabel}` : ""}
          </span>
          <span className="text-lg font-bold tabular-nums text-white">{amountTotal}</span>
        </div>
      ) : null}

      <div className="border border-surface-800 rounded-xl p-4 sm:p-5 flex flex-col gap-3">
        {children}
        <div className="flex items-center justify-between gap-2 pt-1 border-t border-surface-800/80">
          <span className="text-[11px] text-surface-500 tabular-nums">
            {total === 0 ? "Sin registros" : `${total} registro${total === 1 ? "" : "s"}`}
            {pages > 1 ? ` · pág. ${page}/${pages}` : ""}
          </span>
          {pages > 1 && (
            <div className="flex items-center gap-1">
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => onPage(page - 1)}
                className="p-1.5 rounded-md border border-surface-800 text-surface-400 hover:text-white disabled:opacity-30"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                disabled={page >= pages}
                onClick={() => onPage(page + 1)}
                className="p-1.5 rounded-md border border-surface-800 text-surface-400 hover:text-white disabled:opacity-30"
              >
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
