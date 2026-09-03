"use client";

import { ALL_PROVIDERS, PROVIDER_LABELS, type Provider } from "@/lib/api";
import {
  clearIibbRate,
  listIibbRateRows,
  setIibbRate,
  useIibbRatesEpoch,
  IIBB_SOURCE_LABEL,
} from "@/lib/iibb-rates";

export default function IibbRatesEditor() {
  useIibbRatesEpoch();
  const rows = listIibbRateRows(ALL_PROVIDERS as string[]);

  return (
    <div className="flex flex-col gap-2 pt-1">
      <p className="text-[11px] text-surface-500 leading-snug">
        Cada comercio tiene su alícuota: no hay un % fijo por distribuidor. Si el carrito o el
        portal la confirman, se completa sola y se usa en búsqueda, ficha y esquema. Offline no
        suma percepciones. Si no, cargala a mano (como en la factura). 0 = no sumar en este
        proveedor.
      </p>
      <div className="rounded-xl border border-surface-800 overflow-hidden">
        {rows.map((row) => (
          <div
            key={row.provider}
            className="flex items-center gap-2 px-3 py-2 border-b border-surface-800 last:border-b-0"
          >
            <span className="text-xs text-surface-200 min-w-0 flex-1 truncate">
              {PROVIDER_LABELS[row.provider as Provider] ?? row.label}
            </span>
            <span
              className={`text-[10px] flex-shrink-0 ${
                row.source === "cart"
                  ? "text-emerald-400/90"
                  : row.source === "manual"
                    ? "text-brand-300"
                    : "text-surface-600"
              }`}
            >
              {IIBB_SOURCE_LABEL[row.source]}
            </span>
            <div className="flex items-center gap-1 flex-shrink-0">
              <input
                type="number"
                min={0}
                max={100}
                step="0.1"
                inputMode="decimal"
                value={row.percent ?? ""}
                placeholder="—"
                onChange={(e) => {
                  const raw = e.target.value.trim();
                  if (raw === "") {
                    clearIibbRate(row.provider);
                    return;
                  }
                  const n = Number(raw.replace(",", "."));
                  if (!Number.isFinite(n)) return;
                  setIibbRate(row.provider, n, "manual");
                }}
                className="w-[4.5rem] bg-surface-800 border border-surface-700 rounded-md px-2 py-1 text-xs text-white tabular-nums text-right focus:outline-none focus:border-brand-500"
              />
              <span className="text-[10px] text-surface-500 w-4">%</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
