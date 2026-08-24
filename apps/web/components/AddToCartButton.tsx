"use client";

import { useCart, type CartRef } from "@/lib/cart";
import { ProductDTO } from "@/lib/api";
import { Check, Plus, Minus } from "lucide-react";
import { useState } from "react";

interface Props {
  product: ProductDTO;
  variant?: "icon" | "full" | "inline";
  channel?: "online" | "offline";
  schemeId?: string | null;
}

export default function AddToCartButton({ product, variant = "icon", channel = "online", schemeId = null }: Props) {
  const { add, has, items, setQty, remove } = useCart();
  const ref: CartRef = { provider: product.provider, externalId: product.externalId, channel, schemeId };
  const inCart = has(ref);
  const item = items.find(
    (i) => i.provider === product.provider && i.externalId === product.externalId && (i.channel ?? "online") === channel && (i.schemeId ?? null) === schemeId
  );
  const [flash, setFlash] = useState(false);

  function handleAdd(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    add(product, 1, { channel, schemeId });
    setFlash(true);
    setTimeout(() => setFlash(false), 600);
  }

  if (variant === "inline" && inCart && item) {
    return (
      <div className="flex items-center gap-1.5 bg-surface-800 border border-surface-700 rounded-md p-0.5">
        <button
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            if (item.qty <= 1) remove(ref);
            else setQty(ref, item.qty - 1);
          }}
          className="text-surface-400 hover:text-white p-1 rounded transition-colors"
        >
          <Minus className="w-3 h-3" />
        </button>
        <span className="text-xs font-semibold text-white min-w-[1.25rem] text-center tabular-nums">{item.qty}</span>
        <button
          onClick={(e) => { e.preventDefault(); e.stopPropagation(); add(product, 1, { channel, schemeId }); }}
          className="text-surface-400 hover:text-white p-1 rounded transition-colors"
        >
          <Plus className="w-3 h-3" />
        </button>
      </div>
    );
  }

  if (variant === "full") {
    return (
      <button
        onClick={handleAdd}
        className={`w-full flex items-center justify-center gap-2 text-sm font-semibold rounded-lg py-2.5 transition-all ${
          flash || inCart
            ? "bg-emerald-600 hover:bg-emerald-500 text-white"
            : "bg-brand-600 hover:bg-brand-500 text-white"
        }`}
      >
        {inCart ? <Check className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
        {inCart ? `En carrito${item?.qty ? ` (${item.qty})` : ""}` : "Agregar al carrito"}
      </button>
    );
  }

  return (
    <button
      onClick={handleAdd}
      className={`flex items-center justify-center w-7 h-7 rounded-md transition-all ${
        flash
          ? "bg-emerald-500 text-white scale-110"
          : inCart
            ? "bg-emerald-600/20 text-emerald-400 border border-emerald-500/30"
            : "bg-surface-800 hover:bg-brand-600 text-surface-400 hover:text-white border border-surface-700 hover:border-brand-500"
      }`}
      title={inCart ? "En carrito" : "Agregar"}
    >
      {inCart ? <Check className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
    </button>
  );
}
