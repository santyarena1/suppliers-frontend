"use client";

import { useEffect, useState } from "react";
import { Gift, Loader2, Plus, RefreshCw, Star, Trash2, Truck } from "lucide-react";
import { providersApi, type PortalShippingOptions, type Provider } from "@/lib/api";
import { formatARS, formatUSD } from "@/lib/format";
import {
  SHIPPING_CURRENCIES,
  shippingMethodId,
  useShippingEstimates,
  type LearnedShippingMethod,
  type ShippingCurrency,
  type ShippingMethod,
} from "@/lib/shipping";

const INPUT =
  "w-full bg-surface-800 border border-surface-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-brand-500";

function amountText(amount: number | null, currency: ShippingCurrency | null): string {
  if (amount == null) return "sin costo informado";
  return currency === "USD" ? formatUSD(amount) : formatARS(amount);
}

/**
 * Formas de envío del comercio con este distribuidor, con su valor por pedido.
 *
 * Con esto y lo que NODO aprende de los pedidos se estima el envío en la
 * búsqueda y en la ficha. Sirve sobre todo para los portales que no informan
 * el costo del envío. La que se marca como habitual manda sobre los pedidos.
 */
/** Lo que expone el portal del distribuidor, para cargarlo sin tipear. */
function usePortalShippingOptions(provider: string) {
  const [data, setData] = useState<PortalShippingOptions | null>(null);
  const [loading, setLoading] = useState(false);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let alive = true;
    setLoading(true);
    providersApi
      .shippingOptions(provider as Provider)
      .then((res) => alive && setData(res.data))
      .catch(() => alive && setData(null))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [provider, tick]);
  return { data, loading, reload: () => setTick((t) => t + 1) };
}

