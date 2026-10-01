"use client";

import { useEffect, useState } from "react";
import {
  ArrowUpDown,
  Check,
  ChevronDown,
  DollarSign,
  GitCompare,
  Home,
  MessageSquare,
  Minus,
  Newspaper,
  Plus,
  Search,
  ShoppingCart,
  Truck,
} from "lucide-react";
import NodoLogo from "@/components/NodoLogo";
import { DEMO_SHIPPING, SEARCHES, ars, withIva, type DemoProduct } from "@/lib/marketing-demo";
import { useInView, usePrefersReducedMotion } from "./Reveal";

type Phase = "typing" | "results";

export const usd = (n: number) =>
  `US$ ${n.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const ADDED_INDEX = 0;

function Sidebar({ cart }: { cart: number }) {
  const items = [
    { icon: Home, label: "Inicio" },
    { icon: Search, label: "Búsqueda", active: true },
    { icon: GitCompare, label: "Comparador" },
    { icon: ShoppingCart, label: "Carrito", badge: cart },
    { icon: MessageSquare, label: "Mensajes" },
    { icon: Newspaper, label: "Novedades" },
  ];
  return (
    <aside className="hidden w-48 flex-shrink-0 border-r border-[var(--line)] bg-[#0e1024] px-3 py-4 md:block" aria-hidden>
      <div className="mb-6 flex items-center gap-2 px-2">
        <NodoLogo className="h-6 w-6" />
        <span className="text-sm font-semibold text-white">Nodo</span>
      </div>
      <ul className="flex flex-col gap-1">
        {items.map((it) => (
          <li
            key={it.label}
            className={`flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] ${
              it.active ? "bg-[var(--accent-soft)] text-[#c9caff]" : "text-[var(--fg-3)]"
            }`}
          >
            <it.icon className="h-4 w-4" />
            <span className="flex-1">{it.label}</span>
            {it.badge ? (
              <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-[var(--accent)] px-1.5 text-[11px] font-semibold text-white">
                {it.badge}
              </span>
            ) : null}
          </li>
        ))}
      </ul>
    </aside>
  );
}

/**
 * Envío por unidad: el costo habitual del pedido repartido entre las unidades
 * de ese distribuidor en el carrito, contando la que se está por sumar.
 */
function shippingPerUnit(p: DemoProduct, qty: number, cartUnitsOfDistributor: number): number | null {
  const ship = DEMO_SHIPPING[p.distributor];
  if (!ship) return null;
  return ship.ars / Math.max(1, cartUnitsOfDistributor + (qty > 0 ? 0 : 1));
}

function ProductCard({
  p,
  qty,
  delay,
  flash,
  desktopOnly,
  cartUnits,
}: {
  p: DemoProduct;
  qty: number;
  delay: number;
  flash: boolean;
  desktopOnly: boolean;
  /** Unidades de este distribuidor que ya están en el carrito. */
  cartUnits: number;
}) {
  const perUnit = shippingPerUnit(p, qty, cartUnits);
  return (
    <article
      data-field-row
      className={`nl-anim-in ${desktopOnly ? "hidden sm:flex" : "flex"} flex-col overflow-hidden rounded-xl border bg-[#141733] transition-colors duration-500 ${
        flash ? "border-[var(--ember)]" : "border-[var(--line)]"
      }`}
      style={{ animationDelay: `${delay}ms` }}
    >
      <div className="relative flex h-24 items-center justify-center bg-white p-2 sm:h-32 sm:p-3">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={p.image} alt={p.name} loading="lazy" className="h-full w-full object-contain" />
        {/* Distintivo del distribuidor sobre la foto, como en la app */}
        <span className="absolute left-1.5 top-1.5 inline-flex max-w-[calc(100%-0.75rem)] items-center gap-1.5 rounded-full border border-[rgb(64_51_252/0.35)] bg-white/95 py-0.5 pl-0.5 pr-2 text-[10.5px] font-semibold text-[#1e1b4b] shadow-sm">
          <span className="flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-full bg-[#4033fc] font-mono text-[8.5px] text-white">
            {p.distributor.replace(/D/g, "") || "L"}
          </span>
          <span className="truncate">{p.distributor}</span>
        </span>
      </div>
      <div className="flex flex-1 flex-col gap-2 p-2.5 sm:p-3">
        <div>
          <p className="line-clamp-2 min-h-[2.25rem] text-[12px] font-semibold leading-snug text-white sm:min-h-[2.5rem] sm:text-[13px]">{p.name}</p>
          <p className="mt-0.5 hidden text-[11px] text-[var(--fg-3)] sm:block">
            {p.brand} · {p.category}
          </p>
        </div>
        <div>
          <p className="text-[14px] font-bold tabular-nums text-white sm:text-[15px]">
            {usd(p.net)}{" "}
            <span className="block text-[10.5px] font-normal text-[var(--fg-3)] sm:inline sm:text-[11px]">+ IVA {p.iva.toLocaleString("es-AR")} %</span>
          </p>
          <p className="text-[11px] tabular-nums text-[var(--fg-2)]">Final {usd(withIva(p.net, p.iva))}</p>
          {perUnit != null && (
            <p className="mt-1 flex items-center gap-1 font-mono text-[10.5px] tabular-nums text-[var(--fg-3)]">
              <Truck className="h-3 w-3 flex-shrink-0" aria-hidden />
              <span className="truncate">
                Envío<span className="hidden sm:inline"> aprox.</span> {ars(perUnit)}/u
                <span className="hidden sm:inline"> · {DEMO_SHIPPING[p.distributor].label}</span>
              </span>
            </p>
          )}
        </div>
        <span className="inline-flex w-fit items-center gap-1 rounded-md border border-[rgb(62_207_142/0.4)] px-1.5 py-0.5 font-mono text-[10.5px] text-[#7fe3b4]">
          <Check className="h-3 w-3" /> {p.stock} U.
        </span>
        <p className="truncate border-t border-[var(--line)] pt-2 font-mono text-[10px] text-[var(--fg-3)] sm:text-[10.5px]">
          {p.code} · {p.distributor}
        </p>
        <div className="flex items-center gap-1.5">
          <span className="hidden h-7 w-7 items-center justify-center rounded-md border border-[var(--line-2)] text-[var(--fg-3)] sm:flex">
            <GitCompare className="h-3.5 w-3.5" />
          </span>
          <span className="hidden h-7 w-7 items-center justify-center rounded-md border border-[var(--line-2)] text-[var(--fg-3)] sm:flex">
            <DollarSign className="h-3.5 w-3.5" />
          </span>
          <span className="ml-auto flex h-7 items-center gap-2 rounded-md border border-[var(--line-2)] px-2 text-[12px] tabular-nums text-white">
            <Minus className="h-3 w-3 text-[var(--fg-3)]" />
            <span className="w-4 text-center">{qty}</span>
            <Plus className="h-3 w-3 text-[var(--accent-2)]" />
          </span>
        </div>
        <p className="hidden font-mono text-[10px] text-[var(--fg-3)] sm:block">{p.updated}</p>
      </div>
    </article>
  );
}

/**
 * La pantalla de búsqueda de NODO, reproducida con productos reales: se escribe
 * la búsqueda, aparecen los resultados de todos los distribuidores y se suma un
 * producto al carrito. Cada vuelta es otra búsqueda (memorias, monitores, placas
 * de video). Sin recomendar a ningún distribuidor ni marca.
 */
export function SearchDemo() {
  const reduced = usePrefersReducedMotion();
  const { ref, inView } = useInView<HTMLDivElement>(0.25);
  const [cycle, setCycle] = useState(0);
  const search = SEARCHES[cycle % SEARCHES.length];
  const SEARCH_QUERY = search.query;
  const SEARCH_RESULTS = search.results;
  const ADDED_QTY = search.addQty;
  const [typed, setTyped] = useState(SEARCH_QUERY.length);
  const [phase, setPhase] = useState<Phase>("results");
  const [qty, setQty] = useState(0);
  const [started, setStarted] = useState(false);

  // Arranca la primera vez que se ve y después se repite sola: hacer scroll no la reinicia.
  useEffect(() => {
    if (inView) setStarted(true);
  }, [inView]);

  useEffect(() => {
    if (reduced) {
      setQty(ADDED_QTY);
      return;
    }
    if (!started) return;
    setPhase("typing");
    setTyped(0);
    setQty(0);
    const timers: ReturnType<typeof setTimeout>[] = [];
    for (let i = 1; i <= SEARCH_QUERY.length; i++) timers.push(setTimeout(() => setTyped(i), 500 + i * 75));
    const typedAt = 500 + SEARCH_QUERY.length * 75;
    timers.push(setTimeout(() => setPhase("results"), typedAt + 450));
    for (let q = 1; q <= ADDED_QTY; q++) timers.push(setTimeout(() => setQty(q), typedAt + 2600 + q * 110));
    timers.push(setTimeout(() => setCycle((c) => c + 1), typedAt + 12000));
    return () => timers.forEach(clearTimeout);
  }, [reduced, started, cycle, SEARCH_QUERY, ADDED_QTY]);

  const added = qty === ADDED_QTY;

  return (
    <div ref={ref} className="relative">
      <div
        className="overflow-hidden rounded-[18px] border border-[var(--line-2)] bg-[#0f1226] shadow-[0_40px_120px_-40px_rgb(64_51_252/0.55),0_0_0_1px_rgb(255_255_255/0.03)_inset]"
        role="img"
        aria-label={`Pantalla de búsqueda de NODO con resultados para “${SEARCH_QUERY}” de varios distribuidores`}
      >
        <div className="flex">
          <Sidebar cart={added ? 1 : 0} />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 border-b border-[var(--line)] px-4 py-3">
              <div className="flex h-10 min-w-0 flex-1 items-center gap-2.5 rounded-lg border border-[var(--line-2)] bg-[#141733] px-3">
                <Search className="h-4 w-4 flex-shrink-0 text-[var(--fg-3)]" />
                <span className="truncate text-sm text-white">
                  {SEARCH_QUERY.slice(0, typed)}
                  {phase === "typing" && <span className="nl-caret" />}
                </span>
              </div>
              <span className="nl-btn nl-btn--primary nl-btn--sm h-10">
                <Search className="h-4 w-4" /> Buscar
              </span>
            </div>
            <div className="hidden flex-wrap items-center gap-2 border-b border-[var(--line)] px-4 py-2.5 sm:flex">
              <span className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-[var(--line)] bg-[#141733] px-3 text-xs text-[var(--fg-2)]">
                <Truck className="h-3.5 w-3.5" /> Incluir envío
              </span>
              {[`Categoría · ${search.category}`, `Marca · ${search.brand}`, "Todos · Distribuidor"].map((f) => (
                <span
                  key={f}
                  className="inline-flex h-8 items-center gap-2 rounded-lg border border-[var(--line)] bg-[#141733] px-3 text-xs text-[var(--fg-2)]"
                >
                  {f} <ChevronDown className="h-3.5 w-3.5" />
                </span>
              ))}
              <span className="ml-auto inline-flex items-center gap-1.5 text-xs text-[var(--fg-3)]">
                <strong className="text-white">{SEARCH_RESULTS.length}</strong> productos ·{" "}
                <strong className="text-white">{new Set(SEARCH_RESULTS.map((p) => p.distributor)).size}</strong> distribuidores
                <ArrowUpDown className="ml-2 h-3.5 w-3.5" /> Precio
              </span>
            </div>
            <div className="p-2.5 sm:min-h-[29rem] sm:p-4">
              {/* La grilla de resultados está siempre montada: mientras se escribe la
                  búsqueda queda invisible bajo los placeholders, así la pantalla no
                  cambia de alto y la página no salta. */}
              <div className="relative">
                <div
                  className={`grid grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-3 ${phase === "results" ? "" : "invisible"}`}
                  aria-hidden={phase !== "results"}
                >
                  {SEARCH_RESULTS.map((p, i) => (
                    <ProductCard
                      key={`${p.code}-${cycle}-${phase}`}
                      p={p}
                      delay={reduced ? 0 : i * 90}
                      qty={i === ADDED_INDEX ? qty : 0}
                      desktopOnly={i >= 4}
                      cartUnits={p.distributor === SEARCH_RESULTS[ADDED_INDEX].distributor ? qty : 0}
                      flash={i === ADDED_INDEX && qty > 0 && !added}
                    />
                  ))}
                </div>
                {phase !== "results" && (
                  <div className="absolute inset-0 grid grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-3" aria-hidden>
                    {SEARCH_RESULTS.map((p, i) => (
                      <div
                        key={p.code}
                        className={`${i >= 4 ? "hidden sm:block" : ""} animate-pulse rounded-xl border border-[var(--line)] bg-[#12152e]`}
                      />
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {added && (
        <div
          className="nl-anim-in absolute -bottom-6 right-4 flex items-center gap-3 rounded-xl border border-[var(--line-2)] bg-[#161a3a]/95 px-4 py-3 shadow-[0_20px_50px_-15px_rgb(0_0_0/0.8)] backdrop-blur sm:right-8"
          role="status"
        >
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[rgb(255_106_61/0.15)]">
            <ShoppingCart className="h-3.5 w-3.5 text-[var(--ember)]" aria-hidden />
          </span>
          <span>
            <span className="block text-sm font-semibold text-white">
              {ADDED_QTY} × {SEARCH_RESULTS[ADDED_INDEX].name}
            </span>
            <span className="block text-xs text-[var(--fg-3)]">Sumado al carrito de {SEARCH_RESULTS[ADDED_INDEX].distributor}</span>
          </span>
        </div>
      )}
    </div>
  );
}
