"use client";

import { useState } from "react";
import Link from "next/link";
import { Check, Layers, ShoppingCart, StickyNote } from "lucide-react";
import type { ProductDTO } from "@/lib/api";
import { useCart } from "@/lib/cart";
import { useIsRetailer, usePurchasePolicy } from "@/lib/purchase";
import { purchaseLinePricing } from "@/lib/purchase-price";
import { formatARS, formatUSD } from "@/lib/format";
import { usePrefs } from "@/lib/prefs";
import { displayAmountFromPricing } from "@/lib/display-price";
import { useIibbRatesEpoch } from "@/lib/iibb-rates";
import { SchemePicker } from "@/components/SchemePicker";
import { providerHasIvaRate } from "@/lib/purchase-pricing";

function FinalPriceLine({ usd, className }: { usd: number; className?: string }) {
  const { currentRate } = usePrefs();
  const rate = currentRate?.venta ?? 0;
  const ars = rate > 0 ? usd * rate : null;
  return (
    <p className={`text-[11px] text-center tabular-nums leading-relaxed ${className ?? ""}`}>
      {formatUSD(usd)}
      {ars != null && (
        <>
          <span className="opacity-50"> · </span>
          {formatARS(ars)}
        </>
      )}
    </p>
  );
}

export default function ProductBuyActions({ product, qty }: { product: ProductDTO; qty: number }) {
  const { add, items, createScheme, schemesFor } = useCart();
  const retailer = useIsRetailer();
  const policy = usePurchasePolicy(product.provider);
  const hasIva = providerHasIvaRate(product.provider, policy.priceChannel);
  const { withIva, withIibb } = usePrefs();
  useIibbRatesEpoch();
  const [flash, setFlash] = useState<"cart" | "scheme" | "offline" | null>(null);
  const [pickOpen, setPickOpen] = useState(false);

  const onlineLoose = items.find(
    (i) =>
      i.provider === product.provider &&
      i.externalId === product.externalId &&
      (i.channel ?? "online") === "online" &&
      !i.schemeId
  );
  const offlineItem = items.find(
    (i) =>
      i.provider === product.provider &&
      i.externalId === product.externalId &&
      i.channel === "offline"
  );

  const offlinePricing = purchaseLinePricing(product, policy, "offline", qty);
  const schemePricing = purchaseLinePricing(product, policy, "scheme", qty);
  const schemeShown = displayAmountFromPricing(
    schemePricing,
    { withIva, withIibb: withIibb && schemePricing.mode !== "offline", provider: product.provider },
    qty
  );
  const offlineShown = displayAmountFromPricing(
    offlinePricing,
    { withIva, withIibb: false, provider: product.provider },
    qty
  );
  const showScheme = retailer && hasIva && policy.acceptsScheme;
  const showOffline = retailer && hasIva && policy.acceptsOffline;

  function flashKind(kind: "cart" | "scheme" | "offline") {
    setFlash(kind);
    setTimeout(() => setFlash(null), 1600);
  }

  function addOnline() {
    add(product, qty, { channel: "online", schemeId: null });
    flashKind("cart");
  }

  function addOffline() {
    add(product, qty, { channel: "offline", schemeId: null });
    flashKind("offline");
  }

  function addScheme(schemeId: string) {
    add(product, qty, { channel: "online", schemeId });
    flashKind("scheme");
    setPickOpen(false);
  }

  function handleScheme() {
    const existing = schemesFor(product.provider);
    if (existing.length === 0) {
      addScheme(createScheme(product.provider).id);
      return;
    }
    setPickOpen(true);
  }

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={addOnline}
        className={`w-full flex items-center justify-center gap-2 text-sm font-semibold rounded-xl py-3 transition-all ${
          flash === "cart" ? "bg-emerald-600 text-white" : "bg-brand-600 hover:bg-brand-500 text-white"
        }`}
      >
        {flash === "cart" ? <Check className="w-4 h-4" /> : <ShoppingCart className="w-4 h-4" />}
        {flash === "cart" ? "Agregado al carrito" : `Agregar al carrito · ${qty}`}
      </button>
      {onlineLoose && (
        <p className="text-[11px] text-emerald-400 text-center">Ya tenés {onlineLoose.qty} en el carrito online</p>
      )}

      {showScheme && (
        <>
          <button
            type="button"
            onClick={handleScheme}
            className={`w-full flex items-center justify-center gap-2 text-sm font-semibold rounded-xl py-2.5 transition-all border ${
              flash === "scheme"
                ? "bg-violet-600 border-violet-500 text-white"
                : "border-violet-500/40 bg-violet-500/10 text-violet-200 hover:bg-violet-500/20"
            }`}
          >
            {flash === "scheme" ? <Check className="w-4 h-4" /> : <Layers className="w-4 h-4" />}
            {flash === "scheme" ? "Agregado al esquema" : "Agregar como esquema"}
          </button>
          {schemePricing.adjusted && (
            <FinalPriceLine usd={schemeShown.displayUsd} className="text-violet-200/90" />
          )}
        </>
      )}

      {showOffline && (
        <>
          <button
            type="button"
            onClick={addOffline}
            className={`w-full flex items-center justify-center gap-2 text-sm font-semibold rounded-xl py-2.5 transition-all border ${
              flash === "offline"
                ? "bg-amber-600 border-amber-500 text-white"
                : "border-amber-500/40 bg-amber-500/10 text-amber-100 hover:bg-amber-500/20"
            }`}
          >
            {flash === "offline" ? <Check className="w-4 h-4" /> : <StickyNote className="w-4 h-4" />}
            {flash === "offline" ? "Agregado al pedido offline" : "Agregar a carrito offline"}
          </button>
          {offlinePricing.adjusted && (
            <FinalPriceLine usd={offlineShown.displayUsd} className="text-amber-100/90" />
          )}
          {offlineItem && (
            <p className="text-[11px] text-amber-400 text-center">Ya tenés {offlineItem.qty} en el pedido offline</p>
          )}
        </>
      )}

      {retailer && hasIva && !showScheme && !showOffline && (
        <p className="text-[11px] text-surface-400 text-center leading-relaxed">
          Pedido offline y esquema se activan en{" "}
          <Link href={`/proveedores/${product.provider}?tab=config`} className="text-amber-300 hover:text-amber-200 underline">
            Configuración de {product.provider.replace(/_/g, " ")}
          </Link>
          .
        </p>
      )}

      {pickOpen && (
        <SchemePicker
          provider={product.provider}
          onPick={(s) => addScheme(s.id)}
          onClose={() => setPickOpen(false)}
        />
      )}
    </div>
  );
}
