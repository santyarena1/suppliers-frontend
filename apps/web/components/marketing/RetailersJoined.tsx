"use client";

import { useEffect, useRef, useState } from "react";
import { Store } from "lucide-react";
import { fetchRetailersJoined } from "@/lib/retailersJoined";

const COUNT_UP_MS = 1100;

/**
 * Prueba social en la tarjeta Pro: cuántos comercios ya usan NODO
 * (la cuenta la lleva la API). El número no se muestra hasta tener el real;
 * cuando la tarjeta entra en pantalla cuenta de 1 hasta ese valor.
 */
export function RetailersJoined() {
  const [target, setTarget] = useState<number | null>(null);
  const [visible, setVisible] = useState(false);
  const [shown, setShown] = useState<number | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const ctrl = new AbortController();
    void fetchRetailersJoined(ctrl.signal).then(setTarget);
    return () => ctrl.abort();
  }, []);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === "undefined") {
      setVisible(true);
      return;
    }
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          io.disconnect();
        }
      },
      { threshold: 0.4 }
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    if (target == null || !visible) return;
    if (target <= 1 || window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
      setShown(target);
      return;
    }
    let frame = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / COUNT_UP_MS);
      const eased = 1 - Math.pow(1 - t, 3);
      setShown(Math.max(1, Math.round(1 + (target - 1) * eased)));
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [target, visible]);

  return (
    <div
      ref={ref}
      className="relative mt-6 flex items-center gap-3 rounded-[calc(var(--r)-6px)] border border-[rgb(157_159_255/0.35)] bg-[rgb(106_108_246/0.1)] p-4"
    >
      <span className="grid h-9 w-9 flex-shrink-0 place-items-center rounded-full bg-[linear-gradient(135deg,var(--accent),var(--accent-2))] text-white" aria-hidden>
        <Store className="h-4 w-4" />
      </span>
      <p className="text-sm leading-snug text-[var(--fg-2)]">
        <span className={`font-semibold tabular-nums text-white transition-opacity duration-300 ${shown == null ? "opacity-0" : "opacity-100"}`}>
          {shown ?? target ?? 0} comercios
        </span>{" "}
        ya compran a sus distribuidores con NODO
      </p>
    </div>
  );
}
