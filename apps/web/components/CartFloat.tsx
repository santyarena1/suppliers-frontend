"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { ShoppingCart, ChevronUp, X, Minus, Plus, Package } from "lucide-react";
import { useCart, type CartItem, type CartRef, cartItemKey } from "@/lib/cart";
import { PROVIDER_LABELS, type Provider } from "@/lib/api";
import { useProviderDisplay } from "@/lib/providerDisplay";
import { proxyImg } from "@/lib/format";

type ProviderGroup = {
  provider: string;
  label: string;
  items: CartItem[];
  qty: number;
};

function cartRef(item: CartItem): CartRef {
  return {
    provider: item.provider,
    externalId: item.externalId,
    channel: item.channel,
    schemeId: item.schemeId,
  };
}

function PreviewQty({ item }: { item: CartItem }) {
  const { setQty, remove } = useCart();
  const ref = cartRef(item);

  function dec(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (item.qty <= 1) remove(ref);
    else setQty(ref, item.qty - 1);
  }

  function inc(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    setQty(ref, item.qty + 1);
  }

  return (
    <div
      className="flex items-center gap-0.5 rounded-md border border-slate-200/90 bg-white p-0.5 shadow-sm"
      onClick={(e) => e.stopPropagation()}
    >
      <button
        type="button"
        onClick={dec}
        className="flex h-6 w-6 items-center justify-center rounded text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition-colors"
        aria-label="Quitar uno"
      >
        <Minus className="w-3 h-3" />
      </button>
      <span className="min-w-[1.25rem] text-center text-[11px] font-semibold tabular-nums text-slate-700">
        {item.qty}
      </span>
      <button
        type="button"
        onClick={inc}
        className="flex h-6 w-6 items-center justify-center rounded text-brand-600 hover:bg-brand-50 hover:text-brand-700 transition-colors"
        aria-label="Agregar uno"
      >
        <Plus className="w-3 h-3" />
      </button>
    </div>
  );
}

function PreviewLine({ item }: { item: CartItem }) {
  const href = `/product/${encodeURIComponent(item.provider)}/${encodeURIComponent(item.externalId)}`;

  return (
    <div className="flex items-start gap-2.5 py-2">
      <Link
        href={href}
        className="relative h-11 w-11 flex-shrink-0 overflow-hidden rounded-lg border border-slate-200 bg-white"
        onClick={(e) => e.stopPropagation()}
      >
        {item.imageUrl ? (
          <Image
            src={proxyImg(item.imageUrl)}
            alt=""
            fill
            className="object-contain p-0.5"
            unoptimized
          />
        ) : (
          <span className="absolute inset-0 flex items-center justify-center bg-slate-50 text-slate-400">
            <Package className="w-4 h-4" />
          </span>
        )}
      </Link>

      <div className="min-w-0 flex-1">
        <Link
          href={href}
          className="block text-[12px] leading-snug text-slate-800 line-clamp-2 hover:text-brand-700 transition-colors"
          onClick={(e) => e.stopPropagation()}
        >
          {item.name}
        </Link>
        <p className="mt-0.5 text-[10px] text-slate-500 font-mono truncate">
          #{item.externalId}
          {item.channel === "offline" ? " · offline" : ""}
        </p>
      </div>

      <PreviewQty item={item} />
    </div>
  );
}

/**
 * Preview del carrito desde la búsqueda: lista real de productos cargados,
 * agrupados por distribuidor, sin ser el acceso principal al carrito.
 */
