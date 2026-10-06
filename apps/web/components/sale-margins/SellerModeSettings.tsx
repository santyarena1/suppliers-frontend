"use client";

import Link from "next/link";
import { Eye, Tag } from "lucide-react";
import { usePrefs } from "@/lib/prefs";
import { useSellerSession } from "@/lib/sale-price";
import { useMyProviders } from "@/lib/myProviders";

/**
 * Configuración → Modo vendedor. El dueño (o quien ve costos) prueba la app
 * exactamente como la ve un vendedor, sin crear otro usuario, y llega a los
 * márgenes de venta. El vendedor de verdad no ve esta tarjeta.
 */
export default function SellerModeSettings() {
  const seller = useSellerSession();
  const { viewAsSeller, setViewAsSeller } = usePrefs();
  const { providers } = useMyProviders();
  if (!seller.sellerMode || seller.isRealSeller) return null;

  const firstProvider = (providers.find((p) => p.configured && !p.platformHidden) ?? providers[0])?.provider;
  const marginsHref = firstProvider ? `/proveedores/${encodeURIComponent(firstProvider)}?tab=margins` : "/proveedores";

  return (
    <section data-tour="seller-mode" className="bg-surface-900 border border-surface-800 rounded-2xl p-5">
      <div className="flex items-center gap-2 mb-1">
        <Tag className="w-4 h-4 text-emerald-400" />
        <h2 className="text-sm font-semibold text-white">Modo vendedor</h2>
      </div>
      <p className="text-xs text-surface-500 leading-relaxed">
        Tus vendedores ven solo el precio de venta (costo + tu margen) y no entran a compras. Los márgenes se
        configuran en cada distribuidor.
      </p>

      <button
        type="button"
        role="switch"
        data-tour="seller-view-toggle"
        aria-checked={viewAsSeller}
        disabled={!seller.canPreviewAsSeller}
        onClick={() => setViewAsSeller(!viewAsSeller)}
        className="mt-4 w-full flex items-center justify-between gap-3 rounded-xl bg-surface-800 px-3.5 py-3 text-left hover:bg-surface-800/80 disabled:opacity-50"
      >
        <span className="flex items-start gap-2.5 min-w-0">
          <Eye className="w-4 h-4 mt-0.5 text-surface-400 flex-shrink-0" />
          <span className="min-w-0">
            <span className="block text-sm text-surface-100">Ver NODO como un vendedor</span>
            <span className="block text-xs text-surface-500">
              Precios de venta en vez de costos y sin carrito, pedidos ni distribuidores. Solo en este navegador.
            </span>
          </span>
        </span>
        <span className={`w-9 h-5 rounded-full relative transition-colors flex-shrink-0 ${viewAsSeller ? "bg-emerald-600" : "bg-surface-600"}`}>
          <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full transition-all ${viewAsSeller ? "left-[18px]" : "left-0.5"}`} />
        </span>
      </button>

      {!viewAsSeller && (
        <Link href={marginsHref} className="mt-3 inline-block text-xs font-medium text-brand-400 hover:text-brand-300">
          Configurar márgenes de venta →
        </Link>
      )}
    </section>
  );
}

/** Aviso fijo mientras el dueño navega como vendedor, para salir desde cualquier pantalla. */
export function SellerPreviewBar() {
  const seller = useSellerSession();
  const { setViewAsSeller } = usePrefs();
  if (!seller.previewingAsSeller) return null;
  return (
    <div className="fixed bottom-4 left-1/2 z-40 -translate-x-1/2 flex items-center gap-3 rounded-full border border-emerald-500/30 bg-surface-950/95 px-4 py-2 text-xs text-surface-200 shadow-xl backdrop-blur">
      <Eye className="w-3.5 h-3.5 text-emerald-400" />
      <span>Estás viendo NODO como un vendedor</span>
      <button
        type="button"
        onClick={() => setViewAsSeller(false)}
        className="rounded-full bg-emerald-600 px-2.5 py-1 font-medium text-white hover:bg-emerald-500"
      >
        Salir
      </button>
    </div>
  );
}
