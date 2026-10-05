"use client";

import { useEffect, useRef, useState } from "react";
import { fetchLaunchPromo, LAUNCH_PROMO_FALLBACK, type LaunchPromoState } from "@/lib/launchPromo";

/**
 * Promo de lanzamiento del plan Pro: barra de lugares tomados sobre el total
 * (la cuenta la lleva la API). La barra se llena al aparecer en pantalla.
 */
export function LaunchPromo() {
  const [promo, setPromo] = useState<LaunchPromoState>(LAUNCH_PROMO_FALLBACK);
  const { discountPercent, months, spots, taken } = promo;
  const left = Math.max(0, spots - taken);
  const ref = useRef<HTMLDivElement>(null);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const ctrl = new AbortController();
    void fetchLaunchPromo(ctrl.signal).then(setPromo);
    return () => ctrl.abort();
  }, []);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === "undefined") {
      setShown(true);
      return;
    }
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setShown(true);
          io.disconnect();
        }
      },
      { threshold: 0.4 }
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  if (left === 0) return null;
  const pct = Math.round((taken / spots) * 100);

  return (
    <div ref={ref} className="relative mt-6 rounded-[calc(var(--r)-6px)] border border-[rgb(157_159_255/0.35)] bg-[rgb(106_108_246/0.1)] p-4">
      <p className="text-sm font-semibold text-white">
        <span className="text-[var(--accent-2)]">{discountPercent}% off</span> los primeros {months} meses
      </p>
      <p className="mt-0.5 text-xs text-[var(--fg-2)]">Para los primeros {spots} comercios que entren a Pro.</p>

      <div
        className="mt-3.5 h-2 overflow-hidden rounded-full bg-[rgb(255_255_255/0.08)]"
        role="progressbar"
        aria-label="Lugares tomados de la promo"
        aria-valuemin={0}
        aria-valuemax={spots}
        aria-valuenow={taken}
      >
        <div
          className="h-full rounded-full bg-[linear-gradient(90deg,var(--accent),var(--accent-2))] shadow-[0_0_12px_rgb(157_159_255/0.6)] transition-[width] duration-[1200ms] ease-[cubic-bezier(0.16,1,0.3,1)] motion-reduce:transition-none"
          style={{ width: shown ? `${pct}%` : "0%" }}
        />
      </div>
      <div className="mt-2 flex items-baseline justify-between text-xs tabular-nums">
        <span className="text-[var(--fg-2)]">
          <span className="font-semibold text-white">{taken}</span> de {spots} lugares tomados
        </span>
        <span className="font-medium text-[var(--accent-2)]">
          {left === 1 ? "Queda 1" : `Quedan ${left}`}
        </span>
      </div>
    </div>
  );
}
