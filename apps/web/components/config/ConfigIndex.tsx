"use client";

import { useEffect, useRef, useState, type RefObject } from "react";

export type ConfigIndexItem = { id: string; label: string; group: string };

/**
 * Índice de Configuración: en escritorio una columna fija a la izquierda con
 * los grupos; en celular una fila deslizable arriba. Marca la sección que se
 * está viendo y lleva a cada una con un clic.
 */
export default function ConfigIndex({
  items,
  scrollRoot,
}: {
  items: ConfigIndexItem[];
  scrollRoot: RefObject<HTMLElement | null>;
}) {
  const [active, setActive] = useState<string | null>(items[0]?.id ?? null);
  const ids = items.map((i) => i.id).join(",");

  // Mientras se hace el scroll suave de un clic, la activa es la elegida.
  const locked = useRef(false);
  const unlockTimer = useRef<number | null>(null);
  const chipsRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const root = scrollRoot.current;
    if (!root) return;
    const order = ids.split(",").filter(Boolean);
    let frame = 0;
    const update = () => {
      frame = 0;
      if (locked.current) return;
      const rootTop = root.getBoundingClientRect().top;
      // Al final de la página, la última sección (puede ser corta y no llegar arriba).
      if (root.scrollTop + root.clientHeight >= root.scrollHeight - 4) {
        setActive(order[order.length - 1] ?? null);
        return;
      }
      let current = order[0] ?? null;
      for (const id of order) {
        const el = document.getElementById(id);
        if (el && el.getBoundingClientRect().top - rootTop <= 120) current = id;
      }
      setActive(current);
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    update();
    root.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      root.removeEventListener("scroll", onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [ids, scrollRoot]);

  // En celular, la ficha activa siempre a la vista.
  useEffect(() => {
    // Solo se mueve la fila de fichas: un scrollIntoView cortaría el scroll de la página.
    const row = chipsRef.current;
    const chip = row?.querySelector<HTMLElement>(`[data-id="${active}"]`);
    if (!row || !chip || row.offsetParent === null) return;
    row.scrollTo({ left: chip.offsetLeft - (row.clientWidth - chip.clientWidth) / 2, behavior: "smooth" });
  }, [active]);

  function go(id: string) {
    const el = document.getElementById(id);
    if (!el) return;
    setActive(id);
    locked.current = true;
    if (unlockTimer.current) window.clearTimeout(unlockTimer.current);
    unlockTimer.current = window.setTimeout(() => {
      locked.current = false;
    }, 900);
    el.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  const groups = items.reduce<{ group: string; items: ConfigIndexItem[] }[]>((acc, item) => {
    const last = acc[acc.length - 1];
    if (last && last.group === item.group) last.items.push(item);
    else acc.push({ group: item.group, items: [item] });
    return acc;
  }, []);

  return (
    <>
      <nav aria-label="Secciones de configuración" className="hidden lg:block sticky top-6 self-start">
        {groups.map((g) => (
          <div key={g.group} className="mb-5">
            <p className="px-3 mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-surface-600">{g.group}</p>
            <ul className="flex flex-col gap-0.5">
              {g.items.map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    onClick={() => go(item.id)}
                    aria-current={active === item.id ? "true" : undefined}
                    className={`w-full text-left text-[13px] px-3 py-1.5 rounded-lg border-l-2 transition-colors ${
                      active === item.id
                        ? "border-brand-500 bg-brand-600/10 text-white"
                        : "border-transparent text-surface-400 hover:text-surface-100 hover:bg-surface-900"
                    }`}
                  >
                    {item.label}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </nav>

      <nav
        ref={chipsRef}
        aria-label="Secciones de configuración"
        className="lg:hidden sticky top-0 z-10 -mx-4 sm:-mx-6 px-4 sm:px-6 py-2.5 bg-surface-950/95 backdrop-blur border-b border-surface-800 flex gap-1.5 overflow-x-auto"
      >
        {items.map((item) => (
          <button
            key={item.id}
            data-id={item.id}
            type="button"
            onClick={() => go(item.id)}
            className={`flex-shrink-0 text-xs px-3 py-1.5 rounded-full border transition-colors ${
              active === item.id
                ? "border-brand-500 bg-brand-600/15 text-brand-300"
                : "border-surface-700 text-surface-400 hover:text-surface-100"
            }`}
          >
            {item.label}
          </button>
        ))}
      </nav>
    </>
  );
}

/** Ancla de una sección: deja lugar para la fila del índice en celular al saltar. */
export function ConfigAnchor({ id, children }: { id: string; children: React.ReactNode }) {
  return (
    <div id={id} className="scroll-mt-16 lg:scroll-mt-4">
      {children}
    </div>
  );
}

/** Título de grupo entre secciones. */
export function ConfigGroupTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-[11px] font-semibold uppercase tracking-wider text-surface-500 pt-2 first:pt-0">{children}</h2>
  );
}
