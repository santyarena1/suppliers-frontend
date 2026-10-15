"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, MessageCircle, ShieldCheck, Store } from "lucide-react";
import { storefrontApi, type StorefrontItemInfo } from "@/lib/api";
import { proxyImg } from "@/lib/format";
import { useMyProviders } from "@/lib/myProviders";
import {
  buyerStockText,
  DELIVERY_OPTION_LABEL,
  INVOICE_TYPE_LABEL,
  labelsOf,
  PAYMENT_METHOD_LABEL,
  PRODUCT_CONDITION_LABEL,
  whatsappLink,
} from "@/lib/storefront";

/** Condiciones de la tienda y fotos del producto, si el proveedor es la tienda de un local. */
export function useStorefrontItem(provider: string, externalId: string): StorefrontItemInfo | null {
  const { providers } = useMyProviders();
  const isStore = providers.some((p) => p.provider === provider && p.storefront);
  const [info, setInfo] = useState<StorefrontItemInfo | null>(null);
  useEffect(() => {
    setInfo(null);
    if (!isStore) return;
    let alive = true;
    storefrontApi
      .itemInfo(provider, externalId)
      .then((r) => alive && setInfo(r.data))
      .catch(() => alive && setInfo(null));
    return () => {
      alive = false;
    };
  }, [isStore, provider, externalId]);
  return info;
}

function Row({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value) return null;
  return (
    <div className="flex flex-col gap-0.5 sm:flex-row sm:gap-3">
      <dt className="w-32 flex-shrink-0 text-surface-500">{label}</dt>
      <dd className="whitespace-pre-wrap text-surface-100">{value}</dd>
    </div>
  );
}

/** En la ficha: quién vende, en qué estado, con qué garantía y condiciones, y cómo escribirle. */
export default function StorefrontProductInfo({ info, productName }: { info: StorefrontItemInfo; productName: string }) {
  const { store, item } = info;
  const warranty = item.warranty ?? store.defaultWarranty;
  const stock = buyerStockText(store.stockState, store.stockConfirmedAt);
  const wa = whatsappLink(store.contactPhone, `Hola ${store.name}, te escribo por "${productName}" que publicaste en NODO.`);
  const payments = labelsOf(store.paymentMethods, PAYMENT_METHOD_LABEL).join(" · ");
  const delivery = labelsOf(store.deliveryOptions, DELIVERY_OPTION_LABEL).join(" · ");
  const invoice = labelsOf(store.invoiceTypes, INVOICE_TYPE_LABEL).join(" · ");

  return (
    <section className="mt-3 rounded-2xl border border-surface-800 bg-surface-900/70 p-4">
      <div className="flex flex-wrap items-center gap-3">
        {store.logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={proxyImg(store.logoUrl, { trim: false })} alt="" className="h-9 w-9 rounded-xl border border-surface-700 bg-white object-contain" />
        ) : (
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-brand-600/15 text-brand-300">
            <Store className="h-4 w-4" aria-hidden />
          </span>
        )}
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-white">
            Lo vende {store.name} <span className="ml-1 rounded bg-amber-500/15 px-1.5 py-0.5 align-middle text-[10px] font-semibold text-amber-200">LOCAL</span>
          </p>
          {stock && <p className={`text-[11px] ${stock.warn ? "text-amber-300" : "text-surface-500"}`}>{stock.text}</p>}
        </div>
        {item.condition && (
          <span className="rounded-full border border-surface-600 px-2.5 py-1 text-[11px] font-semibold text-surface-100">
            {PRODUCT_CONDITION_LABEL[item.condition] ?? item.condition}
          </span>
        )}
      </div>

      {store.sellsOffline && (
        <p className="mt-3 flex items-start gap-2 rounded-lg bg-amber-500/10 px-3 py-2 text-[11px] leading-relaxed text-amber-100">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" aria-hidden />
          También vende en su local o en otras webs: el stock lo confirma cuando recibe tu pedido.
        </p>
      )}

      <dl className="mt-3 grid gap-2 text-xs">
        {warranty && (
          <div className="flex items-start gap-2 text-surface-100">
            <ShieldCheck className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-emerald-300" aria-hidden />
            <span>
              <span className="text-surface-500">Garantía: </span>
              {warranty}
            </span>
          </div>
        )}
        <Row label="Formas de pago" value={payments} />
        <Row label="Entrega" value={delivery} />
        <Row label="Facturación" value={invoice} />
        <Row label="Zona y horarios" value={store.contactNote} />
        <Row label="Condiciones" value={store.salesTerms} />
      </dl>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {wa && (
          <a
            href={wa}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-500/30 bg-emerald-500/5 px-3 py-1.5 text-xs font-medium text-emerald-100 hover:bg-emerald-500/10"
          >
            <MessageCircle className="h-3.5 w-3.5" aria-hidden /> Escribirle a {store.name}
          </a>
        )}
        <span className="text-[11px] text-surface-500">El pedido lo confirma el local; el pago y la entrega los arreglan entre ustedes.</span>
      </div>
    </section>
  );
}
