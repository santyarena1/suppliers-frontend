"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Tag } from "lucide-react";
import { useSellerSession } from "@/lib/sale-price";

/** Compra al distribuidor: tiene costos, el vendedor en modo vendedor no entra. */
const BUYING_ROUTES = ["/cart", "/pedidos", "/proveedores"];

function isBuyingRoute(pathname: string | null): boolean {
  if (!pathname) return false;
  return BUYING_ROUTES.some((route) => pathname === route || pathname.startsWith(`${route}/`));
}

/**
 * El menú ya no muestra carrito, pedidos ni proveedores al vendedor. Esto cubre
 * a quien entra directo por la URL; el servidor igual no le manda costos.
 */
export default function SellerRouteGate({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { isSeller } = useSellerSession();
  if (!isSeller || !isBuyingRoute(pathname)) return <>{children}</>;

  return (
    <div className="flex-1 flex items-center justify-center px-6">
      <div className="max-w-sm text-center">
        <span className="mx-auto mb-4 flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-500/10 text-emerald-400">
          <Tag className="h-5 w-5" />
        </span>
        <h1 className="text-base font-semibold text-white">Esta sección es de compras</h1>
        <p className="mt-2 text-sm leading-relaxed text-surface-400">
          Como vendedor ves los precios de venta del comercio. El carrito, los pedidos y la
          configuración de los distribuidores los maneja quien compra.
        </p>
        <Link
          href="/search"
          className="mt-5 inline-flex items-center justify-center rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-500"
        >
          Ir a la búsqueda
        </Link>
      </div>
    </div>
  );
}
