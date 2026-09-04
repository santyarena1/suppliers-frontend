"use client";

import { FileSpreadsheet, Plug } from "lucide-react";
import { isListProvider, type IvaAdjustment, type ProviderConfig } from "@/lib/api";
import { IVA_ADJUSTMENT_LABELS, IVA_ADJUSTMENTS, providerHasIvaRate, providerPricesFromList } from "@/lib/purchase-pricing";

const IVA_HELP: Record<IvaAdjustment, string> = {
  REMOVE: "El IVA pasa a 0. Los internos quedan.",
  HALF: "Si el producto tiene 21% de IVA, queda 10,5%. Si tiene 10,5%, queda 5,25%.",
  FLAT_10_5: "Todos los productos quedan con IVA 10,5%, da igual la alícuota original.",
};

const INPUT = "w-full bg-surface-800 border border-surface-700 rounded-lg px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-brand-500";

function IvaSelect({ value, onChange }: { value: IvaAdjustment | null; onChange: (next: IvaAdjustment | null) => void }) {
  return (
    <select value={value ?? ""} onChange={(e) => onChange((e.target.value || null) as IvaAdjustment | null)} className={INPUT}>
      <option value="">Elegí una opción</option>
      {IVA_ADJUSTMENTS.map((k) => (
        <option key={k} value={k}>{IVA_ADJUSTMENT_LABELS[k]}</option>
      ))}
    </select>
  );
}

function PercentInput({ value, onChange, placeholder }: { value: number | null; onChange: (next: number | null) => void; placeholder?: string }) {
  return (
    <input
      type="number"
      min={0}
      max={100}
      step="0.01"
      value={value ?? ""}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value === "" ? null : Number(e.target.value))}
      className={INPUT}
    />
  );
}

/**
 * Cómo le compra el comercio a este proveedor: por qué canal recibe los precios,
 * impuestos manuales cuando cotiza por lista, y offline / esquema.
 */
export default function ProviderPurchaseConfig({
  provider,
  config,
  onChange,
}: {
  provider: string;
  config: ProviderConfig;
  onChange: (next: ProviderConfig) => void;
}) {
  const listOnly = isListProvider(provider);
  const channel = config.priceChannel ?? (listOnly ? "LIST" : "API");
  const fromList = providerPricesFromList(provider, channel);
  const hasIva = providerHasIvaRate(provider, channel);

  return (
    <div className="flex flex-col gap-5">
      {/* Canal de precios */}
      <div className="border border-surface-800 rounded-xl p-5 flex flex-col gap-4">
        <div>
          <div className="text-sm font-semibold text-white">Canal de precios</div>
          <p className="text-xs text-surface-500 mt-1 leading-relaxed">
            {listOnly
              ? "Este proveedor no tiene integración: sus precios entran por la lista que subís en la pestaña Listas."
              : "Por API sincroniza solo con tu cuenta del portal. Por lista, subís vos la planilla que te mandan y el cron no toca este proveedor. Un solo canal activo a la vez."}
          </p>
        </div>
        {!listOnly && (
          <div className="grid grid-cols-2 gap-2">
            {(
              [
                { key: "API" as const, label: "API del proveedor", hint: "Credenciales + sincronización", icon: Plug },
                { key: "LIST" as const, label: "Lista de precios", hint: "Excel que subís vos", icon: FileSpreadsheet },
              ]
            ).map(({ key, label, hint, icon: Icon }) => (
              <button
                key={key}
                type="button"
                onClick={() => onChange({ ...config, priceChannel: key })}
                className={`text-left rounded-lg border px-3.5 py-3 flex items-start gap-2.5 transition-colors ${
                  channel === key ? "border-brand-500 bg-brand-500/10" : "border-surface-700 hover:border-surface-500"
                }`}
              >
                <Icon className={`w-4 h-4 mt-0.5 ${channel === key ? "text-brand-700 dark:text-brand-400" : "text-surface-500"}`} />
                <span>
                  <span className="block text-sm text-surface-100">{label}</span>
                  <span className="block text-[11px] text-surface-500">{hint}</span>
                </span>
              </button>
            ))}
          </div>
        )}
        {fromList && (
          <p className="text-[11px] text-surface-500">
            Con precios por lista, el carrito no compra en ningún portal: registra el pedido en Nodo y te deja el mensaje copiado para el vendedor.
          </p>
        )}
      </div>

      {/* Impuestos manuales */}
      {fromList && (
        <div className="border border-surface-800 rounded-xl p-5 flex flex-col gap-4">
          <div>
            <div className="text-sm font-semibold text-white">Impuestos que no vienen en la lista</div>
            <p className="text-xs text-surface-500 mt-1 leading-relaxed">
              El IVA sale de la lista. IIBB y otras percepciones las cargás acá, como porcentaje sobre el neto. Vacío = no se suma nada.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-surface-400 mb-1.5">IIBB (%)</label>
              <PercentInput value={config.manualIibbPercent} onChange={(v) => onChange({ ...config, manualIibbPercent: v })} placeholder="Ej: 3" />
            </div>
            <div>
              <label className="block text-xs font-medium text-surface-400 mb-1.5">Otras percepciones (%)</label>
              <PercentInput value={config.manualPerceptionsPercent} onChange={(v) => onChange({ ...config, manualPerceptionsPercent: v })} placeholder="Ej: 1,5" />
            </div>
          </div>
          <p className="text-[11px] text-surface-500">El pedido offline no lleva percepciones; lista y esquema sí.</p>
        </div>
      )}

      {/* Offline y esquema */}
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
            <IvaSelect value={config.offlineIvaAdjustment} onChange={(offlineIvaAdjustment) => onChange({ ...config, offlineIvaAdjustment })} />
            {config.offlineIvaAdjustment && <p className="text-[11px] text-surface-500 mt-1">{IVA_HELP[config.offlineIvaAdjustment]}</p>}
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
            <span className="block text-[11px] text-surface-500">
              Facturado. Percepciones sí. El descuento lo carga acá el comercio{fromList ? "" : "; al portal los ítems van sueltos"}.
            </span>
          </span>
        </label>

        {hasIva && config.acceptsScheme && (
          <div className="pl-7 flex flex-col gap-3">
            <div>
              <label className="block text-xs font-medium text-surface-400 mb-1.5">IVA del esquema</label>
              <IvaSelect value={config.schemeIvaAdjustment} onChange={(schemeIvaAdjustment) => onChange({ ...config, schemeIvaAdjustment })} />
              {config.schemeIvaAdjustment && <p className="text-[11px] text-surface-500 mt-1">{IVA_HELP[config.schemeIvaAdjustment]}</p>}
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
                className={INPUT}
              />
              <p className="text-[11px] text-surface-500 mt-1">
                Un solo % por distribuidor, el que te informó el vendedor. Solo aplica a ítems agrupados en un esquema, no a los sueltos del carrito.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
