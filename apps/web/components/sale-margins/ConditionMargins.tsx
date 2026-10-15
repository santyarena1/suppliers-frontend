"use client";

import { PackageCheck } from "lucide-react";
import { PRODUCT_CONDITION_LABEL } from "@/lib/storefront";
import { formatMargin, type SaleMarginConditionRow } from "@/lib/sale-margins";
import { MarginInput } from "./shared";

const HINT: Record<string, string> = {
  NEW: "Sellado, sin uso.",
  OPEN_BOX: "Caja abierta o exhibición.",
  REFURBISHED: "Reparado o reacondicionado.",
  USED: "Usado, probado.",
};

/**
 * Margen por estado del producto, solo en las tiendas de comercios. Gana sobre
 * la categoría y el general de la tienda; un producto con margen propio sigue
 * ganando sobre todo.
 */
export default function ConditionMargins({
  rows,
  inherited,
  canEdit,
  saving,
  onSet,
}: {
  rows: SaleMarginConditionRow[];
  /** Lo que hereda un estado sin margen propio (el de la tienda o el general). */
  inherited: number;
  canEdit: boolean;
  saving: boolean;
  onSet: (condition: string, percent: number | null) => void;
}) {
  return (
    <section className="rounded-xl border border-surface-800 p-4" aria-labelledby="condition-margins">
      <div className="flex items-start gap-2.5">
        <PackageCheck className="mt-0.5 h-4 w-4 flex-shrink-0 text-sky-300" />
        <div className="min-w-0">
          <h3 id="condition-margins" className="text-sm font-semibold text-white">
            Por estado del producto
          </h3>
          <p className="mt-0.5 text-[11px] leading-snug text-surface-500">
            Un local vende usados, caja abierta o reacondicionados: ponele a cada estado su margen. Gana sobre la categoría
            y el general; un producto con margen propio sigue ganando.
          </p>
        </div>
      </div>
      <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        {rows.map((row) => (
          <div key={row.condition} className="rounded-lg border border-surface-800 bg-surface-900/50 p-3">
            <div className="flex items-baseline justify-between gap-2">
              <p className="text-sm font-medium text-white">{PRODUCT_CONDITION_LABEL[row.condition] ?? row.condition}</p>
              <span className="text-[10px] tabular-nums text-surface-500">
                {row.products === 1 ? "1 producto" : `${row.products} productos`}
              </span>
            </div>
            <p className="mb-2 text-[10px] text-surface-500">{HINT[row.condition]}</p>
            <MarginInput
              size="sm"
              label={`Margen para ${PRODUCT_CONDITION_LABEL[row.condition] ?? row.condition}`}
              value={row.percent}
              inherited={inherited}
              disabled={!canEdit || saving}
              onCommit={(next) => onSet(row.condition, next)}
            />
            <p className="mt-1 text-[10px] text-surface-500">
              {row.percent == null ? `Hereda ${formatMargin(inherited)}` : "Margen propio del estado"}
            </p>
          </div>
        ))}
      </div>
      <p className="mt-2 text-[10px] text-surface-600">Los productos sin estado cargado por el local usan la categoría o el general.</p>
    </section>
  );
}
