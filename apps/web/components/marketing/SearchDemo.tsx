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
} from "lucide-react";
import NodoLogo from "@/components/NodoLogo";
import { SEARCH_QUERY, SEARCH_RESULTS, withIva, type DemoProduct } from "@/lib/marketing-demo";
import { useInView, usePrefersReducedMotion } from "./Reveal";

type Phase = "typing" | "results";

export const usd = (n: number) =>
  `US$ ${n.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const ADDED_INDEX = 0;
const ADDED_QTY = 8;

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

function ProductCard({
  p,
  qty,
  delay,
  flash,
  desktopOnly,
}: {
  p: DemoProduct;
  qty: number;
  delay: number;
  flash: boolean;
  desktopOnly: boolean;
}) {
  return (
    <article
      data-field-row
      className={`nl-anim-in ${desktopOnly ? "hidden sm:flex" : "flex"} flex-col overflow-hidden rounded-xl border bg-[#141733] transition-colors duration-500 ${
        flash ? "border-[var(--ember)]" : "border-[var(--line)]"
      }`}
      style={{ animationDelay: `${delay}ms` }}
    >
      <div className="flex h-32 items-center justify-center bg-white p-3">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={p.image} alt={p.name} loading="lazy" className="h-full w-full object-contain" />
      </div>
      <div className="flex flex-1 flex-col gap-2 p-3">
        <div>
          <p className="line-clamp-2 min-h-[2.5rem] text-[13px] font-semibold leading-snug text-white">{p.name}</p>
          <p className="mt-0.5 text-[11px] text-[var(--fg-3)]">
            {p.brand} · {p.category}
          </p>
        </div>
        <div>
          <p className="text-[15px] font-bold tabular-nums text-white">
            {usd(p.net)}{" "}
            <span className="text-[11px] font-normal text-[var(--fg-3)]">+ IVA {p.iva.toLocaleString("es-AR")} %</span>
          </p>
          <p className="text-[11px] tabular-nums text-[var(--fg-2)]">Final {usd(withIva(p.net, p.iva))}</p>
        </div>
        <span className="inline-flex w-fit items-center gap-1 rounded-md border border-[rgb(62_207_142/0.4)] px-1.5 py-0.5 font-mono text-[10.5px] text-[#7fe3b4]">
          <Check className="h-3 w-3" /> {p.stock} U.
        </span>
        <p className="truncate border-t border-[var(--line)] pt-2 font-mono text-[10.5px] text-[var(--fg-3)]">
          {p.code} · {p.distributor}
        </p>
        <div className="flex items-center gap-1.5">
          <span className="flex h-7 w-7 items-center justify-center rounded-md border border-[var(--line-2)] text-[var(--fg-3)]">
            <GitCompare className="h-3.5 w-3.5" />
          </span>
          <span className="flex h-7 w-7 items-center justify-center rounded-md border border-[var(--line-2)] text-[var(--fg-3)]">
            <DollarSign className="h-3.5 w-3.5" />
          </span>
          <span className="ml-auto flex h-7 items-center gap-2 rounded-md border border-[var(--line-2)] px-2 text-[12px] tabular-nums text-white">
            <Minus className="h-3 w-3 text-[var(--fg-3)]" />
            <span className="w-4 text-center">{qty}</span>
            <Plus className="h-3 w-3 text-[var(--accent-2)]" />
          </span>
        </div>
        <p className="font-mono text-[10px] text-[var(--fg-3)]">{p.updated}</p>
      </div>
    </article>
  );
}

/**
 * La pantalla de búsqueda de NODO, reproducida con productos reales: se escribe
 * la búsqueda, aparecen los resultados de todos los distribuidores y se suma un
 * producto al carrito. Sin recomendar a ninguno.
 */
export function SearchDemo() {
  const reduced = usePrefersReducedMotion();
  const { ref, inView } = useInView<HTMLDivElement>(0.25);
  const [typed, setTyped] = useState(SEARCH_QUERY.length);
  const [phase, setPhase] = useState<Phase>("results");
  const [qty, setQty] = useState(0);
  const [cycle, setCycle] = useState(0);
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
    timers.push(setTimeout(() => setCycle((c) => c + 1), typedAt + 16000));
    return () => timers.forEach(clearTimeout);
  }, [reduced, started, cycle]);

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
              {["Categoría · Memorias", "Marca · ADATA", "Todos · Distribuidor"].map((f) => (
                <span
                  key={f}
                  className="inline-flex h-8 items-center gap-2 rounded-lg border border-[var(--line)] bg-[#141733] px-3 text-xs text-[var(--fg-2)]"
                >
                  {f} <ChevronDown className="h-3.5 w-3.5" />
                </span>
              ))}
              <span className="ml-auto inline-flex items-center gap-1.5 text-xs text-[var(--fg-3)]">
                <strong className="text-white">{SEARCH_RESULTS.length}</strong> productos ·{" "}
                <strong className="text-white">4</strong> distribuidores
                <ArrowUpDown className="ml-2 h-3.5 w-3.5" /> Precio
              </span>
            </div>
            <div className="min-h-[29rem] p-4">
              {phase === "results" || cycle > 0 ? (
                <div className={`grid gap-3 transition-opacity duration-300 sm:grid-cols-2 lg:grid-cols-3 ${phase === "typing" ? "opacity-30" : ""}`}>
                  {SEARCH_RESULTS.map((p, i) => (
                    <ProductCard
                      key={`${p.code}-${cycle}-${phase}`}
                      p={p}
                      delay={reduced ? 0 : i * 90}
                      qty={i === ADDED_INDEX ? qty : 0}
                      desktopOnly={i >= 3}
                      flash={i === ADDED_INDEX && qty > 0 && !added}
                    />
                  ))}
                </div>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3" aria-hidden>
                  {SEARCH_RESULTS.map((p) => (
                    <div key={p.code} className="h-[23.5rem] animate-pulse rounded-xl border border-[var(--line)] bg-[#12152e]" />
                  ))}
                </div>
              )}
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
