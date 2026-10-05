"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { FileText, Loader2, Plus, X } from "lucide-react";
import { useCart } from "@/lib/cart";
import { useSellerSession } from "@/lib/sale-price";
import { quoteBadge, quoteError, quoteTitle, useQuoteTotal, useQuotes } from "@/lib/quotes";
import QuoteEditor from "./QuoteEditor";

const MAX_CHIPS = 4;
/** Pantallas donde se agregan productos. */
const ROUTES = ["/search", "/product/", "/comparador"];

/**
 * Presupuestos flotantes del modo vendedor: una ficha por presupuesto (iniciales
 * del cliente o número), la activa resaltada y "+" para uno nuevo. Convive con
 * la burbuja del carrito: si el carrito está a la vista, se corre a su izquierda.
 */
export default function QuoteFloat() {
  const pathname = usePathname() ?? "";
  const quotes = useQuotes();
  const { isSeller } = useSellerSession();
  const { hydrated: cartHydrated } = useCart();
  const totalOf = useQuoteTotal();
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);

  const onRoute = ROUTES.some((r) => pathname === r || pathname.startsWith(r));
  // Misma regla que la burbuja del carrito (CartFloat): solo en la búsqueda y para quien compra.
  const cartShown = !isSeller && cartHydrated && pathname.startsWith("/search");

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  // Aviso corto al agregar un producto desde la búsqueda o la ficha.
  useEffect(() => {
    if (!quotes.lastAdded) return;
    setFlash(quotes.lastAdded.name);
    const t = setTimeout(() => setFlash(null), 2200);
    return () => clearTimeout(t);
  }, [quotes.lastAdded]);

  const chips = useMemo(() => {
    const list = [...quotes.mine];
    if (quotes.active) {
      const idx = list.findIndex((q) => q.id === quotes.active!.id);
      if (idx > 0) list.unshift(list.splice(idx, 1)[0]);
    }
    return list.slice(0, MAX_CHIPS);
  }, [quotes.mine, quotes.active]);
  const hidden = quotes.mine.length - chips.length;

  if (!quotes.enabled || !quotes.loaded || !onRoute) return null;

  async function createNew() {
    setCreating(true);
    setError(null);
    try {
      await quotes.create();
      setOpen(true);
    } catch (err) {
      setError(quoteError(err, "No se pudo crear el presupuesto"));
    } finally {
      setCreating(false);
    }
  }

  function pick(id: string) {
    if (quotes.active?.id === id) setOpen((v) => !v);
    else {
      quotes.setActive(id);
      setOpen(true);
    }
  }

  const active = quotes.active;
  const position = cartShown
    ? "left-4 sm:left-auto sm:right-[8.75rem]"
    : "right-4 sm:right-5";

  return (
    <div
      className={`fixed z-50 flex flex-col gap-2 bottom-[max(1.25rem,env(safe-area-inset-bottom))] ${position} ${cartShown ? "items-start sm:items-end" : "items-end"}`}
    >
      {open && active && (
        <section
          aria-label={quoteTitle(active)}
          className="flex w-[min(26rem,calc(100vw-2rem))] max-h-[min(78dvh,40rem)] flex-col overflow-hidden rounded-2xl border border-surface-700 bg-surface-950 shadow-2xl"
        >
          <header className="flex shrink-0 items-center gap-2.5 border-b border-surface-800 px-3.5 py-2.5">
            <span className="flex h-7 min-w-[1.75rem] items-center justify-center rounded-full bg-brand-600 px-1.5 text-[11px] font-bold text-white">
              {quoteBadge(active)}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-semibold text-white">{quoteTitle(active)}</p>
              <p className="text-[10px] tabular-nums text-surface-500">
                {active.itemCount === 0 ? "Sin productos" : `${active.itemCount} u. · ${totalOf(active)}`}
              </p>
            </div>
            <Link href="/presupuestos" className="text-[10px] font-medium text-surface-500 hover:text-brand-300">
              Ver todos
            </Link>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded-md p-1 text-surface-500 hover:bg-surface-800 hover:text-white"
              aria-label="Cerrar presupuesto"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </header>
          <QuoteEditor quote={active} compact />
        </section>
      )}

      {(flash || error) && (
        <p
          role="status"
          className={`max-w-[18rem] truncate rounded-full px-3 py-1.5 text-[11px] font-medium shadow-lg ${
            error ? "bg-red-500/90 text-white" : "bg-emerald-400 text-surface-950"
          }`}
        >
          {error ?? `Agregado${active ? ` a ${quoteBadge(active)}` : ""}: ${flash}`}
        </p>
      )}

      <div className="flex items-center gap-1 rounded-full border border-surface-700 bg-surface-900/95 p-1 shadow-xl backdrop-blur">
        <Link
          href="/presupuestos"
          className="hidden items-center gap-1.5 pl-2 pr-1 text-[11px] font-semibold text-surface-300 hover:text-white sm:flex"
          title="Presupuestos"
        >
          <FileText className="h-3.5 w-3.5" />
          <span className="hidden md:inline">Presupuestos</span>
        </Link>
        {chips.map((q) => {
          const isActive = active?.id === q.id;
          return (
            <button
              key={q.id}
              type="button"
              onClick={() => pick(q.id)}
              title={`${quoteTitle(q)} · ${q.itemCount} u.`}
              aria-pressed={isActive}
              data-quote-chip={q.id}
              className={`relative flex h-9 min-w-[2.25rem] items-center justify-center rounded-full px-2 text-[11px] font-bold tabular-nums transition-all ${
                isActive
                  ? "bg-brand-600 text-white ring-2 ring-brand-400/40"
                  : "bg-surface-800 text-surface-300 hover:bg-surface-700 hover:text-white"
              } ${isActive && flash ? "scale-110" : ""}`}
            >
              {quoteBadge(q)}
              {q.itemCount > 0 && (
                <span
                  className={`absolute -right-0.5 -top-0.5 flex h-4 min-w-[1rem] items-center justify-center rounded-full px-1 text-[9px] font-bold ${
                    isActive ? "bg-emerald-400 text-surface-950" : "bg-surface-600 text-white"
                  }`}
                >
                  {q.itemCount > 99 ? "99+" : q.itemCount}
                </span>
              )}
            </button>
          );
        })}
        {hidden > 0 && (
          <Link
            href="/presupuestos"
            className="flex h-9 items-center rounded-full px-2 text-[11px] font-semibold text-surface-400 hover:text-white"
            title="Ver todos los presupuestos"
          >
            +{hidden}
          </Link>
        )}
        <button
          type="button"
          onClick={createNew}
          disabled={creating}
          className={`flex h-9 items-center justify-center gap-1 rounded-full border border-dashed border-surface-600 text-surface-300 transition-colors hover:border-brand-400 hover:text-white disabled:opacity-50 ${
            chips.length === 0 ? "px-3 text-xs font-semibold" : "w-9"
          }`}
          aria-label="Nuevo presupuesto"
          title="Nuevo presupuesto"
        >
          {creating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
          {chips.length === 0 && <span>Presupuesto</span>}
        </button>
      </div>
    </div>
  );
}
