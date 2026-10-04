"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, Users } from "lucide-react";
import { useCart } from "@/lib/cart";
import { getUser } from "@/lib/auth";
import { ALL_PEOPLE, authorsOf, personLabel, type OrderFilter } from "@/lib/cartPeople";

type Mode = OrderFilter["mode"];

const MODES: { mode: Mode; label: string; hint: string }[] = [
  { mode: "all", label: "De todos", hint: "El pedido lleva todo el carrito." },
  { mode: "only", label: "Solo de…", hint: "El pedido lleva solo lo que pusieron estas personas." },
  { mode: "except", label: "Todos menos…", hint: "El pedido deja afuera lo de estas personas." },
];

/**
 * «Productos de»: con lo de quién se arma el pedido. Aparece cuando en el
 * carrito hay productos de más de una persona del equipo.
 */
export default function OrderPeopleFilter() {
  const { items, people, orderFilter, setOrderFilter } = useCart();
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);
  const me = getUser()?.id ?? null;
  const authors = useMemo(() => authorsOf(items), [items]);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  // Si se va del carrito alguien del filtro, el filtro se corrige solo.
  useEffect(() => {
    if (orderFilter.mode === "all") return;
    const present = new Set(authors.map((a) => a.userId));
    const kept = orderFilter.people.filter((id) => present.has(id));
    if (kept.length === orderFilter.people.length) return;
    setOrderFilter(kept.length ? { ...orderFilter, people: kept } : ALL_PEOPLE);
  }, [authors, orderFilter, setOrderFilter]);

  if (authors.length < 2) return null;

  const label = (id: string) => personLabel(id, people, me);
  const selected = orderFilter.mode === "all" ? [] : orderFilter.people;
  const summary =
    orderFilter.mode === "all"
      ? "De todos"
      : `${orderFilter.mode === "only" ? "Solo de" : "Todos menos"} ${selected.map(label).join(", ")}`;

  function pickMode(mode: Mode) {
    if (mode === "all") {
      setOrderFilter(ALL_PEOPLE);
      return;
    }
    // Al cambiar de modo se conserva la selección; arranca con vos si no había nadie.
    const start = selected.length ? selected : me && authors.some((a) => a.userId === me) ? [me] : [authors[0].userId];
    setOrderFilter({ mode, people: start });
  }

  function toggle(userId: string) {
    if (orderFilter.mode === "all") return;
    const next = selected.includes(userId) ? selected.filter((id) => id !== userId) : [...selected, userId];
    setOrderFilter(next.length ? { mode: orderFilter.mode, people: next } : ALL_PEOPLE);
  }

  const active = orderFilter.mode !== "all";

  return (
    <div className="relative" ref={boxRef}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className={`flex items-center gap-1.5 text-sm rounded-md px-3 py-1.5 border transition-colors max-w-[260px] ${
          active
            ? "border-brand-500/60 bg-brand-500/10 text-brand-200 hover:border-brand-400"
            : "border-surface-700 text-surface-300 hover:text-white hover:border-surface-500"
        }`}
      >
        <Users className="w-3.5 h-3.5 flex-shrink-0" />
        <span className="text-surface-500 hidden sm:inline">Productos:</span>
        <span className="truncate">{summary}</span>
        <ChevronDown className="w-3 h-3 flex-shrink-0 text-surface-500" />
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1.5 w-72 bg-surface-950 border border-surface-800 rounded-md shadow-xl z-30 p-1.5">
          <div className="grid grid-cols-3 gap-1 p-0.5 bg-surface-900 rounded">
            {MODES.map((m) => (
              <button
                key={m.mode}
                type="button"
                onClick={() => pickMode(m.mode)}
                className={`text-xs rounded px-2 py-1.5 transition-colors ${
                  orderFilter.mode === m.mode ? "bg-surface-700 text-white" : "text-surface-400 hover:text-surface-100"
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>
          <p className="text-[11px] text-surface-500 px-2 pt-2 pb-1">
            {MODES.find((m) => m.mode === orderFilter.mode)?.hint} Lo que queda afuera sigue en el carrito.
          </p>
          <ul className="mt-1">
            {authors.map((a) => {
              const checked = selected.includes(a.userId);
              return (
                <li key={a.userId}>
                  <button
                    type="button"
                    disabled={!active}
                    onClick={() => toggle(a.userId)}
                    className="w-full flex items-center gap-2.5 px-2 py-1.5 rounded text-sm text-left hover:bg-surface-900 disabled:hover:bg-transparent disabled:cursor-default"
                  >
                    <span
                      className={`w-4 h-4 flex-shrink-0 rounded-sm border flex items-center justify-center ${
                        !active
                          ? "border-surface-800"
                          : checked
                            ? "border-brand-500 bg-brand-500 text-white"
                            : "border-surface-600"
                      }`}
                    >
                      {active && checked && <Check className="w-3 h-3" />}
                    </span>
                    <PersonDot userId={a.userId} />
                    <span className={`flex-1 truncate ${active ? "text-surface-100" : "text-surface-400"}`}>{label(a.userId)}</span>
                    <span className="text-xs text-surface-500 tabular-nums">
                      {a.units} u.
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}

const DOT_COLORS = ["bg-sky-400", "bg-emerald-400", "bg-amber-400", "bg-rose-400", "bg-violet-400", "bg-teal-400", "bg-orange-400"];

/** Color fijo por persona, igual en el filtro y en cada línea. */
export function personColor(userId: string): string {
  if (userId === "_") return "bg-surface-600";
  let h = 0;
  for (const ch of userId) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return DOT_COLORS[h % DOT_COLORS.length];
}

export function PersonDot({ userId }: { userId: string }) {
  return <span className={`w-2 h-2 rounded-full flex-shrink-0 ${personColor(userId)}`} aria-hidden />;
}
