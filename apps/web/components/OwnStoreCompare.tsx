"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ExternalLink, Store } from "lucide-react";
import type { OwnStoreQuote } from "@/lib/api";
import { formatARS, formatUSD } from "@/lib/format";
import { compareOwnStorePrice } from "@/lib/own-store-compare";
import { requestOwnStoreQuote, useOwnStore } from "@/lib/own-store";
import { useIsRetailer } from "@/lib/purchase";
import { usePrefs } from "@/lib/prefs";

function useQuote(productName: string | null) {
  const { store, loaded, retailer } = useOwnStore();
  const [quote, setQuote] = useState<OwnStoreQuote | null>(null);
  const [status, setStatus] = useState<"idle" | "loading" | "ready">("idle");

  useEffect(() => {
    if (!loaded || !retailer || !store || !productName?.trim()) {
      setQuote(null);
      setStatus("idle");
      return;
    }
    let cancel = false;
    setStatus("loading");
    requestOwnStoreQuote(store.id, productName).then((next) => {
      if (cancel) return;
      setQuote(next);
      setStatus("ready");
    });
    return () => {
      cancel = true;
    };
  }, [loaded, retailer, store, productName]);

  return { store, loaded, retailer, quote, status };
}

function formatMoney(currency: "ARS" | "USD", amount: number) {
  return currency === "USD" ? formatUSD(amount) : formatARS(amount);
}

function signedMoney(currency: "ARS" | "USD", amount: number) {
  const text = formatMoney(currency, Math.abs(amount));
  if (amount > 0.004) return `+${text}`;
  if (amount < -0.004) return `−${text}`;
  return text;
}

function percentLabel(percent: number) {
  const abs = Math.abs(percent).toFixed(0);
  if (percent > 0.05) return `+${abs}%`;
  if (percent < -0.05) return `−${abs}%`;
  return `${abs}%`;
}

/** Renglón de la card: precio de la web propia contra el costo final. */
export function OwnStorePriceHint({
  productName,
  costUsd,
}: {
  productName: string;
  costUsd: number | null;
}) {
  const retailer = useIsRetailer();
  const { currency, currentRate } = usePrefs();
  const { store, quote } = useQuote(retailer && costUsd != null && costUsd > 0 ? productName : null);
  if (!store || !quote?.confident || costUsd == null) return null;

  const compared = compareOwnStorePrice(quote.price, costUsd, currency, currentRate?.venta);
  if (!compared) return null;
  const up = compared.percent >= 0;

  return (
    <p className="pc__web pc-mono" title={`${store.name}: ${quote.name}`}>
      <span>
        Tu web <b className="pc__web-price">{formatMoney(currency, compared.saleDisplay)}</b>
      </span>
      <span className={up ? "is-margin" : "is-loss"}>
        {percentLabel(compared.percent)} · {signedMoney(currency, compared.deltaDisplay)}
      </span>
    </p>
  );
}

function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(ms) || ms < 0) return "";
  const h = Math.floor(ms / 3_600_000);
  if (h < 1) return "hace minutos";
  if (h < 24) return `hace ${h} h`;
  const d = Math.floor(h / 24);
  return `hace ${d} d`;
}

