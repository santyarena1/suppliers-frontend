"use client";

import { useMemo } from "react";
import type {
  ApiClientConfig,
  CatalogApiCurrency,
  CatalogApiFxRate,
  CatalogApiRounding,
  CatalogApiView,
} from "@/lib/catalog-api";
import { Field, Segmented, Toggle, inputClass } from "./ui";

const ROUNDING: { value: CatalogApiRounding; label: string }[] = [
  { value: "none", label: "Sin redondeo" },
  { value: "0.01", label: "Centavos" },
  { value: "1", label: "Entero" },
  { value: "10", label: "Múltiplo de 10" },
  { value: "99", label: "Termina en ,99" },
];

const FX: { value: CatalogApiFxRate; label: string }[] = [
  { value: "oficial", label: "Oficial" },
  { value: "blue", label: "Blue" },
  { value: "mep", label: "MEP" },
  { value: "tarjeta", label: "Tarjeta" },
  { value: "fixed", label: "Fija" },
];

/** Cotizaciones de ejemplo solo para la vista previa: la API usa las del día. */
const SAMPLE_FX: Record<Exclude<CatalogApiFxRate, "fixed">, number> = {
  oficial: 1450,
  blue: 1480,
  mep: 1465,
  tarjeta: 1885,
};

function round(value: number, mode: CatalogApiRounding): number {
  switch (mode) {
    case "0.01":
      return Math.round(value * 100) / 100;
    case "1":
      return Math.round(value);
    case "10":
      return Math.round(value / 10) * 10;
    case "99":
      return Math.max(0, Math.ceil(value) - 0.01);
    default:
      return Math.round(value * 10000) / 10000;
  }
}

/** Oferta de ejemplo armada con la config, igual que la arma la API. */
export function sampleOffer(config: ApiClientConfig, providerLabel: string) {
  const p = config.price;
  const rate =
    p.currency === "USD" ? 1 : p.fxRate === "fixed" ? (p.fxFixed && p.fxFixed > 0 ? p.fxFixed : 0) : SAMPLE_FX[p.fxRate];
  const net = 100 * rate;
  const taxes = [
    { type: "iva", label: "IVA", percent: 10.5, amount: round(net * 0.105, "0.01") },
    { type: "perception", label: "Percepción IIBB", percent: 3, amount: round(net * 0.03, "0.01") },
  ];
  const gross = net + taxes.reduce((s, t) => s + t.amount, 0);
  const markup = p.markup.mode === "fixed" ? p.markup.percent ?? 0 : 20;
  const saleNet = round(net * (1 + markup / 100), p.rounding);
  const saleGross = round(gross * (1 + markup / 100), p.rounding);

  const price: Record<string, unknown> = { currency: p.currency };
  if (p.includeCost) {
    price.cost = p.includeTaxes ? { net: round(net, "0.01"), taxes, gross: round(gross, "0.01") } : { net: round(net, "0.01") };
  }
  if (p.includeSalePrice) {
    price.sale = p.includeTaxes ? { net: saleNet, gross: saleGross, markupPercent: markup } : { net: saleNet, markupPercent: markup };
  }
  price.listSource = "api";

  const visible = config.providerIdentity === "visible";
  const offer: Record<string, unknown> = {
    id: "off_8hQ2vX1mT9cLk3PzR7aB4n",
    productId: "prd_Yt5Wc9KqA2mN7xV1pL3sD8",
    provider: visible ? { id: "prv_3Jd8sK2qLm9xV0aT", name: providerLabel } : { id: "prv_3Jd8sK2qLm9xV0aT", name: "Proveedor 1" },
    sku: "90YV0K90-M0NA00",
    ...(visible ? { externalId: "19922" } : {}),
    stock: { quantity: 12, status: "in_stock", minThresholdApplied: config.minStock },
    price,
    freshness: { syncedAt: "2026-10-05T14:32:10Z", stale: false, providerSync: "ok" },
  };
  if (config.fields.raw) offer.raw = { "…": "datos crudos del distribuidor" };
  return offer;
}