export default function CartFloat() {
  const pathname = usePathname();
  const { items, totalCount, hydrated } = useCart();
  const display = useProviderDisplay();
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState<"all" | string>("all");

  const onSearch = pathname?.startsWith("/search") ?? false;
  const hide =
    !hydrated ||
    !onSearch ||
    pathname?.startsWith("/login") ||
    pathname?.startsWith("/register");

  useEffect(() => {
    setOpen(false);
    setFilter("all");
  }, [pathname]);

  const groups = useMemo<ProviderGroup[]>(() => {
    const map = new Map<string, CartItem[]>();
    for (const item of items) {
      const list = map.get(item.provider) ?? [];
      list.push(item);
      map.set(item.provider, list);
    }
    return [...map.entries()]
      .map(([provider, providerItems]) => ({
        provider,
        label: PROVIDER_LABELS[provider as Provider] ?? provider.replace(/_/g, " "),
        items: providerItems.sort((a, b) => cartItemKey(a).localeCompare(cartItemKey(b))),
        qty: providerItems.reduce((s, i) => s + i.qty, 0),
      }))
      .sort((a, b) => b.qty - a.qty);
  }, [items]);

  const visibleGroups = useMemo(
    () => (filter === "all" ? groups : groups.filter((g) => g.provider === filter)),
    [filter, groups]
  );

  const lineCount = items.length;

  if (hide) return null;

  return (
    <div className="fixed bottom-5 right-5 z-50 flex flex-col items-end gap-2">
      {open && (
        <div className="w-[min(100vw-2rem,22rem)] overflow-hidden rounded-2xl border border-slate-200/90 bg-white/98 shadow-2xl backdrop-blur-md">
          <div className="flex items-center justify-between gap-2 border-b border-slate-100 px-3.5 py-2.5">
            <div className="min-w-0">
              <p className="text-xs font-semibold text-slate-900">Carrito</p>
              <p className="text-[10px] text-slate-500 tabular-nums">
                {lineCount === 0
                  ? "Sin productos"
                  : `${lineCount} ${lineCount === 1 ? "línea" : "líneas"} · ${totalCount} u.`}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
              aria-label="Cerrar preview"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          {groups.length > 1 && (
            <div className="flex gap-1 overflow-x-auto px-3 py-2 border-b border-slate-100 scrollbar-none">
              <button
                type="button"
                onClick={() => setFilter("all")}
                className={`flex-shrink-0 rounded-full px-2.5 py-1 text-[10px] font-semibold transition-colors ${
                  filter === "all"
                    ? "bg-brand-100 text-brand-700"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                }`}
              >
                Todos
              </button>
              {groups.map(({ provider, label, qty }) => {
                const logo = display.logoUrl(provider);
                return (
                  <button
                    key={provider}
                    type="button"
                    onClick={() => setFilter(provider)}
                    className={`flex flex-shrink-0 items-center gap-1 rounded-full px-2 py-1 text-[10px] font-semibold transition-colors ${
                      filter === provider
                        ? "bg-brand-100 text-brand-700"
                        : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                    }`}
                  >
                    {logo ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={logo} alt="" className="h-3.5 w-3.5 rounded-full object-contain bg-white" />
                    ) : null}
                    <span className="max-w-[5.5rem] truncate">{label}</span>
                    <span className="tabular-nums opacity-70">{qty}</span>
                  </button>
                );
              })}
            </div>
          )}

          <div className="max-h-[min(50vh,20rem)] overflow-y-auto px-3.5">
            {visibleGroups.length === 0 ? (
              <p className="py-8 text-center text-xs text-slate-500">
                Agregá productos desde la búsqueda para verlos acá.
              </p>
            ) : (
              visibleGroups.map((group, idx) => (
                <div
                  key={group.provider}
                  className={idx > 0 ? "border-t border-slate-100 pt-2 mt-1" : "pt-1"}
                >
                  {filter === "all" && (
                    <div className="flex items-center gap-2 py-1.5">
                      <span className="flex h-5 w-5 flex-shrink-0 items-center justify-center overflow-hidden rounded-full bg-white ring-1 ring-slate-200">
                        {display.logoUrl(group.provider) ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={display.logoUrl(group.provider)!}
                            alt=""
                            className="h-full w-full object-contain p-0.5"
                          />
                        ) : (
                          <span className="text-[8px] font-bold text-slate-600">
                            {group.label.slice(0, 2).toUpperCase()}
                          </span>
                        )}
                      </span>
                      <span className="text-[11px] font-semibold text-slate-700 truncate">
                        {group.label}
                      </span>
                      <span className="ml-auto text-[10px] tabular-nums text-slate-400">
                        {group.qty} u.
                      </span>
                    </div>
                  )}
                  <div className="divide-y divide-slate-100/80">
                    {group.items.map((item) => (
                      <PreviewLine key={cartItemKey(item)} item={item} />
                    ))}
                  </div>
                </div>
              ))
            )}
          </div>

          {lineCount > 0 && (
            <div className="border-t border-slate-100 px-3.5 py-2">
              <Link
                href="/cart"
                onClick={() => setOpen(false)}
                className="block text-center text-[10px] font-medium text-slate-500 hover:text-brand-700 transition-colors"
              >
                Abrir cotización completa →
              </Link>
            </div>
          )}
        </div>
      )}

      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`relative flex items-center gap-2 rounded-full shadow-xl pl-3.5 pr-4 py-3 transition-colors ${
          totalCount > 0
            ? "bg-brand-600 hover:bg-brand-500 text-white"
            : "bg-white hover:bg-slate-50 text-slate-600 border border-slate-200"
        }`}
        aria-label="Ver preview del carrito"
        aria-expanded={open}
      >
        <ShoppingCart className="w-4 h-4" />
        <span className="text-sm font-semibold tabular-nums">{totalCount}</span>
        <ChevronUp className={`w-3.5 h-3.5 transition-transform ${open ? "" : "rotate-180"}`} />
        {totalCount > 0 && groups.length > 0 && (
          <span className="absolute -top-1 -right-1 flex h-[1.15rem] min-w-[1.15rem] items-center justify-center rounded-full bg-emerald-400 px-1 text-[10px] font-bold text-surface-950">
            {groups.length}
          </span>
        )}
      </button>
    </div>
  );
}
