"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Check, ChevronDown, Loader2, Tag, X } from "lucide-react";
import { invalidateMyProviders, storefrontApi, type StorefrontOffer } from "@/lib/api";
import { useCan } from "@/lib/permissions";
import { apiError, buyerStockText } from "@/lib/storefront";
import { StoreLogo } from "./StoreProviderDetail";

/**
 * "Tiendas de locales" dentro de Proveedores: otros comercios que venden en
 * NODO (usados, sobrantes, caja abierta). Se manejan como un proveedor más:
 * ves sus productos, sus condiciones y les ponés márgenes para revender.
 */
export default function StoreProvidersSection({ onChanged }: { onChanged?: () => void }) {
  const canManage = useCan("providers.manage");
  const [offers, setOffers] = useState<StorefrontOffer[] | null>(null);
  const [working, setWorking] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showDeclined, setShowDeclined] = useState(false);

  const load = useCallback(async () => {
    try {
      setOffers((await storefrontApi.offers()).data);
    } catch {
      setOffers([]);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function decide(o: StorefrontOffer, decision: "ACCEPT" | "DECLINE") {
    setWorking(o.storefrontId);
    setError(null);
    try {
      await storefrontApi.decide(o.storefrontId, decision);
      invalidateMyProviders();
      await load();
      onChanged?.();
    } catch (err) {
      setError(apiError(err, "No se pudo guardar"));
    } finally {
      setWorking(null);
    }
  }

  if (!offers || offers.length === 0) return null;
  const accepted = offers.filter((o) => o.audienceStatus === "ACCEPTED");
  const pending = offers.filter((o) => o.audienceStatus === "PENDING");
  const declined = offers.filter((o) => o.audienceStatus === "DECLINED" || o.audienceStatus === "REMOVED");
  const shown = [...accepted, ...pending, ...(showDeclined ? declined : [])];

  return (
    <section id="tiendas-de-locales" aria-labelledby="tiendas-de-locales-title" className="scroll-mt-4">
      <div className="mb-3">
        <h2 id="tiendas-de-locales-title" className="text-xs font-semibold uppercase tracking-widest text-surface-500">
          Tiendas de locales — {accepted.length}
          {pending.length > 0 && <span className="ml-2 normal-case tracking-normal text-brand-300">{pending.length} para mirar</span>}
        </h2>
        <p className="mt-1 text-xs text-surface-500">
          Otros comercios que venden en NODO: usados, caja abierta, sobrantes. Se manejan como un proveedor más, con sus márgenes de venta.
        </p>
      </div>
      {error && <p className="mb-3 rounded-md bg-red-500/10 px-3 py-2 text-xs text-red-300">{error}</p>}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {shown.map((o) => {
          const stock = buyerStockText(o.stockState, o.stockConfirmedAt);
          const isAccepted = o.audienceStatus === "ACCEPTED";
          return (
            <div
              key={o.storefrontId}
              className={`flex flex-col gap-3 rounded-xl border bg-surface-900 p-4 transition-all ${
                o.audienceStatus === "PENDING" ? "border-brand-500/40" : "border-surface-800 hover:border-surface-600"
              } ${isAccepted || o.audienceStatus === "PENDING" ? "" : "opacity-70"}`}
            >
              <Link href={`/proveedores/${encodeURIComponent(o.provider)}`} className="flex items-center gap-3">
                <StoreLogo offer={o} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-white">{o.name}</span>
                  <span className="block truncate text-[11px] text-surface-500">
                    {o.productCount} {o.productCount === 1 ? "producto" : "productos"}
                    {o.categories.length ? ` · ${o.categories.slice(0, 2).join(", ")}` : ""}
                  </span>
                </span>
              </Link>
              {stock && <p className={`-mt-1 text-[11px] ${stock.warn ? "text-amber-300" : "text-surface-400"}`}>{stock.text}</p>}
              {isAccepted ? (
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
                  <Link href={`/proveedores/${encodeURIComponent(o.provider)}`} className="font-medium text-brand-300 hover:text-brand-200">
                    Ver productos
                  </Link>
                  <Link
                    href={`/proveedores/${encodeURIComponent(o.provider)}?tab=margins`}
                    className="inline-flex items-center gap-1 font-medium text-emerald-300 hover:text-emerald-200"
                  >
                    <Tag className="h-3 w-3" /> Márgenes
                  </Link>
                </div>
              ) : canManage !== false ? (
                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={working !== null}
                    onClick={() => void decide(o, "ACCEPT")}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-500 disabled:opacity-60"
                  >
                    {working === o.storefrontId ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                    {o.audienceStatus === "PENDING" ? "Ver sus productos" : "Volver a verla"}
                  </button>
                  {o.audienceStatus === "PENDING" && (
                    <button
                      type="button"
                      disabled={working !== null}
                      onClick={() => void decide(o, "DECLINE")}
                      className="inline-flex items-center gap-1 rounded-lg border border-surface-700 px-2.5 py-1.5 text-xs text-surface-400 hover:text-white disabled:opacity-60"
                    >
                      <X className="h-3.5 w-3.5" /> No
                    </button>
                  )}
                </div>
              ) : (
                <p className="text-[11px] text-surface-500">Lo decide quien maneja los proveedores.</p>
              )}
            </div>
          );
        })}
      </div>
      {declined.length > 0 && (
        <button
          type="button"
          onClick={() => setShowDeclined(!showDeclined)}
          className="mt-3 inline-flex items-center gap-1 text-xs text-surface-500 hover:text-white"
        >
          <ChevronDown className={`h-3.5 w-3.5 transition-transform ${showDeclined ? "rotate-180" : ""}`} />
          {showDeclined ? "Ocultar" : `Ver las ${declined.length} que no ves`}
        </button>
      )}
    </section>
  );
}
