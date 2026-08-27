"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ShoppingCart, ChevronUp, X } from "lucide-react";
import { useCart } from "@/lib/cart";
import { PROVIDER_LABELS, type Provider } from "@/lib/api";
import { useProviderDisplay } from "@/lib/providerDisplay";

/**
 * Flotante bottom-right: carrito general + desglose por distribuidor.
 * La fuente de verdad es el carrito de Nodo; el preload sincroniza hacia los portales.
 */
export default function CartFloat() {
  const pathname = usePathname();
  const { totalCount, onlineByProvider, offlineByProvider, hydrated } = useCart();
  const display = useProviderDisplay();
  const [open, setOpen] = useState(false);

  const hide =
    !hydrated ||
    pathname?.startsWith("/cart") ||
    pathname?.startsWith("/login") ||
    pathname?.startsWith("/register");

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  const providers = useMemo(() => {
    const keys = new Set([
      ...Object.keys(onlineByProvider),
      ...Object.keys(offlineByProvider),
    ]);
    return [...keys]
      .map((provider) => {
        const online = onlineByProvider[provider] ?? [];
        const offline = offlineByProvider[provider] ?? [];
        const qty =
          online.reduce((s, i) => s + i.qty, 0) + offline.reduce((s, i) => s + i.qty, 0);
        return { provider, qty, online: online.length, offline: offline.length };
      })
      .filter((p) => p.qty > 0)
      .sort((a, b) => b.qty - a.qty);
  }, [onlineByProvider, offlineByProvider]);

  if (hide) return null;

  return (
    <div className="fixed bottom-5 right-5 z-50 flex flex-col items-end gap-2">
      {open && (
        <div className="w-[min(100vw-2rem,20rem)] rounded-2xl border border-surface-700 bg-surface-950/95 backdrop-blur-md shadow-2xl overflow-hidden">
          <div className="flex items-center justify-between px-3.5 py-2.5 border-b border-surface-800">
            <p className="text-xs font-semibold text-white">Carritos</p>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="p-1 rounded-md text-surface-500 hover:text-white"
              aria-label="Cerrar"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="max-h-72 overflow-y-auto divide-y divide-surface-800/80">
            <Link
              href="/cart"
              onClick={() => setOpen(false)}
              className="flex items-center justify-between gap-2 px-3.5 py-2.5 hover:bg-surface-900 transition-colors"
            >
              <span className="text-sm text-white font-medium">Carrito general</span>
              <span className="text-xs tabular-nums text-brand-300 font-semibold">
                {totalCount} u.
              </span>
            </Link>

            {providers.length === 0 ? (
              <p className="px-3.5 py-4 text-xs text-surface-500 text-center">
                Todavía no agregaste productos.
              </p>
            ) : (
              providers.map(({ provider, qty }) => {
                const name =
                  PROVIDER_LABELS[provider as Provider] ?? provider.replace(/_/g, " ");
                const logo = display.logoUrl(provider);
                return (
                  <Link
                    key={provider}
                    href={`/cart?provider=${encodeURIComponent(provider)}`}
                    onClick={() => setOpen(false)}
                    className="flex items-center gap-2.5 px-3.5 py-2.5 hover:bg-surface-900 transition-colors"
                  >
                    <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center overflow-hidden rounded-full bg-white">
                      {logo ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={logo} alt="" className="h-full w-full object-contain p-0.5" />
                      ) : (
                        <span className="text-[9px] font-bold text-slate-700">
                          {name.slice(0, 2).toUpperCase()}
                        </span>
                      )}
                    </span>
                    <span className="flex-1 min-w-0 text-sm text-surface-200 truncate">{name}</span>
                    <span className="text-xs tabular-nums text-surface-400">{qty} u.</span>
                  </Link>
                );
              })
            )}
          </div>

          <div className="px-3.5 py-2.5 border-t border-surface-800">
            <Link
              href="/cart"
              onClick={() => setOpen(false)}
              className="block w-full text-center text-xs font-semibold rounded-lg bg-brand-600 hover:bg-brand-500 text-white py-2 transition-colors"
            >
              Ir al carrito
            </Link>
          </div>
        </div>
      )}

      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="relative flex items-center gap-2 rounded-full bg-brand-600 hover:bg-brand-500 text-white shadow-xl pl-3.5 pr-4 py-3 transition-colors"
        aria-label="Ver carritos"
      >
        <ShoppingCart className="w-4 h-4" />
        <span className="text-sm font-semibold tabular-nums">{totalCount}</span>
        <ChevronUp className={`w-3.5 h-3.5 transition-transform ${open ? "" : "rotate-180"}`} />
        {totalCount > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[1.15rem] h-[1.15rem] px-1 rounded-full bg-emerald-400 text-[10px] font-bold text-surface-950 flex items-center justify-center">
            {providers.length || 1}
          </span>
        )}
      </button>
    </div>
  );
}
