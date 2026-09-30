"use client";

import { useEffect, useState } from "react";
import { Filter, Truck } from "lucide-react";
import { usePrefs, type SearchDefaults } from "@/lib/prefs";
import { isRetailerSession } from "@/lib/purchase";
import { SHIPPING_DISCLAIMER, SHIPPING_SPLIT_LABELS, SHIPPING_SPLITS } from "@/lib/shipping";

function Toggle({
  on,
  onClick,
  title,
  hint,
}: {
  on: boolean;
  onClick: () => void;
  title: string;
  hint: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      className="w-full flex items-center justify-between gap-3 bg-surface-800 hover:bg-surface-700 border border-surface-700 rounded-xl px-4 py-3 text-left transition-all"
    >
      <span className="min-w-0">
        <span className="text-sm text-surface-200 block">{title}</span>
        <span className="text-[11px] text-surface-500 leading-snug block mt-0.5">{hint}</span>
      </span>
      <span className={`w-9 h-5 rounded-full relative transition-colors flex-shrink-0 ${on ? "bg-brand-600" : "bg-surface-600"}`}>
        <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full transition-all shadow-sm ${on ? "left-4" : "left-0.5"}`} />
      </span>
    </button>
  );
}

/**
 * Con qué filtros arranca la búsqueda y cómo se reparte el envío estimado.
 * Tocar un filtro en la búsqueda no cambia esto: acá se elige el punto de partida.
 */
export default function SearchDefaultsSettings() {
  const { searchDefaults, setSearchDefault, shippingSplit, setShippingSplit } = usePrefs();
  const [retailer, setRetailer] = useState(false);
  useEffect(() => setRetailer(isRetailerSession()), []);
  if (!retailer) return null;

  function set(key: keyof SearchDefaults, value: boolean) {
    setSearchDefault(key, value);
    // Offline y esquema son dos vistas de precio distintas: no pueden arrancar las dos.
    if (value && key === "offline") setSearchDefault("scheme", false);
    if (value && key === "scheme") setSearchDefault("offline", false);
  }

  return (
    <>
      <section className="bg-surface-900 border border-surface-800 rounded-2xl p-5">
        <div className="flex items-center gap-2 mb-1">
          <Truck className="w-4 h-4 text-brand-400" />
          <h2 className="text-sm font-semibold text-white">Envío estimado</h2>
        </div>
        <p className="text-xs text-surface-500 mb-4 leading-relaxed">
          NODO aprende cómo te llega lo que le comprás a cada distribuidor y cuánto sale, y lo muestra
          en la búsqueda. Las formas de envío y su valor se cargan en Proveedores → el distribuidor →
          Configuración. {SHIPPING_DISCLAIMER}
        </p>
        <label className="block text-[10px] font-semibold text-surface-500 uppercase tracking-wider mb-2">
          Cómo se reparte el envío de un pedido
        </label>
        <div className="grid gap-2 sm:grid-cols-3">
          {SHIPPING_SPLITS.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setShippingSplit(s)}
              aria-pressed={shippingSplit === s}
              className={`text-left rounded-xl border px-3.5 py-3 transition-colors ${
                shippingSplit === s
                  ? "border-brand-500 bg-brand-500/10"
                  : "border-surface-700 hover:border-surface-500"
              }`}
            >
              <span className="block text-sm text-surface-100">{SHIPPING_SPLIT_LABELS[s].label}</span>
              <span className="block text-[11px] text-surface-500 leading-snug mt-1">{SHIPPING_SPLIT_LABELS[s].hint}</span>
            </button>
          ))}
        </div>
      </section>

      <section className="bg-surface-900 border border-surface-800 rounded-2xl p-5">
        <div className="flex items-center gap-2 mb-1">
          <Filter className="w-4 h-4 text-brand-400" />
          <h2 className="text-sm font-semibold text-white">Filtros al entrar a la búsqueda</h2>
        </div>
        <p className="text-xs text-surface-500 mb-4 leading-relaxed">
          Cómo arranca cada filtro. En la búsqueda los podés prender y apagar igual; esto solo elige el punto de partida.
        </p>
        <div className="flex flex-col gap-2">
          <Toggle
            on={searchDefaults.shipping}
            onClick={() => set("shipping", !searchDefaults.shipping)}
            title="Incluir envío"
            hint="Prendido, el precio suma el envío estimado. Apagado, el envío aparece debajo del precio solo como referencia."
          />
          <Toggle
            on={searchDefaults.offline}
            onClick={() => set("offline", !searchDefaults.offline)}
            title="Precios offline"
            hint="Con los distribuidores que te aceptan pedido offline."
          />
          <Toggle
            on={searchDefaults.scheme}
            onClick={() => set("scheme", !searchDefaults.scheme)}
            title="Precios esquema"
            hint="Con los distribuidores que te venden en esquema."
          />
          <Toggle
            on={searchDefaults.outOfStock}
            onClick={() => set("outOfStock", !searchDefaults.outOfStock)}
            title="Incluir sin stock"
            hint="Listar también los productos con stock 0."
          />
        </div>
      </section>
    </>
  );
}