/** Comparación en la ficha: costo final, precio de la web y la diferencia. */
export function OwnStoreProductCompare({
  productName,
  costUsd,
}: {
  productName: string;
  costUsd: number | null;
}) {
  const retailer = useIsRetailer();
  const { currency, currentRate } = usePrefs();
  const { store, loaded, quote, status } = useQuote(
    retailer && costUsd != null && costUsd > 0 ? productName : null
  );
  if (!retailer || !loaded) return null;

  if (store && (costUsd == null || !(costUsd > 0))) {
    return (
      <section className="rounded-2xl border border-surface-800 bg-surface-900/60 p-4">
        <div className="flex items-center gap-2 mb-1.5">
          <Store className="w-3.5 h-3.5 text-brand-400" />
          <h2 className="text-sm font-semibold text-white truncate">Tu tienda · {store.name}</h2>
        </div>
        <p className="text-xs text-surface-400 leading-relaxed">
          Cuando este producto tenga precio en tu cuenta, comparamos ese costo final con el de venta
          en {store.name}.
        </p>
      </section>
    );
  }

  if (!store) {
    return (
      <section className="rounded-2xl border border-surface-800 bg-surface-900/60 p-4">
        <div className="flex items-center gap-2 mb-1.5">
          <Store className="w-3.5 h-3.5 text-brand-400" />
          <h2 className="text-sm font-semibold text-white">Tu tienda web</h2>
        </div>
        <p className="text-xs text-surface-400 leading-relaxed">
          Elegí cuál de los locales que ya sincronizamos es el tuyo. Acá vas a ver el costo final
          contra el precio de venta de esa web.
        </p>
        <Link
          href="/configuracion"
          className="inline-flex mt-3 text-xs font-medium text-brand-300 hover:text-brand-200"
        >
          Elegir mi local en Configuración
        </Link>
      </section>
    );
  }

  const compared =
    quote && costUsd != null ? compareOwnStorePrice(quote.price, costUsd, currency, currentRate?.venta) : null;
  const money = (amount: number) => formatMoney(currency, amount);

  return (
    <section className="rounded-2xl border border-surface-800 bg-surface-900/60 p-4">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Store className="w-3.5 h-3.5 text-brand-400 flex-shrink-0" />
            <h2 className="text-sm font-semibold text-white truncate">Tu tienda · {store.name}</h2>
          </div>
          {quote && (
            <p className="text-[11px] text-surface-400 mt-1 leading-snug line-clamp-2">{quote.name}</p>
          )}
        </div>
        {quote && <span className="text-[10px] text-surface-500 flex-shrink-0">{timeAgo(quote.syncedAt)}</span>}
      </div>

      {status === "loading" && <p className="text-xs text-surface-500">Buscando este producto en {store.name}…</p>}

      {status === "ready" && !quote && (
        <p className="text-xs text-surface-400 leading-relaxed">
          No aparece en {store.name} con un nombre parecido. Si lo publicás con otro título, no
          podemos comparar el precio.
        </p>
      )}

      {quote && !compared && status === "ready" && (
        <p className="text-xs text-surface-400 leading-relaxed">
          Encontramos {quote.name} a {formatARS(quote.price)}. Falta la cotización del dólar para
          restarlo de tu costo final.
        </p>
      )}

      {quote && compared && (
        <>
          <dl className="grid grid-cols-3 gap-2">
            <div>
              <dt className="text-[10px] uppercase tracking-wide text-surface-500">Costo final</dt>
              <dd className="text-sm font-semibold text-white tabular-nums mt-0.5">{money(compared.costDisplay)}</dd>
            </div>
            <div>
              <dt className="text-[10px] uppercase tracking-wide text-surface-500">Tu web</dt>
              <dd className="text-sm font-semibold text-white tabular-nums mt-0.5">{money(compared.saleDisplay)}</dd>
            </div>
            <div>
              <dt className="text-[10px] uppercase tracking-wide text-surface-500">Diferencia</dt>
              <dd
                className={`text-sm font-semibold tabular-nums mt-0.5 ${
                  compared.percent >= 0 ? "text-emerald-400" : "text-amber-400"
                }`}
              >
                {percentLabel(compared.percent)}
              </dd>
              <dd
                className={`text-[11px] tabular-nums ${
                  compared.percent >= 0 ? "text-emerald-400/80" : "text-amber-400/80"
                }`}
              >
                {signedMoney(currency, compared.deltaDisplay)}
              </dd>
            </div>
          </dl>
          <p className="text-[11px] text-surface-400 leading-relaxed mt-3">
            {compared.percent >= 1
              ? `El precio de tu web queda ${Math.abs(compared.percent).toFixed(0)}% por encima del costo final.`
              : compared.percent <= -1
                ? `El precio de tu web queda ${Math.abs(compared.percent).toFixed(0)}% por debajo del costo final.`
                : "El precio de tu web está alineado con tu costo final."}{" "}
            Los dos importes son finales: el costo incluye los impuestos que tenés activos y el de
            la web es el publicado.
          </p>
          {!quote.confident && (
            <p className="text-[11px] text-amber-300/90 leading-relaxed mt-2">
              La coincidencia del nombre no es exacta. Revisá que sea el mismo producto antes de
              tomar este margen.
            </p>
          )}
          {quote.productUrl && (
            <a
              href={quote.productUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 mt-3 text-xs font-medium text-brand-300 hover:text-brand-200"
            >
              Ver en tu web <ExternalLink className="w-3 h-3" />
            </a>
          )}
        </>
      )}
    </section>
  );
}
