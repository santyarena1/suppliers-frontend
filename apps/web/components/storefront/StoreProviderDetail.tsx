"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Check, EyeOff, Loader2, MessageCircle, Search, Store, Tag, X } from "lucide-react";
import PrefsPanel from "@/components/PrefsPanel";
import ProductCard from "@/components/ProductCard";
import SaleMarginsPanel from "@/components/sale-margins/SaleMarginsPanel";
import { invalidateMyProviders, searchApi, storefrontApi, type Provider, type ProductDTO, type StorefrontOffer } from "@/lib/api";
import { proxyImg } from "@/lib/format";
import { useCan } from "@/lib/permissions";
import {
  apiError,
  buyerStockText,
  DELIVERY_OPTION_LABEL,
  INVOICE_TYPE_LABEL,
  labelsOf,
  PAYMENT_METHOD_LABEL,
  whatsappLink,
} from "@/lib/storefront";

type Tab = "products" | "store" | "margins";
const PAGE = 48;

/**
 * Ficha de una tienda de local dentro de Proveedores: qué vende, sus
 * condiciones, y los márgenes para revender lo que le comprás (igual que con un
 * distribuidor, más el margen por estado: nuevo, usado…).
 */
export default function StoreProviderDetail({ provider, initialTab }: { provider: Provider; initialTab?: string | null }) {
  const canManage = useCan("providers.manage");
  const [offer, setOffer] = useState<StorefrontOffer | null | undefined>(undefined);
  const [tab, setTab] = useState<Tab>(initialTab === "margins" ? "margins" : initialTab === "store" ? "store" : "products");
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const list = (await storefrontApi.offers()).data;
      setOffer(list.find((o) => o.provider === provider) ?? null);
    } catch {
      setOffer(null);
    }
  }, [provider]);

  useEffect(() => {
    void load();
  }, [load]);

  async function decide(decision: "ACCEPT" | "DECLINE") {
    if (!offer) return;
    setWorking(true);
    setError(null);
    try {
      await storefrontApi.decide(offer.storefrontId, decision);
      invalidateMyProviders();
      await load();
    } catch (err) {
      setError(apiError(err, "No se pudo guardar"));
    } finally {
      setWorking(false);
    }
  }

  if (offer === undefined) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-surface-500" />
      </div>
    );
  }
  if (offer === null) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
        <Store className="h-8 w-8 text-surface-700" />
        <p className="max-w-sm text-sm text-surface-400">Esta tienda no está disponible para tu comercio (la cerraron o es privada).</p>
        <Link href="/proveedores#tiendas-de-locales" className="text-sm font-medium text-brand-300 hover:text-brand-200">
          Ver las tiendas de locales
        </Link>
      </div>
    );
  }

  const accepted = offer.audienceStatus === "ACCEPTED";
  const stock = buyerStockText(offer.stockState, offer.stockConfirmedAt);
  const wa = whatsappLink(offer.contactPhone, `Hola ${offer.name}, te escribo desde NODO.`);

  return (
    <>
      <header className="flex flex-shrink-0 items-center justify-between border-b border-surface-800 bg-surface-950 px-4 py-3 sm:px-6">
        <div className="flex min-w-0 items-center gap-3">
          <Link href="/proveedores" className="flex-shrink-0 text-surface-500 transition-colors hover:text-white lg:hidden" aria-label="Volver">
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <StoreLogo offer={offer} />
          <div className="min-w-0">
            <h1 className="truncate text-base font-semibold text-white">{offer.name}</h1>
            <p className="truncate text-xs text-surface-500">
              Tienda de un local · {offer.productCount} {offer.productCount === 1 ? "producto" : "productos"}
              {offer.categories.length ? ` · ${offer.categories.slice(0, 3).join(", ")}` : ""}
            </p>
          </div>
        </div>
        <div className="flex flex-shrink-0 items-center gap-2">
          {wa && (
            <a
              href={wa}
              target="_blank"
              rel="noreferrer"
              className="hidden items-center gap-1.5 rounded-lg border border-emerald-500/40 px-2.5 py-1.5 text-xs font-medium text-emerald-200 hover:text-white sm:inline-flex"
            >
              <MessageCircle className="h-3.5 w-3.5" /> WhatsApp
            </a>
          )}
          <PrefsPanel />
        </div>
      </header>

      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto flex max-w-6xl flex-col gap-5 px-4 py-5 sm:px-6">
          {!accepted && (
            <div className="flex flex-wrap items-center gap-3 rounded-xl border border-brand-500/30 bg-brand-500/[0.06] p-4">
              <p className="min-w-0 flex-1 text-sm text-surface-200">
                {offer.audienceStatus === "PENDING"
                  ? `${offer.name} está vendiendo en NODO. ¿Querés ver sus productos en tu búsqueda?`
                  : `Hoy no ves los productos de ${offer.name} en tu búsqueda.`}
              </p>
              {canManage !== false ? (
                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={working}
                    onClick={() => void decide("ACCEPT")}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-2 text-xs font-semibold text-white hover:bg-brand-500 disabled:opacity-60"
                  >
                    {working ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />} Ver sus productos
                  </button>
                  {offer.audienceStatus === "PENDING" && (
                    <button
                      type="button"
                      disabled={working}
                      onClick={() => void decide("DECLINE")}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-surface-700 px-3 py-2 text-xs text-surface-300 hover:text-white disabled:opacity-60"
                    >
                      <X className="h-3.5 w-3.5" /> No me interesa
                    </button>
                  )}
                </div>
              ) : (
                <p className="text-xs text-surface-500">Lo decide quien maneja los proveedores.</p>
              )}
            </div>
          )}
          {error && <p className="rounded-md bg-red-500/10 px-3 py-2 text-xs text-red-300">{error}</p>}

          <div className="flex overflow-x-auto border-b border-surface-800" role="tablist">
            {(
              [
                { key: "products", label: "Productos", icon: Search },
                { key: "store", label: "La tienda", icon: Store },
                ...(accepted ? [{ key: "margins", label: "Márgenes de venta", icon: Tag }] : []),
              ] as { key: Tab; label: string; icon: typeof Search }[]
            ).map(({ key, label, icon: Icon }) => (
              <button
                key={key}
                type="button"
                role="tab"
                aria-selected={tab === key}
                onClick={() => setTab(key)}
                className={`-mb-px inline-flex flex-shrink-0 items-center gap-1.5 whitespace-nowrap border-b-2 px-4 py-2.5 text-sm font-medium transition-all ${
                  tab === key ? "border-brand-500 text-brand-700 dark:text-brand-400" : "border-transparent text-surface-500 hover:text-surface-300"
                }`}
              >
                <Icon className="h-3.5 w-3.5" /> {label}
              </button>
            ))}
          </div>

          {tab === "products" &&
            (accepted ? (
              <StoreProducts provider={provider} />
            ) : (
              <p className="rounded-xl border border-dashed border-surface-700 px-4 py-10 text-center text-sm text-surface-400">
                Aceptá la tienda para ver sus productos y precios.
              </p>
            ))}

          {tab === "store" && (
            <section className="grid gap-4 lg:grid-cols-2">
              <div className="flex flex-col gap-3 rounded-xl border border-surface-800 p-4">
                {offer.about && <p className="whitespace-pre-line text-sm leading-relaxed text-surface-200">{offer.about}</p>}
                {stock && (
                  <p className={`text-xs ${stock.warn ? "text-amber-300" : "text-emerald-300"}`}>
                    {stock.text}
                  </p>
                )}
                {offer.sellsOffline && <p className="text-xs text-surface-400">También vende por fuera de NODO: el stock puede moverse.</p>}
                {offer.contactNote && <p className="text-xs text-surface-400">{offer.contactNote}</p>}
                {wa && (
                  <a href={wa} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 self-start text-xs font-semibold text-emerald-300 hover:text-emerald-200">
                    <MessageCircle className="h-3.5 w-3.5" /> Escribirle por WhatsApp
                  </a>
                )}
              </div>
              <dl className="grid gap-3 rounded-xl border border-surface-800 p-4 text-sm">
                <Row label="Formas de pago" value={labelsOf(offer.paymentMethods, PAYMENT_METHOD_LABEL).join(", ")} />
                <Row label="Entrega" value={labelsOf(offer.deliveryOptions, DELIVERY_OPTION_LABEL).join(", ")} />
                <Row label="Factura" value={labelsOf(offer.invoiceTypes, INVOICE_TYPE_LABEL).join(", ")} />
                <Row label="Garantía" value={offer.defaultWarranty} />
                <Row label="Condiciones" value={offer.salesTerms} />
              </dl>
              {accepted && canManage !== false && (
                <button
                  type="button"
                  disabled={working}
                  onClick={() => {
                    if (window.confirm(`¿Dejar de ver los productos de ${offer.name}? Lo podés volver a activar cuando quieras.`)) void decide("DECLINE");
                  }}
                  className="inline-flex items-center gap-1.5 self-start text-xs text-surface-500 hover:text-red-300 disabled:opacity-60"
                >
                  <EyeOff className="h-3.5 w-3.5" /> Dejar de ver esta tienda
                </button>
              )}
            </section>
          )}

          {tab === "margins" && accepted && <SaleMarginsPanel provider={provider} providerName={offer.name} store />}
        </div>
      </div>
    </>
  );
}

