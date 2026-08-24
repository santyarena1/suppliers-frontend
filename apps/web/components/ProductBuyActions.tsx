"use client";

import { useState } from "react";
import { Check, Layers, ShoppingCart, StickyNote } from "lucide-react";
import type { ProductDTO } from "@/lib/api";
import { useCart } from "@/lib/cart";
import { useIsRetailer, usePurchasePolicy } from "@/lib/purchase";
import { purchaseLinePricing } from "@/lib/purchase-price";
import { formatUSD } from "@/lib/format";
import { SchemePicker } from "@/components/SchemePicker";
import { IVA_ADJUSTMENT_LABELS, providerHasIvaRate } from "@/lib/purchase-pricing";

export default function ProductBuyActions({ product, qty }: { product: ProductDTO; qty: number }) {
  const { add, items, createScheme, schemesFor } = useCart();
  const retailer = useIsRetailer();
  const policy = usePurchasePolicy(product.provider);
  const hasIva = providerHasIvaRate(product.provider);
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
            <p className="text-[11px] text-violet-300/80 text-center tabular-nums">
              Con esquema: {formatUSD(schemePricing.gross)}
              {policy.schemeDiscountPercent ? ` · desc. ${policy.schemeDiscountPercent}%` : ""}
              {policy.schemeIvaAdjustment ? ` · ${IVA_ADJUSTMENT_LABELS[policy.schemeIvaAdjustment]}` : ""}
              {schemePricing.missingIva ? " · falta alícuota de IVA" : ""}
            </p>
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
            <p className="text-[11px] text-amber-200/80 text-center tabular-nums">
              Precio offline: {formatUSD(offlinePricing.gross)}
              {policy.offlineIvaAdjustment ? ` · ${IVA_ADJUSTMENT_LABELS[policy.offlineIvaAdjustment]}` : ""}
              {offlinePricing.missingIva ? " · falta alícuota de IVA" : ""}
            </p>
          )}
          {offlineItem && (
            <p className="text-[11px] text-amber-400 text-center">Ya tenés {offlineItem.qty} en el pedido offline</p>
          )}
        </>
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
