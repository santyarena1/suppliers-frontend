"use client";

import type { IvaAdjustment, ProviderConfig } from "@/lib/api";
import { IVA_ADJUSTMENT_LABELS, IVA_ADJUSTMENTS, providerHasIvaRate } from "@/lib/purchase-pricing";

const IVA_HELP: Record<IvaAdjustment, string> = {
  REMOVE: "El IVA pasa a 0. Los internos quedan.",
  HALF: "Si el producto tiene 21% de IVA, queda 10,5%. Si tiene 10,5%, queda 5,25%.",
  FLAT_10_5: "Todos los productos quedan con IVA 10,5%, da igual la alícuota original.",
};

function IvaSelect({
  value,
  onChange,
}: {
  value: IvaAdjustment | null;
  onChange: (next: IvaAdjustment | null) => void;
}) {
  return (
    <select
      value={value ?? ""}
      onChange={(e) => onChange((e.target.value || null) as IvaAdjustment | null)}
      className="w-full bg-surface-800 border border-surface-700 rounded-lg px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-brand-500"
    >
      <option value="">Elegí una opción</option>
      {IVA_ADJUSTMENTS.map((k) => (
        <option key={k} value={k}>{IVA_ADJUSTMENT_LABELS[k]}</option>
      ))}
    </select>
  );
}

export default function ProviderPurchaseConfig({
  provider,
  config,
  onChange,
}: {
  provider: string;
  config: ProviderConfig;
  onChange: (next: ProviderConfig) => void;
}) {
  const hasIva = providerHasIvaRate(provider);

  return (
    <div className="border border-surface-800 rounded-xl p-5 flex flex-col gap-4">
      <div>
        <div className="text-sm font-semibold text-white">Pedido offline y esquema</div>
        <p className="text-xs text-surface-500 mt-1 leading-relaxed">
          Lo carga el comercio según lo que le dijo el vendedor de este distribuidor.
          Offline es compra sin facturar (antes “.com”). Esquema es facturado, con un descuento extra que te informa el vendedor.
        </p>
      </div>

      {!hasIva && (
        <p className="text-xs text-amber-200/90 bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-2">
          Este distribuidor no informa alícuota de IVA. Offline y esquema quedan deshabilitados: no se inventa 21%, 0% ni 10,5%.
        </p>
      )}

      <label className={`flex items-start gap-3 ${hasIva ? "cursor-pointer" : "opacity-50"}`}>
        <input
          type="checkbox"
          checked={Boolean(config.acceptsOffline) && hasIva}
          disabled={!hasIva}
          onChange={(e) => onChange({ ...config, acceptsOffline: e.target.checked })}
          className="mt-0.5 rounded border-surface-600"
        />
        <span>
          <span className="text-sm text-surface-100">Acepta pedidos offline</span>
          <span className="block text-[11px] text-surface-500">Sin facturar. Sin percepciones (IIBB). Los internos sí se cobran. Solo se arma un mensaje para el vendedor.</span>
        </span>
      </label>

      {hasIva && config.acceptsOffline && (
        <div className="pl-7">
          <label className="block text-xs font-medium text-surface-400 mb-1.5">IVA del pedido offline</label>
          <IvaSelect
            value={config.offlineIvaAdjustment}
            onChange={(offlineIvaAdjustment) => onChange({ ...config, offlineIvaAdjustment })}
          />
          {config.offlineIvaAdjustment && (
            <p className="text-[11px] text-surface-500 mt-1">{IVA_HELP[config.offlineIvaAdjustment]}</p>
          )}
        </div>
      )}

      <label className={`flex items-start gap-3 ${hasIva ? "cursor-pointer" : "opacity-50"}`}>
        <input
          type="checkbox"
          checked={Boolean(config.acceptsScheme) && hasIva}
          disabled={!hasIva}
          onChange={(e) => onChange({ ...config, acceptsScheme: e.target.checked })}
          className="mt-0.5 rounded border-surface-600"
        />
        <span>
          <span className="text-sm text-surface-100">Acepta compras en esquema</span>
          <span className="block text-[11px] text-surface-500">Facturado. Percepciones sí. El descuento lo carga acá el comercio; al portal los ítems van sueltos.</span>
        </span>
      </label>

      {hasIva && config.acceptsScheme && (
        <div className="pl-7 flex flex-col gap-3">
          <div>
            <label className="block text-xs font-medium text-surface-400 mb-1.5">IVA del esquema</label>
            <IvaSelect
              value={config.schemeIvaAdjustment}
              onChange={(schemeIvaAdjustment) => onChange({ ...config, schemeIvaAdjustment })}
            />
            {config.schemeIvaAdjustment && (
              <p className="text-[11px] text-surface-500 mt-1">{IVA_HELP[config.schemeIvaAdjustment]}</p>
            )}
          </div>
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
              Un solo % por distribuidor, el que te informó el vendedor. Solo aplica a ítems agrupados en un esquema, no a los sueltos del carrito online.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