function Row({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div>
      <dt className="text-[10px] font-semibold uppercase tracking-wider text-surface-500">{label}</dt>
      <dd className="mt-0.5 whitespace-pre-line text-surface-200">{value?.trim() ? value : <span className="text-surface-600">No lo indicó</span>}</dd>
    </div>
  );
}

export function StoreLogo({ offer, size = "h-10 w-10" }: { offer: Pick<StorefrontOffer, "logoUrl">; size?: string }) {
  return offer.logoUrl ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={proxyImg(offer.logoUrl, { trim: false })} alt="" className={`${size} flex-shrink-0 rounded-xl border border-surface-700 bg-white object-contain`} />
  ) : (
    <span className={`${size} grid flex-shrink-0 place-items-center rounded-xl bg-brand-600/15 text-brand-300`}>
      <Store className="h-5 w-5" aria-hidden />
    </span>
  );
}

/** Productos de la tienda con el precio como en la búsqueda (costo o venta, según quién mira). */
function StoreProducts({ provider }: { provider: Provider }) {
  const [q, setQ] = useState("");
  const [items, setItems] = useState<ProductDTO[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const run = useCallback(
    async (query: string, skip = 0) => {
      setLoading(true);
      setError(null);
      try {
        const res = await searchApi.catalog(provider, { q: query, skip, take: PAGE });
        const list = Array.isArray(res.data?.items) ? res.data.items : [];
        setItems((prev) => (skip ? [...prev, ...list] : list));
        setTotal(res.data?.total ?? list.length);
      } catch (err) {
        setError(apiError(err, "No se pudieron cargar los productos"));
      } finally {
        setLoading(false);
      }
    },
    [provider]
  );

  useEffect(() => {
    void run("");
  }, [run]);

  return (
    <div className="flex flex-col gap-3">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void run(q);
        }}
        className="flex max-w-xl gap-2"
      >
        <label className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-surface-500" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar en esta tienda"
            aria-label="Buscar en esta tienda"
            className="w-full rounded-lg border border-surface-700 bg-surface-800 py-2.5 pl-9 pr-3 text-sm text-white placeholder-surface-500 focus:border-brand-500 focus:outline-none"
          />
        </label>
        <button type="submit" className="rounded-lg bg-surface-700 px-4 py-2.5 text-sm font-medium text-white hover:bg-surface-600">
          Buscar
        </button>
      </form>
      {error && <p className="text-xs text-red-300">{error}</p>}
      {!loading && items.length === 0 && !error && (
        <p className="rounded-xl border border-dashed border-surface-700 px-4 py-10 text-center text-sm text-surface-400">
          {q ? "Nada coincide con la búsqueda." : "Esta tienda no tiene productos con stock ahora."}
        </p>
      )}
      <div className="grid grid-cols-2 gap-2 sm:gap-3 md:grid-cols-3 lg:grid-cols-4">
        {items.map((p, i) => (
          <ProductCard key={`${p.provider}-${p.externalId}-${i}`} product={p} />
        ))}
      </div>
      {loading && <Loader2 className="mx-auto h-5 w-5 animate-spin text-surface-500" />}
      {!loading && items.length < total && (
        <button type="button" onClick={() => void run(q, items.length)} className="self-center text-sm font-medium text-brand-300 hover:text-brand-200">
          Ver más ({total - items.length})
        </button>
      )}
    </div>
  );
}
