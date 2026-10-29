"use client";

import { useState } from "react";
import NodoSpinner from "@/components/NodoSpinner";
import { usePrefs } from "@/lib/prefs";
import { TIER_CHOICES, TIER_HINT, TIER_LABEL, autoBuild, type TierChoice } from "@/lib/pc-builder/auto";
import { type Build, type Qty } from "@/lib/pc-builder/compat";
import { inStock, loadAllSteps, useOfferPricer } from "@/lib/pc-builder/state";
import { money } from "./BuildSummary";

/**
 * Armado automático: el comercio elige la gama y, si quiere, el presupuesto;
 * NODO completa las piezas que faltan con lo que tiene stock en sus
 * distribuidores. Lo que ya eligió a mano no se toca.
 */
export default function AutoBuildPanel({
  build, qty, onApply,
}: {
  build: Build;
  qty: Qty;
  /** `message`: el total y los avisos (falta una pieza de la gama, el presupuesto no alcanza…). */
  onApply: (parts: Build, message: string) => void;
}) {
  const price = useOfferPricer();
  const { currency } = usePrefs();
  const [tier, setTier] = useState<TierChoice>("gamer-mid");
  const [budget, setBudget] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const chosen = Object.keys(build).length;

  async function run() {
    setBusy(true);
    setError(null);
    try {
      const catalog = await loadAllSteps();
      const raw = budget.replace(/\./g, "").replace(",", ".").trim();
      const value = raw ? Number(raw) : null;
      const res = autoBuild({
        tier,
        budget: value && value > 0 ? value : null,
        locked: build,
        catalog,
        qty,
        inStock,
        price: (o) => {
          const p = price(o);
          return p ? { amount: p.amount } : null;
        },
      });
      if (!res.picked.length) {
        setError(res.notes[0] ?? "No encontré piezas de esa gama con stock.");
        return;
      }
      onApply(res.parts, [`${TIER_LABEL[res.tier]}: ${money(res.total, currency)}.`, ...res.notes].join(" "));
    } catch {
      setError("No se pudieron traer los productos. Reintentá en un momento.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-xl border border-surface-800 bg-surface-900/60 px-4 py-3" aria-label="Armado automático">
      <div className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1 text-xs text-surface-400">
          Armado automático
          <select
            value={tier}
            onChange={(e) => setTier(e.target.value as TierChoice)}
            className="h-9 rounded-lg border border-surface-700 bg-surface-950 px-2 text-sm text-white focus:border-brand-500 focus:outline-none"
          >
            {TIER_CHOICES.map((t) => <option key={t} value={t}>{TIER_LABEL[t]}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-surface-400">
          Presupuesto de costo{tier === "gamer-auto" ? "" : " (opcional)"}
          <input
            value={budget}
            onChange={(e) => setBudget(e.target.value)}
            inputMode="decimal"
            placeholder={currency === "USD" ? "900" : "1.200.000"}
            className="h-9 w-40 rounded-lg border border-surface-700 bg-surface-950 px-3 text-right font-mono text-sm text-white placeholder:text-surface-600 focus:border-brand-500 focus:outline-none"
          />
        </label>
        <button
          type="button"
          disabled={busy}
          onClick={() => void run()}
          className="inline-flex h-9 items-center gap-2 rounded-lg border border-surface-700 px-3 text-sm font-semibold text-surface-200 hover:border-surface-500 hover:text-white disabled:opacity-50"
        >
          {busy && <NodoSpinner className="h-4 w-4" />}
          {chosen ? "Completar lo que falta" : "Armar"}
        </button>
      </div>
      <p className="mt-2 text-[11px] text-surface-500">{TIER_HINT[tier]}</p>
      {error && <p className="mt-1 text-xs text-amber-300" role="status">{error}</p>}
    </section>
  );
}
