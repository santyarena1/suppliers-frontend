"use client";

import { usePrefs, DollarType } from "@/lib/prefs";
import { DollarSign, RefreshCw, Receipt, Check } from "lucide-react";
import { useState, useRef, useEffect } from "react";

export default function PrefsPanel() {
  const { currency, setCurrency, withIva, setWithIva, dollarType, setDollarType, rates, currentRate, refreshRates, loadingRates, dollarLabel } = usePrefs();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 text-xs font-medium text-surface-300 hover:text-white bg-surface-800 hover:bg-surface-700 border border-surface-700 rounded-lg px-3 py-1.5 transition-all"
      >
        <DollarSign className="w-3.5 h-3.5 text-emerald-400" />
        <span className="tabular-nums">
          {currency} · {dollarLabel(dollarType)}
        </span>
        {currentRate && currency === "ARS" && (
          <span className="text-surface-500 text-[10px]">
            ${currentRate.venta.toLocaleString("es-AR")}
          </span>
        )}
        {withIva ? (
          <span className="bg-brand-600/20 text-brand-400 text-[10px] font-semibold px-1.5 py-0.5 rounded">IVA</span>
        ) : (
          <span className="bg-surface-700 text-surface-400 text-[10px] font-semibold px-1.5 py-0.5 rounded">s/IVA</span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-80 bg-surface-900 border border-surface-700 rounded-xl shadow-2xl z-50 overflow-hidden">
          <div className="px-4 py-3 border-b border-surface-800 flex items-center justify-between">
            <h3 className="text-xs font-semibold text-white uppercase tracking-wider">Preferencias</h3>
            <button
              onClick={refreshRates}
              disabled={loadingRates}
              className="text-surface-500 hover:text-white transition-colors"
              title="Actualizar cotizaciones"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loadingRates ? "animate-spin" : ""}`} />
            </button>
          </div>

          <div className="p-4 flex flex-col gap-4">
            {/* Currency */}
            <div>
              <label className="block text-[10px] font-semibold text-surface-500 uppercase tracking-wider mb-1.5">Moneda</label>
              <div className="grid grid-cols-2 gap-1.5">
                {(["ARS", "USD"] as const).map((c) => (
                  <button
                    key={c}
                    onClick={() => setCurrency(c)}
                    className={`flex items-center justify-center gap-1.5 text-xs font-medium py-2 rounded-lg border transition-all ${
                      currency === c
                        ? "bg-brand-600/15 border-brand-500 text-brand-400"
                        : "border-surface-700 text-surface-400 hover:text-surface-200"
                    }`}
                  >
                    {currency === c && <Check className="w-3 h-3" />}
                    {c}
                  </button>
                ))}
              </div>
            </div>

            {/* Dollar type */}
            <div>
              <label className="block text-[10px] font-semibold text-surface-500 uppercase tracking-wider mb-1.5">Tipo de dólar</label>
              <div className="grid grid-cols-3 gap-1.5">
                {(["oficial", "blue", "mep", "tarjeta", "cripto", "mayorista"] as DollarType[]).map((t) => {
                  const r = rates.find((rt) => rt.type === t);
                  return (
                    <button
                      key={t}
                      onClick={() => setDollarType(t)}
                      className={`flex flex-col items-start text-left text-[10px] font-medium px-2 py-1.5 rounded-lg border transition-all ${
                        dollarType === t
                          ? "bg-brand-600/15 border-brand-500 text-brand-400"
                          : "border-surface-700 text-surface-400 hover:text-surface-200"
                      }`}
                    >
                      <span className="font-semibold">{dollarLabel(t)}</span>
                      {r && <span className="text-[9px] text-surface-500 tabular-nums">${r.venta.toLocaleString("es-AR")}</span>}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* IVA */}
            <div>
              <label className="block text-[10px] font-semibold text-surface-500 uppercase tracking-wider mb-1.5">Impuestos</label>
              <button
                onClick={() => setWithIva(!withIva)}
                className="w-full flex items-center justify-between bg-surface-800 hover:bg-surface-700 border border-surface-700 rounded-lg px-3 py-2 transition-all"
              >
                <div className="flex items-center gap-2">
                  <Receipt className="w-3.5 h-3.5 text-surface-400" />
                  <span className="text-xs text-surface-200">Mostrar con impuestos</span>
                </div>
                <div className={`w-8 h-4 rounded-full relative transition-colors ${withIva ? "bg-brand-600" : "bg-surface-600"}`}>
                  <div className={`absolute top-0.5 w-3 h-3 bg-white rounded-full transition-all ${withIva ? "left-4" : "left-0.5"}`} />
                </div>
              </button>
            </div>

            {currentRate && (
              <div className="text-[10px] text-surface-500 border-t border-surface-800 pt-3 -mx-4 px-4">
                Cotización actualizada: {new Date(currentRate.fechaActualizacion).toLocaleString("es-AR", { dateStyle: "short", timeStyle: "short" })}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
