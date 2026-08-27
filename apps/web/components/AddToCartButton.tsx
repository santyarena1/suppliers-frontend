"use client";

import { useCart, type CartRef } from "@/lib/cart";
import { ProductDTO } from "@/lib/api";
import { Plus, Minus } from "lucide-react";

interface Props {
  product: ProductDTO;
  /** @deprecated Se mantiene por compat; siempre se muestra el stepper. */
  variant?: "icon" | "full" | "inline" | "stepper";
  /** Estética del stepper: claro para cards, oscuro para fondos dark. */
  tone?: "light" | "dark";
  channel?: "online" | "offline";
  schemeId?: string | null;
}

/**
 * Control − / cantidad / + ligado al carrito de Nodo.
 * Siempre visible: con 0 unidades el − queda deshabilitado.
 */
export default function AddToCartButton({
  product,
  variant = "stepper",
  tone = "light",
  channel = "online",
  schemeId = null,
}: Props) {
  const { add, has, items, setQty, remove } = useCart();
  const ref: CartRef = {
    provider: product.provider,
    externalId: product.externalId,
    channel,
    schemeId,
  };
  const item = items.find(
    (i) =>
      i.provider === product.provider &&
      i.externalId === product.externalId &&
      (i.channel ?? "online") === channel &&
      (i.schemeId ?? null) === schemeId
  );
  const qty = item?.qty ?? 0;
  const inCart = has(ref);

  function bump(delta: number, e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (delta > 0) {
      add(product, delta, { channel, schemeId });
      return;
    }
    if (!item) return;
    if (item.qty <= 1) remove(ref);
    else setQty(ref, item.qty - 1);
  }

  if (variant === "full") {
    return (
      <button
        type="button"
        onClick={(e) => bump(1, e)}
        className={`w-full flex items-center justify-center gap-2 text-sm font-semibold rounded-lg py-2.5 transition-all ${
          inCart
            ? "bg-emerald-600 hover:bg-emerald-500 text-white"
            : "bg-brand-600 hover:bg-brand-500 text-white"
        }`}
      >
        <Plus className="w-4 h-4" />
        {inCart ? `En carrito (${qty})` : "Agregar al carrito"}
      </button>
    );
  }

  // stepper / icon / inline → mismo control − qty +
  const shell =
    tone === "light"
      ? qty > 0
        ? "bg-brand-50/80 border-brand-200/80"
        : "bg-white border-slate-200/90 shadow-sm"
      : qty > 0
        ? "bg-brand-500/15 border-brand-500/30"
        : "bg-surface-800 border-surface-700";

  const minusBtn =
    tone === "light"
      ? "text-slate-400 hover:text-slate-700 hover:bg-slate-100 disabled:hover:text-slate-300"
      : "text-surface-400 hover:text-white hover:bg-surface-700 disabled:hover:text-surface-400";

  const qtyText =
    tone === "light"
      ? qty > 0
        ? "text-slate-800"
        : "text-slate-400"
      : qty > 0
        ? "text-white"
        : "text-surface-500";

  const plusBtn =
    tone === "light"
      ? "text-brand-600 hover:text-white hover:bg-brand-500"
      : "text-surface-400 hover:text-white hover:bg-brand-600";

  return (
    <div
      className={`flex items-center gap-0.5 rounded-lg border p-0.5 transition-colors ${shell}`}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
      }}
    >
      <button
        type="button"
        disabled={qty <= 0}
        onClick={(e) => bump(-1, e)}
        className={`flex items-center justify-center w-7 h-7 rounded-md disabled:opacity-35 disabled:hover:bg-transparent transition-colors ${minusBtn}`}
        aria-label="Quitar uno"
        title="Quitar uno"
      >
        <Minus className="w-3.5 h-3.5" />
      </button>
      <span
        className={`min-w-[1.75rem] text-center text-xs font-semibold tabular-nums ${qtyText}`}
        aria-label={`Cantidad en carrito: ${qty}`}
      >
        {qty}
      </span>
      <button
        type="button"
        onClick={(e) => bump(1, e)}
        className={`flex items-center justify-center w-7 h-7 rounded-md transition-colors ${plusBtn}`}
        aria-label="Agregar uno"
        title="Agregar uno"
      >
        <Plus className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}
