"use client";

import { Info } from "lucide-react";
import {
  SALE_MARGIN_BASE_LABELS,
  formatMargin,
  type ProviderSaleMargins,
  type SaleMarginBase,
} from "@/lib/sale-margins";
import { MarginInput } from "./shared";

const EXAMPLE_COST = 100;
const EXAMPLE_IVA = 21;

/** Ejemplo en números de cada base, con el margen que se aplica hoy. */
function baseExample(base: SaleMarginBase, margin: number): string {
  const m = 1 + margin / 100;
  const fmt = (n: number) => `US$ ${(Math.round(n * 100) / 100).toLocaleString("es-AR")}`;
  if (base === "FINAL") {
    return `Costo final ${fmt(EXAMPLE_COST * (1 + EXAMPLE_IVA / 100))} × ${formatMargin(margin)} = venta ${fmt(EXAMPLE_COST * (1 + EXAMPLE_IVA / 100) * m)}`;
  }
  return `Neto ${fmt(EXAMPLE_COST)} × ${formatMargin(margin)} = ${fmt(EXAMPLE_COST * m)} + IVA = venta ${fmt(EXAMPLE_COST * m * (1 + EXAMPLE_IVA / 100))}`;
}

export default function MarginsHeader({
  data,
  canEdit,
  saving,
  onBase,
  onProviderPercent,
  onStorePercent,
}: {
  data: ProviderSaleMargins;
  canEdit: boolean;
  saving: boolean;
  onBase: (base: SaleMarginBase) => void;
  onProviderPercent: (percent: number | null) => void;
  onStorePercent: (percent: number | null) => void;
}) {
  const providerEffective = data.providerPercent ?? data.storePercent ?? 0;
  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]">
      <fieldset className="rounded-xl border border-surface-800 p-4">
        <legend className="px-1 text-sm font-semibold text-white">Cómo se calcula</legend>
        <div className="mt-1 grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label="Base del margen">
          {(["FINAL", "NET"] as SaleMarginBase[]).map((base) => {
            const active = data.base === base;
            return (
              <button
                key={base}
                type="button"
                role="radio"
                aria-checked={active}
                disabled={!canEdit || saving}
                onClick={() => !active && onBase(base)}
                className={`flex flex-col gap-1 rounded-lg border px-3 py-2.5 text-left transition disabled:cursor-not-allowed ${
                  active
                    ? "border-emerald-500/50 bg-emerald-500/[0.07] ring-1 ring-emerald-500/20"
                    : "border-surface-700 hover:border-surface-500 disabled:opacity-60"
                }`}
              >
                <span className="flex items-center gap-2 text-sm font-medium text-white">
                  <span
                    className={`flex h-3.5 w-3.5 items-center justify-center rounded-full border ${
                      active ? "border-emerald-400" : "border-surface-500"
                    }`}
                  >
                    {active && <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />}
                  </span>
                  {SALE_MARGIN_BASE_LABELS[base].title}
                </span>
                <span className="text-[11px] leading-snug text-surface-400">{SALE_MARGIN_BASE_LABELS[base].hint}</span>
                <span className="font-mono text-[10px] leading-snug text-surface-500">{baseExample(base, providerEffective)}</span>
              </button>
            );
          })}
        </div>
      </fieldset>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
        <div className="rounded-xl border border-surface-800 p-4">
          <p className="text-sm font-semibold text-white">Margen de este distribuidor</p>
          <p className="mt-0.5 text-[11px] leading-snug text-surface-500">
            Para las categorías y productos sin margen propio.
            {data.providerPercent == null && ` Hoy hereda ${formatMargin(data.storePercent ?? 0)} del comercio.`}
          </p>
          <div className="mt-2.5 max-w-[9rem]">
            <MarginInput
              label="Margen general del distribuidor"
              value={data.providerPercent}
              inherited={data.storePercent}
              disabled={!canEdit || saving}
              onCommit={onProviderPercent}
            />
          </div>
        </div>
        <div className="rounded-xl border border-surface-800 p-4">
          <p className="text-sm font-semibold text-white">Margen general del comercio</p>
          <p className="mt-0.5 flex items-start gap-1 text-[11px] leading-snug text-amber-300/80">
            <Info className="mt-px h-3 w-3 flex-shrink-0" />
            Vale para todos tus distribuidores que no tengan margen propio.
          </p>
          <div className="mt-2.5 max-w-[9rem]">
            <MarginInput
              label="Margen general del comercio"
              value={data.storePercent}
              inherited={null}
              disabled={!canEdit || saving}
              onCommit={onStorePercent}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
