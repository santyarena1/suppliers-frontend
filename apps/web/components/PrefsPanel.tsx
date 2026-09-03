"use client";

import { usePrefs, DollarType } from "@/lib/prefs";
import { knownIibbRatesHint, useIibbRatesEpoch } from "@/lib/iibb-rates";
import { tenantSeesIibbPerceptions } from "@/lib/auth";
import { DollarSign, RefreshCw, Receipt, Check, Percent } from "lucide-react";
import { useState, useRef, useEffect } from "react";
import Link from "next/link";

export default function PrefsPanel() {
  const {
    currency, setCurrency, withIva, setWithIva, withIibb, setWithIibb,
    dollarType, setDollarType, rates, currentRate, refreshRates, loadingRates, dollarLabel,
  } = usePrefs();
  const [seesIibb, setSeesIibb] = useState(false);
  useIibbRatesEpoch();
  useEffect(() => {
    setSeesIibb(tenantSeesIibbPerceptions());
  }, []);
  const iibbHint = seesIibb ? knownIibbRatesHint() : "";
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
          {currency}
          <span className="hidden sm:inline"> · {dollarLabel(dollarType)}</span>
        </span>
        {currentRate && currency === "ARS" && (
          <span className="hidden sm:inline text-surface-500 text-[10px]">
            ${currentRate.venta.toLocaleString("es-AR")}
          </span>
        )}
        <span className="hidden sm:inline bg-brand-600/20 text-brand-400 text-[10px] font-semibold px-1.5 py-0.5 rounded">
          {withIva ? "IVA" : "s/IVA"}
        </span>
        {seesIibb && withIibb && (
          <span className="hidden sm:inline bg-amber-500/20 text-amber-300 text-[10px] font-semibold px-1.5 py-0.5 rounded">
            IIBB
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-[min(20rem,calc(100vw-1.5rem))] bg-surface-900 border border-surface-700 rounded-xl shadow-2xl z-50 overflow-hidden">
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

            {/* IVA / IIBB */}
            <div className="flex flex-col gap-1.5">
              <label className="block text-[10px] font-semibold text-surface-500 uppercase tracking-wider">Impuestos</label>
              <button
                type="button"
                onClick={() => setWithIva(!withIva)}
                className="w-full flex items-center justify-between bg-surface-800 hover:bg-surface-700 border border-surface-700 rounded-lg px-3 py-2 transition-all"
              >
                <div className="flex items-center gap-2">
                  <Receipt className="w-3.5 h-3.5 text-surface-400" />
                  <span className="text-xs text-surface-200">Mostrar con IVA</span>
                </div>
                <div className={`w-8 h-4 rounded-full relative transition-colors ${withIva ? "bg-brand-600" : "bg-surface-600"}`}>
                  <div className={`absolute top-0.5 w-3 h-3 bg-white rounded-full transition-all ${withIva ? "left-4" : "left-0.5"}`} />
                </div>
              </button>
              {seesIibb && (
              <button
                type="button"
                onClick={() => setWithIibb(!withIibb)}
                className="w-full flex items-center justify-between border rounded-lg px-3 py-2 transition-all bg-surface-800 hover:bg-surface-700 border-surface-700"
                title={iibbHint}
              >
                <div className="flex items-center gap-2 min-w-0">
                  <Percent className="w-3.5 h-3.5 text-surface-400 flex-shrink-0" />
                  <div className="text-left min-w-0">
                    <span className="text-xs text-surface-200 block">Incluir percepciones / IIBB</span>
                    <span className="text-[10px] text-surface-500 leading-tight block">
                      Independiente del IVA. {iibbHint || "Cargá las alícuotas en Configuración."}
                    </span>
                  </div>
                </div>
                <div className={`w-8 h-4 rounded-full relative transition-colors flex-shrink-0 ${withIibb ? "bg-brand-600" : "bg-surface-600"}`}>
                  <div className={`absolute top-0.5 w-3 h-3 bg-white rounded-full transition-all ${withIibb ? "left-4" : "left-0.5"}`} />
                </div>
              </button>
              )}
              {seesIibb && (
              <Link
                href="/configuracion"
                className="text-[10px] text-brand-400 hover:text-brand-300 px-0.5"
                onClick={() => setOpen(false)}
              >
                Editar alícuotas de este comercio
              </Link>
              )}
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
