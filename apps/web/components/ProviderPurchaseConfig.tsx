"use client";

import type { IvaAdjustment, ProviderConfig } from "@/lib/api";
import { IVA_ADJUSTMENT_LABELS, IVA_ADJUSTMENTS } from "@/lib/purchase-pricing";

const IVA_HELP: Record<IvaAdjustment, string> = {
  REMOVE: "El IVA pasa a 0. Internos y percepciones quedan.",
  HALF: "Si el producto tiene 21% de IVA, queda 10,5%. Si tiene 10,5%, queda 5,25%.",
  FLAT_10_5: "Todos los productos quedan con IVA 10,5%, da igual la alícuota original.",
};

export default function ProviderPurchaseConfig({
  config,
  onChange,
}: {
  config: ProviderConfig;
  onChange: (next: ProviderConfig) => void;
}) {
  const needsIva = config.acceptsOffline || config.acceptsScheme;

  return (
    <div className="border border-surface-800 rounded-xl p-5 flex flex-col gap-4">
      <div>
        <div className="text-sm font-semibold text-white">Pedido offline y esquema</div>
        <p className="text-xs text-surface-500 mt-1 leading-relaxed">
          Lo carga el comercio según lo que le dijo el vendedor de este distribuidor.
          Offline es compra sin facturar (antes “.com”). Esquema es facturado, con un descuento extra que te informa el vendedor.
        </p>
      </div>

      <label className="flex items-start gap-3 cursor-pointer">
        <input
          type="checkbox"
          checked={Boolean(config.acceptsOffline)}
          onChange={(e) => onChange({ ...config, acceptsOffline: e.target.checked })}
          className="mt-0.5 rounded border-surface-600"
        />
        <span>
          <span className="text-sm text-surface-100">Acepta pedidos offline</span>
          <span className="block text-[11px] text-surface-500">Sin facturar. Solo se arma un mensaje para el vendedor, no se carga en el portal.</span>
        </span>
      </label>

      <label className="flex items-start gap-3 cursor-pointer">
        <input
          type="checkbox"
          checked={Boolean(config.acceptsScheme)}
          onChange={(e) => onChange({ ...config, acceptsScheme: e.target.checked })}
          className="mt-0.5 rounded border-surface-600"
        />
        <span>
          <span className="text-sm text-surface-100">Acepta compras en esquema</span>
          <span className="block text-[11px] text-surface-500">Facturado. El descuento lo carga acá el comercio; al portal los ítems van sueltos.</span>
        </span>
      </label>

      {needsIva && (
        <div>
          <label className="block text-xs font-medium text-surface-400 mb-1.5">Tratamiento del IVA</label>
          <select
            value={config.ivaAdjustment ?? ""}
            onChange={(e) =>
              onChange({ ...config, ivaAdjustment: (e.target.value || null) as IvaAdjustment | null })
            }
            className="w-full bg-surface-800 border border-surface-700 rounded-lg px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-brand-500"
          >
            <option value="">Elegí una opción</option>
            {IVA_ADJUSTMENTS.map((k) => (
              <option key={k} value={k}>{IVA_ADJUSTMENT_LABELS[k]}</option>
            ))}
          </select>
          {config.ivaAdjustment && (
            <p className="text-[11px] text-surface-500 mt-1">{IVA_HELP[config.ivaAdjustment]}</p>
          )}
          <p className="text-[11px] text-surface-600 mt-1">
            Misma regla para offline y para esquema. Solo se recalcula IVA; internos y percepciones no se tocan.
          </p>
        </div>
      )}

      {config.acceptsScheme && (
        <div>
          <label className="block text-xs font-medium text-surface-400 mb-1.5">Descuento de esquema (%)</label>
          <input
            type="number"
            min={0}
            max={100}
            step="0.1"
            value={config.schemeDiscountPercent ?? 0}
            onChange={(e) => onChange({ ...config, schemeDiscountPercent: e.target.value === "" ? 0 : Number(e.target.value) })}
            className="w-full bg-surface-800 border border-surface-700 rounded-lg px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-brand-500"
          />
          <p className="text-[11px] text-surface-500 mt-1">
            Se aplica sobre el neto y después el IVA. Es el % que te informó el vendedor, no el del vínculo con el distribuidor.
          </p>
        </div>
      )}
    </div>
  );
}