/** Configuración de una key: qué entra, cómo se ve el precio y qué campos salen. */
export default function ConfigEditor({
  value,
  onChange,
  providers,
  readOnly,
}: {
  value: ApiClientConfig;
  onChange: (next: ApiClientConfig) => void;
  providers: { key: string; label: string }[];
  readOnly?: boolean;
}) {
  const set = (patch: Partial<ApiClientConfig>) => onChange({ ...value, ...patch });
  const setPrice = (patch: Partial<ApiClientConfig["price"]>) => onChange({ ...value, price: { ...value.price, ...patch } });
  const preview = useMemo(
    () => JSON.stringify(sampleOffer(value, providers[0]?.label ?? "Elit"), null, 2),
    [value, providers]
  );

  function toggleProvider(key: string) {
    const keys = value.providers.keys.includes(key)
      ? value.providers.keys.filter((k) => k !== key)
      : [...value.providers.keys, key];
    set({ providers: { mode: "only", keys } });
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.85fr)]">
      <div className="flex flex-col gap-6">
        <Section title="Qué devuelve">
          <Field label="Vista por defecto" hint="Se puede cambiar en cada pedido con ?view=. Agrupado une el mismo producto (EAN o marca + part number) de varios distribuidores.">
            <Segmented<CatalogApiView>
              value={value.defaultView}
              disabled={readOnly}
              onChange={(v) => set({ defaultView: v })}
              options={[
                { value: "products", label: "Agrupado por producto" },
                { value: "offers", label: "Una fila por distribuidor" },
              ]}
            />
          </Field>
          <Field label="Distribuidores">
            <Segmented<"all" | "only">
              value={value.providers.mode}
              disabled={readOnly}
              onChange={(mode) => set({ providers: { mode, keys: mode === "all" ? [] : value.providers.keys } })}
              options={[
                { value: "all", label: "Todos los que tengo" },
                { value: "only", label: "Solo estos" },
              ]}
            />
            {value.providers.mode === "only" && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {providers.length === 0 && <span className="text-[11px] text-surface-500">Todavía no tenés distribuidores configurados.</span>}
                {providers.map((p) => {
                  const on = value.providers.keys.includes(p.key);
                  return (
                    <button
                      key={p.key}
                      type="button"
                      disabled={readOnly}
                      onClick={() => toggleProvider(p.key)}
                      aria-pressed={on}
                      className={`h-7 px-2.5 rounded-md border text-[11px] font-medium transition-colors ${
                        on ? "border-brand-500 bg-brand-500/10 text-white" : "border-surface-700 text-surface-400 hover:text-white"
                      }`}
                    >
                      {p.label}
                    </button>
                  );
                })}
              </div>
            )}
          </Field>
          <Field
            label="Nombre del distribuidor"
            hint={
              value.providerIdentity === "hidden"
                ? "Sale como «Proveedor 1, 2…» con un id que no cambia. Recomendado si la key alimenta una web pública."
                : "Sale el nombre real y el código del distribuidor. Para tu ERP o uso interno."
            }
          >
            <Segmented<"hidden" | "visible">
              value={value.providerIdentity}
              disabled={readOnly}
              onChange={(v) => set({ providerIdentity: v })}
              options={[
                { value: "hidden", label: "Oculto" },
                { value: "visible", label: "Visible" },
              ]}
            />
          </Field>
        </Section>

        <Section title="Stock">
          <Toggle
            checked={value.includeOutOfStock}
            disabled={readOnly}
            onChange={(v) => set({ includeOutOfStock: v })}
            label="Incluir productos sin stock"
            hint="Apagado, un producto que se queda sin stock sale como «removed» en los cambios y los webhooks."
          />
          <Field label="Stock mínimo para mostrar" hint="Además del mínimo que tenés configurado en cada distribuidor.">
            <input
              type="number"
              min={0}
              disabled={readOnly}
              value={value.minStock}
              onChange={(e) => set({ minStock: Math.max(0, Math.floor(Number(e.target.value) || 0)) })}
              className={`${inputClass} max-w-[120px]`}
            />
          </Field>
        </Section>

        <Section title="Precio">
          <div className="flex flex-col gap-3">
            <Toggle checked={value.price.includeCost} disabled={readOnly} onChange={(v) => setPrice({ includeCost: v })} label="Costo del distribuidor" hint="Lo que te cobra el distribuidor. Apagalo si la key va a una web pública." />
            <Toggle checked={value.price.includeTaxes} disabled={readOnly} onChange={(v) => setPrice({ includeTaxes: v })} label="Impuestos desglosados" hint="IVA, impuestos internos y tus percepciones, con alícuota y monto." />
            <Toggle checked={value.price.includeSalePrice} disabled={readOnly} onChange={(v) => setPrice({ includeSalePrice: v })} label="Precio de venta" hint="Costo más tu margen, ya redondeado." />
          </div>
          {value.price.includeSalePrice && (
            <Field label="Margen">
              <div className="flex flex-wrap items-center gap-2">
                <Segmented<"provider" | "fixed">
                  value={value.price.markup.mode}
                  disabled={readOnly}
                  onChange={(mode) => setPrice({ markup: { mode, percent: mode === "fixed" ? value.price.markup.percent ?? 20 : undefined } })}
                  options={[
                    { value: "provider", label: "El de cada distribuidor en NODO" },
                    { value: "fixed", label: "Fijo" },
                  ]}
                />
                {value.price.markup.mode === "fixed" && (
                  <span className="flex items-center gap-1">
                    <input
                      type="number"
                      step="0.5"
                      disabled={readOnly}
                      value={value.price.markup.percent ?? 0}
                      onChange={(e) => setPrice({ markup: { mode: "fixed", percent: Number(e.target.value) || 0 } })}
                      className={`${inputClass} w-20`}
                      aria-label="Margen fijo en porcentaje"
                    />
                    <span className="text-xs text-surface-400">%</span>
                  </span>
                )}
              </div>
            </Field>
          )}
          <Field label="Redondeo del precio de venta">
            <Segmented<CatalogApiRounding> value={value.price.rounding} disabled={readOnly} onChange={(v) => setPrice({ rounding: v })} options={ROUNDING} />
          </Field>
          <Field label="Moneda">
            <Segmented<CatalogApiCurrency>
              value={value.price.currency}
              disabled={readOnly}
              onChange={(v) => setPrice({ currency: v })}
              options={[
                { value: "USD", label: "Dólares (USD)" },
                { value: "ARS", label: "Pesos (ARS)" },
              ]}
            />
          </Field>
          {value.price.currency === "ARS" && (
            <Field label="Cotización" hint="La del día, actualizada cada 10 minutos. Si el servicio de cotizaciones no responde, se usa la última conocida y la respuesta lo indica.">
              <div className="flex flex-wrap items-center gap-2">
                <Segmented<CatalogApiFxRate> value={value.price.fxRate} disabled={readOnly} onChange={(v) => setPrice({ fxRate: v })} options={FX} />
                {value.price.fxRate === "fixed" && (
                  <span className="flex items-center gap-1">
                    <span className="text-xs text-surface-400">$</span>
                    <input
                      type="number"
                      min={1}
                      disabled={readOnly}
                      value={value.price.fxFixed ?? ""}
                      onChange={(e) => setPrice({ fxFixed: Number(e.target.value) || undefined })}
                      className={`${inputClass} w-28`}
                      aria-label="Cotización fija en pesos por dólar"
                      placeholder="1450"
                    />
                  </span>
                )}
              </div>
            </Field>
          )}
        </Section>

        <Section title="Campos extra">
          <Toggle checked={value.fields.priceHistory} disabled={readOnly} onChange={(v) => set({ fields: { ...value.fields, priceHistory: v } })} label="Historial de precios" hint="Habilita /offers/{id}/price-history con los cambios de los últimos 12 meses." />
          <Toggle checked={value.fields.raw} disabled={readOnly} onChange={(v) => set({ fields: { ...value.fields, raw: v } })} label="Datos crudos del distribuidor" hint="Todo lo que manda el distribuidor, tal cual. Cambia según cada uno; usalo solo si lo necesitás." />
        </Section>

        <Section title="Feeds de Google y Meta">
          <Field
            label="Link de cada producto en tu tienda"
            hint="Obligatorio para los feeds. Podés usar {id}, {sku}, {ean}, {partNumber} y {slug}."
          >
            <input
              type="url"
              disabled={readOnly}
              value={value.feed.productUrlTemplate ?? ""}
              onChange={(e) => set({ feed: { productUrlTemplate: e.target.value.trim() || undefined } })}
              className={`${inputClass} font-mono text-xs`}
              placeholder="https://mitienda.com.ar/producto/{slug}"
            />
          </Field>
        </Section>
      </div>

      <aside className="lg:sticky lg:top-4 self-start min-w-0">
        <p className="text-[11px] uppercase tracking-wider text-surface-500 mb-2">Así sale una oferta</p>
        <pre className="max-h-[560px] overflow-auto rounded-lg border border-surface-800 bg-surface-950 p-3 text-[11px] leading-relaxed text-surface-200 font-mono">
          {preview}
        </pre>
        <p className="mt-2 text-[11px] text-surface-500 leading-relaxed">
          Ejemplo con costo de US$ 100, IVA 10,5 % y una percepción del 3 %. Con «el margen de cada distribuidor» se usa 20 % de muestra.
        </p>
      </aside>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <fieldset className="flex flex-col gap-4 border-t border-surface-800 pt-4 first:border-t-0 first:pt-0">
      <legend className="sr-only">{title}</legend>
      <p className="text-xs font-semibold uppercase tracking-wider text-surface-400">{title}</p>
      {children}
    </fieldset>
  );
}
