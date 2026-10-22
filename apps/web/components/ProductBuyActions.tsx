"use client";

import { useState } from "react";
import Link from "next/link";
import { Check, Layers, ShoppingCart, StickyNote } from "lucide-react";
import type { ProductDTO } from "@/lib/api";
import { useCart } from "@/lib/cart";
import { useIsRetailer, usePurchasePolicy } from "@/lib/purchase";
import type { PriceMode } from "@/lib/purchase-price";
import { hasOwnPrice } from "@/lib/format";
import { SchemePicker } from "@/components/SchemePicker";
import { providerHasIvaRate } from "@/lib/purchase-pricing";
import { isStorefrontProvider, providerLabel } from "@/components/ProviderBadge";

/** Formas de compra que este distribuidor acepta para el comercio (online siempre). */
export function useBuyChannels(product: ProductDTO | null) {
  const retailer = useIsRetailer();
  const policy = usePurchasePolicy(product?.provider ?? "");
  const hasIva = product ? providerHasIvaRate(product.provider, policy.priceChannel) : false;
  return {
    scheme: Boolean(retailer && hasIva && policy.acceptsScheme),
    offline: Boolean(retailer && hasIva && policy.acceptsOffline),
    /** Se pueden activar en la configuración del distribuidor. */
    canEnable: Boolean(retailer && hasIva && product && !isStorefrontProvider(product.provider)),
  };
}

const CTA: Record<PriceMode, { idle: string; done: string; idleClass: string; doneClass: string }> = {
  list: {
    idle: "Agregar al carrito",
    done: "Agregado al carrito",
    idleClass: "bg-brand-600 hover:bg-brand-500 text-white",
    doneClass: "bg-emerald-600 text-white",
  },
  offline: {
    idle: "Agregar a carrito offline",
    done: "Agregado al pedido offline",
    idleClass: "bg-amber-500 hover:bg-amber-400 text-surface-950",
    doneClass: "bg-amber-600 text-white",
  },
  scheme: {
    idle: "Agregar como esquema",
    done: "Agregado al esquema",
    idleClass: "bg-violet-600 hover:bg-violet-500 text-white",
    doneClass: "bg-violet-700 text-white",
  },
};

/** El botón de compra de la forma elegida (online, offline o esquema) y lo que ya está en el carrito. */
export default function ProductBuyActions({
  product,
  qty,
  channel,
}: {
  product: ProductDTO;
  qty: number;
  channel: PriceMode;
}) {
  const { add, items, createScheme, schemesFor } = useCart();
  const [flash, setFlash] = useState(false);
  const [pickOpen, setPickOpen] = useState(false);

  if (!hasOwnPrice(product)) return null;

  const inCart = items.find(
    (i) =>
      i.provider === product.provider &&
      i.externalId === product.externalId &&
      (channel === "offline" ? i.channel === "offline" : (i.channel ?? "online") === "online" && (channel === "scheme" ? !!i.schemeId : !i.schemeId))
  );

  function done() {
    setFlash(true);
    setTimeout(() => setFlash(false), 1600);
  }

  function addScheme(schemeId: string) {
    add(product, qty, { channel: "online", schemeId });
    setPickOpen(false);
    done();
  }

  function onClick() {
    if (channel === "offline") {
      add(product, qty, { channel: "offline", schemeId: null });
      done();
      return;
    }
    if (channel === "scheme") {
      const existing = schemesFor(product.provider);
      if (existing.length === 0) addScheme(createScheme(product.provider).id);
      else setPickOpen(true);
      return;
    }
    add(product, qty, { channel: "online", schemeId: null });
    done();
  }

  const cta = CTA[channel];
  const Icon = flash ? Check : channel === "offline" ? StickyNote : channel === "scheme" ? Layers : ShoppingCart;
  const inCartLabel =
    channel === "offline" ? "en el pedido offline" : channel === "scheme" ? "en un esquema" : "en el carrito online";

  return (
    <>
      <button
        type="button"
        onClick={onClick}
        className={`flex-1 min-h-[46px] flex items-center justify-center gap-2 text-sm font-semibold rounded-xl px-3 transition-all ${
          flash ? cta.doneClass : cta.idleClass
        }`}
      >
        <Icon className="w-4 h-4" />
        {flash ? cta.done : cta.idle}
      </button>
      {inCart && (
        <p className="basis-full text-[11px] text-emerald-400">
          Ya tenés {inCart.qty} {inCartLabel}
        </p>
      )}
      {pickOpen && (
        <SchemePicker provider={product.provider} onPick={(s) => addScheme(s.id)} onClose={() => setPickOpen(false)} />
      )}
    </>
  );
}

/** Aviso para activar offline y esquema cuando el distribuidor todavía no los tiene. */
export function EnableChannelsHint({ provider }: { provider: string }) {
  return (
    <p className="text-[11px] text-surface-400 leading-relaxed">
      Pedido offline y esquema se activan en{" "}
      <Link href={`/proveedores/${provider}?tab=config`} className="text-amber-300 hover:text-amber-200 underline">
        Configuración de {providerLabel(provider)}
      </Link>
      .
    </p>
  );
}
