"use client";

import { useEffect, useState } from "react";
import { Store } from "lucide-react";
import { fetchRetailersJoined, RETAILERS_JOINED_FALLBACK } from "@/lib/retailersJoined";

/**
 * Prueba social en la tarjeta Pro: cuántos comercios ya usan NODO
 * (la cuenta la lleva la API).
 */
export function RetailersJoined() {
  const [count, setCount] = useState(RETAILERS_JOINED_FALLBACK);

  useEffect(() => {
    const ctrl = new AbortController();
    void fetchRetailersJoined(ctrl.signal).then(setCount);
    return () => ctrl.abort();
  }, []);

  return (
    <div className="relative mt-6 flex items-center gap-3 rounded-[calc(var(--r)-6px)] border border-[rgb(157_159_255/0.35)] bg-[rgb(106_108_246/0.1)] p-4">
      <span className="grid h-9 w-9 flex-shrink-0 place-items-center rounded-full bg-[linear-gradient(135deg,var(--accent),var(--accent-2))] text-white" aria-hidden>
        <Store className="h-4 w-4" />
      </span>
      <p className="text-sm leading-snug text-[var(--fg-2)]">
        <span className="font-semibold tabular-nums text-white">{count} comercios</span> ya compran a sus distribuidores con NODO
      </p>
    </div>
  );
}
