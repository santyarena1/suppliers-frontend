"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Check, FileText, X } from "lucide-react";
import { useSellerSession } from "@/lib/sale-price";
import { quoteBadge, useQuoteTotal, useQuotes } from "@/lib/quotes";

/** Pantallas donde se agregan productos. */
const ROUTES = ["/search", "/product/", "/comparador"];

/**
 * Para quien compra (sin burbuja de vendedor): mientras arma un presupuesto,
 * una barra fija dice a cuál va lo que agrega, con acceso para verlo y una X
 * para terminar. Al agregar, avisa "Agregado a #12".
 */
export default function QuoteBuildingBar() {
  const pathname = usePathname() ?? "";
  const quotes = useQuotes();
  const { isSeller } = useSellerSession();
  const totalOf = useQuoteTotal();
  const [flash, setFlash] = useState<string | null>(null);

  useEffect(() => {
    if (!quotes.lastAdded) return;
    setFlash(quotes.lastAdded.name);
    const t = setTimeout(() => setFlash(null), 2600);
    return () => clearTimeout(t);
  }, [quotes.lastAdded]);

  const onRoute = ROUTES.some((r) => pathname === r || pathname.startsWith(r));
  const active = quotes.active;
  if (isSeller || !quotes.enabled || !active || !onRoute) return null;

  const client = active.clientName ? ` · ${active.clientName}` : "";
  const units = active.itemCount === 0 ? "sin productos" : `${active.itemCount} u. · ${totalOf(active)}`;

  return (
    <div
      role="status"
      className="fixed z-40 bottom-[calc(max(1.25rem,env(safe-area-inset-bottom))+4rem)] left-4 right-4 sm:bottom-[max(1.25rem,env(safe-area-inset-bottom))] sm:left-1/2 sm:right-auto sm:-translate-x-1/2"
    >
      <div
        className={`mx-auto flex max-w-xl items-center gap-2.5 rounded-full border bg-surface-950/95 py-1.5 pl-1.5 pr-2 shadow-2xl backdrop-blur transition-colors ${
          flash ? "border-emerald-400/60" : "border-brand-500/40"
        }`}
      >
        <span
          className={`flex h-8 min-w-[2rem] flex-shrink-0 items-center justify-center rounded-full px-1.5 text-[11px] font-bold text-white ${
            flash ? "bg-emerald-500" : "bg-brand-600"
          }`}
        >
          {flash ? <Check className="h-4 w-4" /> : quoteBadge(active)}
        </span>
        <p className="min-w-0 flex-1 truncate text-xs text-surface-200">
          {flash ? (
            <>
              <span className="font-semibold text-emerald-300">Agregado a #{active.number}:</span> {flash}
            </>
          ) : (
            <>
              <span className="font-semibold text-white">Armando presupuesto #{active.number}</span>
              <span className="text-surface-400">{client}</span>
              <span className="hidden text-surface-500 sm:inline"> · {units}</span>
            </>
          )}
        </p>
        <Link
          href={`/presupuestos?id=${encodeURIComponent(active.id)}`}
          className="inline-flex flex-shrink-0 items-center gap-1 rounded-full bg-surface-800 px-3 py-1.5 text-xs font-semibold text-white hover:bg-surface-700"
        >
          <FileText className="h-3.5 w-3.5" /> Ver
        </Link>
        <button
          type="button"
          onClick={() => quotes.setActive(null)}
          className="flex-shrink-0 rounded-full p-1.5 text-surface-500 hover:bg-surface-800 hover:text-white"
          aria-label="Terminar de armar este presupuesto"
          title="Terminar de armar (el presupuesto queda guardado)"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
