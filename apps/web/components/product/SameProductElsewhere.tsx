"use client";

import Link from "next/link";
import { Sparkles } from "lucide-react";
import type { ProductDTO, SameProductEntry } from "@/lib/api";
import { providerLabel } from "@/components/ProviderBadge";
import { formatARS, formatUSD, hasOwnPrice } from "@/lib/format";
import { usePrefs } from "@/lib/prefs";
import { usePurchasePolicy } from "@/lib/purchase";
import { purchaseLinePricing } from "@/lib/purchase-price";
import { displayAmountFromPricing } from "@/lib/display-price";

/** Precio final unitario de una ficha, con los mismos impuestos que la caja de compra. */
function FinalPrice({ product }: { product: ProductDTO }) {
  const { currency, withIva, withIibb, convert } = usePrefs();
  const policy = usePurchasePolicy(product.provider);
  if (!hasOwnPrice(product)) return <span className="text-xs text-surface-500">Sin precio</span>;
  const usd = displayAmountFromPricing(
    purchaseLinePricing(product, policy, "list", 1),
    { withIva, withIibb, provider: product.provider },
    1
  ).unitDisplayUsd;
  const text =
    currency === "USD"
      ? formatUSD(usd)
      : product.sourceCurrency === "ARS" && product.fxRate
        ? formatARS(usd * product.fxRate)
        : formatARS(convert(usd).amount);
  return <span className="font-mono text-sm tabular-nums text-white">{text}</span>;
}

const productHref = (provider: string, externalId: string) =>
  `/product/${encodeURIComponent(provider)}/${encodeURIComponent(externalId)}`;

function StockLabel({ product }: { product: ProductDTO }) {
  if (product.stock == null && !product.stockStatus) return null;
  const ok = (product.stock ?? 0) > 0;
  return (
    <span className={`text-xs font-semibold ${ok ? "text-emerald-400" : "text-amber-300"}`}>
      {ok ? "Hay stock" : product.stockStatus || "Sin stock"}
    </span>
  );
}

/**
 * El mismo producto en los otros distribuidores del comercio, según la agrupación
 * de la ficha enriquecida (AcuStock). Sin agrupación: solo "Buscar similares".
 */
export default function SameProductElsewhere({
  current,
  entries,
  onSearchSimilar,
}: {
  current: ProductDTO;
  entries: SameProductEntry[];
  onSearchSimilar: () => void;
}) {
  const visible = entries.filter((e) => !e.locked && e.product);
  const locked = entries.filter((e) => e.locked);

  return (
    <section className="flex flex-1 flex-col gap-3 rounded-2xl border border-surface-800 bg-surface-900/60 p-4 sm:p-5">
      <div>
        <h2 className="text-base font-bold text-white">El mismo producto en tus otros distribuidores</h2>
        {entries.length > 0 ? (
          <p className="mt-1 text-xs text-surface-400">Según la agrupación de la ficha completa · precio final</p>
        ) : (
          <p className="mt-1 text-xs text-surface-400">
            Este producto no está agrupado con otros distribuidores. Buscá parecidos por nombre.
          </p>
        )}
      </div>

      {entries.length > 0 && (
        <ul className="m-0 flex list-none flex-col p-0">
          <li className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-3 border-t border-surface-800 py-2.5 text-sm">
            <span className="font-bold text-white">
              {providerLabel(current.provider)} <span className="text-[11px] font-semibold text-brand-300">· estás acá</span>
            </span>
            <StockLabel product={current} />
            <span className="min-w-[96px] text-right"><FinalPrice product={current} /></span>
          </li>
          {visible.map((e) => (
            <li key={`${e.provider}-${e.externalId}`} className="border-t border-surface-800">
              <Link
                href={productHref(e.provider, e.externalId)}
                className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-3 rounded-lg py-2.5 text-sm transition-colors hover:bg-surface-800/60"
              >
                <span className="font-bold text-white">{providerLabel(e.provider)}</span>
                <StockLabel product={e.product!} />
                <span className="min-w-[96px] text-right"><FinalPrice product={e.product!} /></span>
              </Link>
            </li>
          ))}
          {locked.length > 0 && (
            <li className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-t border-surface-800 py-2.5 text-sm">
              <span className="font-bold text-white">{locked.map((e) => providerLabel(e.provider)).join(" · ")}</span>
              <Link href="/proveedores" className="text-xs font-semibold text-brand-300 hover:text-white">
                Conectá tu cuenta para ver el precio
              </Link>
            </li>
          )}
        </ul>
      )}

      <button
        type="button"
        onClick={onSearchSimilar}
        className="mt-auto inline-flex min-h-[40px] items-center gap-2 self-start rounded-xl border border-surface-700 px-3.5 text-xs font-semibold text-surface-200 transition-colors hover:bg-surface-800 hover:text-white"
      >
        <Sparkles className="h-3.5 w-3.5" />
        Buscar similares en otros proveedores
      </button>
    </section>
  );
}