export default function ShippingMethodsEditor({
  provider,
  methods,
  onChange,
  freeShippingFrom = null,
  freeShippingCurrency = "ARS",
  onFreeShippingChange,
}: {
  provider: string;
  methods: ShippingMethod[];
  onChange: (next: ShippingMethod[]) => void;
  freeShippingFrom?: number | null;
  freeShippingCurrency?: ShippingCurrency | null;
  onFreeShippingChange?: (from: number | null, currency: ShippingCurrency) => void;
}) {
  const portal = usePortalShippingOptions(provider);
  const learned = useShippingEstimates()[provider]?.learned ?? null;
  const top = learned?.methods[0] ?? null;
  const known = new Set(methods.map((m) => m.id));

  function update(i: number, cambios: Partial<ShippingMethod>) {
    onChange(methods.map((m, j) => (j === i ? { ...m, ...cambios } : m)));
  }

  function toggleHabitual(i: number) {
    const on = !methods[i].habitual;
    onChange(methods.map((m, j) => ({ ...m, habitual: j === i ? on : false })));
  }

  function addPortalOption(o: PortalShippingOptions["options"][number]) {
    const label = o.group ? `${o.label} (${o.group})` : o.label;
    onChange([
      ...methods,
      { id: shippingMethodId(label), label, amount: o.amount ?? 0, currency: o.currency ?? "ARS", habitual: methods.length === 0 },
    ]);
  }

  function add(from?: LearnedShippingMethod) {
    onChange([
      ...methods,
      {
        id: from ? from.id : `nueva-${methods.length + 1}`,
        label: from?.label ?? "",
        amount: from?.lastAmount ?? 0,
        currency: from?.currency ?? "ARS",
        habitual: false,
      },
    ]);
  }

  return (
    <div className="border border-surface-800 rounded-xl p-5 flex flex-col gap-4">
      <div>
        <div className="text-sm font-semibold text-white flex items-center gap-2">
          <Truck className="w-4 h-4 text-surface-400" />
          Formas de envío
        </div>
        <p className="text-xs text-surface-500 mt-1 leading-relaxed">
          Cómo te llega lo que le comprás a este distribuidor y cuánto sale por pedido. Con esto la
          búsqueda muestra el envío aproximado de cada producto, repartido según tu carrito. NODO
          aprende de tus pedidos; acá cargás las que el portal no informa o corregís el valor. La que
          marques como habitual se usa siempre.
        </p>
      </div>

      {top && (
        <div className="rounded-lg border border-surface-800 bg-surface-900/60 px-3.5 py-3 text-xs text-surface-400 leading-relaxed">
          <span className="text-surface-200">Según tus pedidos:</span>{" "}
          {top.pickup
            ? `solés retirar (${top.orders} de ${learned?.orders} pedidos).`
            : `${top.label}, en ${top.orders} de ${learned?.orders} pedidos · último costo ${amountText(top.lastAmount, top.currency)}.`}
          {learned && learned.methods.length > 1 && (
            <span className="block mt-1 text-surface-500">
              También: {learned.methods.slice(1, 4).map((m) => `${m.label} (${m.orders})`).join(" · ")}
            </span>
          )}
          {!top.pickup && !known.has(top.id) && (
            <button
              type="button"
              onClick={() => add(top)}
              className="mt-2 inline-flex items-center gap-1.5 text-brand-300 hover:text-brand-200"
            >
              <Plus className="w-3.5 h-3.5" />
              {top.lastAmount == null ? "Cargarle el valor" : "Corregir el valor"}
            </button>
          )}
        </div>
      )}

      <div className="rounded-lg border border-surface-800 bg-surface-900/60 px-3.5 py-3 flex flex-col gap-2">
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-medium text-surface-200">Formas de envío del portal</span>
          <button
            type="button"
            onClick={portal.reload}
            disabled={portal.loading}
            className="inline-flex items-center gap-1 text-[11px] text-surface-400 hover:text-white disabled:opacity-40"
          >
            {portal.loading ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
            Actualizar
          </button>
        </div>
        {portal.loading && !portal.data ? (
          <p className="text-[11px] text-surface-500">Consultando al distribuidor…</p>
        ) : portal.data && portal.data.options.length > 0 ? (
          <ul className="flex flex-col divide-y divide-surface-800">
            {portal.data.options.map((o) => {
              const label = o.group ? `${o.label} (${o.group})` : o.label;
              const already = known.has(shippingMethodId(label));
              return (
                <li key={`${o.group ?? ""}-${o.id}`} className="flex items-center gap-2 py-1.5">
                  <span className="flex-1 min-w-0 text-xs text-surface-200">
                    {label}
                    {o.plazo && <span className="text-surface-500"> · {o.plazo}</span>}
                  </span>
                  <span className="text-xs tabular-nums text-surface-300">
                    {o.amount == null ? "sin costo informado" : o.amount === 0 ? "sin cargo" : amountText(o.amount, o.currency)}
                  </span>
                  <button
                    type="button"
                    onClick={() => addPortalOption(o)}
                    disabled={already}
                    className="text-[11px] font-medium text-brand-300 hover:text-brand-200 disabled:text-surface-600"
                  >
                    {already ? "Cargada" : "Usar esta"}
                  </button>
                </li>
              );
            })}
          </ul>
        ) : null}
        {portal.data?.note && <p className="text-[11px] text-surface-500 leading-relaxed">{portal.data.note}</p>}
      </div>

      {methods.length === 0 ? (
        <p className="text-xs text-surface-500">
          {top ? "No cargaste ninguna: se usa lo que sale de tus pedidos." : "Todavía no hay pedidos ni formas de envío cargadas para este distribuidor."}
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          {methods.map((m, i) => (
            <div key={`${m.id}-${i}`} className="flex flex-wrap sm:flex-nowrap items-center gap-2">
              <input
                value={m.label}
                onChange={(e) => update(i, { label: e.target.value, id: shippingMethodId(e.target.value) })}
                placeholder="Moto, expreso, comisionista…"
                maxLength={60}
                className={`${INPUT} flex-1 min-w-[10rem]`}
              />
              <select
                value={m.currency}
                onChange={(e) => update(i, { currency: e.target.value as ShippingCurrency })}
                className={`${INPUT} w-20 flex-shrink-0`}
                aria-label="Moneda"
              >
                {SHIPPING_CURRENCIES.map((c) => (
                  <option key={c} value={c}>
                    {c === "ARS" ? "$" : "US$"}
                  </option>
                ))}
              </select>
              <input
                type="number"
                min={0}
                step="1"
                value={m.amount}
                onChange={(e) => update(i, { amount: Math.max(0, Number(e.target.value) || 0) })}
                className={`${INPUT} w-28 text-right tabular-nums flex-shrink-0`}
                aria-label="Costo por pedido"
              />
              <button
                type="button"
                onClick={() => toggleHabitual(i)}
                aria-pressed={m.habitual}
                title={m.habitual ? "Es la habitual: se usa para estimar" : "Usar siempre esta para estimar"}
                className={`flex-shrink-0 inline-flex items-center gap-1 rounded-lg border px-2.5 py-2 text-[11px] transition-colors ${
                  m.habitual
                    ? "border-brand-500 bg-brand-500/10 text-brand-300"
                    : "border-surface-700 text-surface-500 hover:text-surface-300"
                }`}
              >
                <Star className={`w-3.5 h-3.5 ${m.habitual ? "fill-current" : ""}`} />
                Habitual
              </button>
              <button
                type="button"
                onClick={() => onChange(methods.filter((_, j) => j !== i))}
                aria-label={`Quitar ${m.label || "forma de envío"}`}
                className="flex-shrink-0 p-2 rounded-lg text-surface-500 hover:text-rose-300 hover:bg-surface-800 transition-colors"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}

      <button
        type="button"
        onClick={() => add()}
        className="self-start inline-flex items-center gap-1.5 text-xs text-brand-300 hover:text-brand-200 transition-colors"
      >
        <Plus className="w-3.5 h-3.5" />
        Agregar forma de envío
      </button>
      {onFreeShippingChange && (
        <div className="rounded-lg border border-surface-800 px-3.5 py-3 flex flex-col gap-2">
          <label className="text-xs font-medium text-surface-200 flex items-center gap-1.5">
            <Gift className="w-3.5 h-3.5 text-emerald-300" />
            Envío gratis desde
          </label>
          <div className="flex items-center gap-2">
            <select
              value={freeShippingCurrency ?? "ARS"}
              onChange={(e) => onFreeShippingChange(freeShippingFrom, e.target.value as ShippingCurrency)}
              className={`${INPUT} w-20 flex-shrink-0`}
              aria-label="Moneda del envío gratis"
            >
              {SHIPPING_CURRENCIES.map((c) => (
                <option key={c} value={c}>
                  {c === "ARS" ? "$" : "US$"}
                </option>
              ))}
            </select>
            <input
              type="number"
              min={0}
              step="1"
              value={freeShippingFrom ?? ""}
              placeholder="Sin envío gratis"
              onChange={(e) => {
                const n = Number(e.target.value);
                onFreeShippingChange(e.target.value === "" || !(n > 0) ? null : n, freeShippingCurrency ?? "ARS");
              }}
              className={`${INPUT} w-40 text-right tabular-nums`}
              aria-label="Monto mínimo del pedido para envío gratis"
            />
          </div>
          <p className="text-[11px] text-surface-500 leading-relaxed">
            Si el pedido a este distribuidor llega a este monto (total con IVA, como en el carrito), tus formas de
            envío quedan en $0 en la búsqueda, la ficha y el carrito. No cambia el envío que cotiza el portal del
            distribuidor: ese lo cobra él.
          </p>
        </div>
      )}

      <p className="text-[11px] text-surface-500">
        El costo es por pedido. Cómo se reparte entre los productos lo elegís en Configuración → Preferencias.
        Los valores son aproximados: el costo real lo da el distribuidor al confirmar.
      </p>
    </div>
  );
}
