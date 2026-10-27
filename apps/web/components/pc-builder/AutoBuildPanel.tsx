"use client";

import { useState } from "react";
import { ChevronDown, WandSparkles } from "lucide-react";
import NodoSpinner from "@/components/NodoSpinner";
import { usePrefs } from "@/lib/prefs";
import { PROFILE_HINT, PROFILE_LABEL, autoBuild, type Profile } from "@/lib/pc-builder/auto";
import { STEP_LABEL, type Build, type Qty } from "@/lib/pc-builder/compat";
import { inStock, loadAllSteps, useOfferPricer } from "@/lib/pc-builder/state";
import { money } from "./BuildSummary";

/**
 * Armado automático: el comercio elige para qué es la PC y, si quiere, cuánto
 * gastar; NODO completa las piezas que faltan con lo que tiene stock en sus
 * distribuidores. Lo que ya eligió a mano no se toca.
 */
export default function AutoBuildPanel({
  build, qty, onApply,
}: {
  build: Build;
  qty: Qty;
  /** `message`: qué eligió y avisos (el presupuesto no alcanza…), para mostrarlo en la pantalla. */
  onApply: (parts: Build, message: string) => void;
}) {
  const price = useOfferPricer();
  const { currency } = usePrefs();
  const [open, setOpen] = useState(Object.keys(build).length === 0);
  const [profile, setProfile] = useState<Profile>("gamer");
  const [budget, setBudget] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; text: string; notes: string[] } | null>(null);
  const chosen = Object.keys(build).length;

  async function run() {
    setBusy(true);
    setResult(null);
    try {
      const catalog = await loadAllSteps();
      const raw = budget.replace(/\./g, "").replace(",", ".").trim();
      const value = raw ? Number(raw) : null;
      const res = autoBuild({
        profile,
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
        setResult({ ok: false, text: chosen ? "No encontré piezas compatibles con stock para completar lo que falta." : "No encontré piezas con stock para este perfil.", notes: res.notes });
        return;
      }
      const text = `Armado automático: elegí ${res.picked.map((s) => STEP_LABEL[s].toLowerCase()).join(", ")}. Total: ${money(res.total, currency)}. Revisá cada paso y cambiá lo que quieras.`;
      setOpen(false);
      onApply(res.parts, [text, ...res.notes].join(" "));
    } catch {
      setResult({ ok: false, text: "No se pudieron traer los productos. Reintentá en un momento.", notes: [] });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-xl border border-brand-500/30 bg-gradient-to-br from-brand-600/10 to-transparent" aria-label="Armado automático">
      <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left">
        <span className="flex items-center gap-2.5">
          <WandSparkles className="h-4 w-4 text-brand-300" />
          <span>
            <span className="block text-sm font-semibold text-white">Armado automático</span>
            <span className="block text-xs text-surface-400">{chosen ? "Completa lo que falta, compatible con lo que ya elegiste." : "Decí para qué es y cuánto gastar: NODO arma la PC con lo que tiene stock."}</span>
          </span>
        </span>
        <ChevronDown className={`h-4 w-4 flex-shrink-0 text-surface-400 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="flex flex-col gap-3 border-t border-surface-800 px-4 py-3">
          <div role="radiogroup" aria-label="Para qué es la PC" className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            {(Object.keys(PROFILE_LABEL) as Profile[]).map((p) => (
              <button
                key={p}
                type="button"
                role="radio"
                aria-checked={profile === p}
                onClick={() => setProfile(p)}
                className={`rounded-lg border px-3 py-2 text-left transition-colors ${profile === p ? "border-brand-500 bg-brand-600/15" : "border-surface-700 hover:border-surface-500"}`}
              >
                <span className="block text-sm font-semibold text-white">{PROFILE_LABEL[p]}</span>
                <span className="block text-[11px] leading-snug text-surface-400">{PROFILE_HINT[p]}</span>
              </button>
            ))}
          </div>
          <div className="flex flex-wrap items-end gap-2">
            <label className="flex flex-col gap-1 text-xs text-surface-400">
              Presupuesto de costo ({currency === "USD" ? "US$" : "$"}, opcional)
              <input value={budget} onChange={(e) => setBudget(e.target.value)} inputMode="decimal" placeholder={currency === "USD" ? "900" : "1.200.000"} className="h-10 w-48 rounded-lg border border-surface-700 bg-surface-950 px-3 text-right font-mono text-sm text-white placeholder:text-surface-600 focus:border-brand-500 focus:outline-none" />
            </label>
            <button type="button" disabled={busy} onClick={() => void run()} className="inline-flex h-10 items-center gap-2 rounded-lg bg-brand-600 px-4 text-sm font-semibold text-white hover:bg-brand-500 disabled:opacity-50">
              {busy ? <NodoSpinner className="h-4 w-4" /> : <WandSparkles className="h-4 w-4" />}
              {chosen ? "Completar lo que falta" : "Armar la PC"}
            </button>
          </div>
          <p className="text-[11px] text-surface-500">Sin presupuesto, elige la mejor relación precio/rendimiento. Con presupuesto, lo reparte por pieza y usa lo que sobra para mejorar lo que más rinde. Es el precio de costo de tu cuenta, sin tu margen.</p>
        </div>
      )}
      {result && (
        <div className={`border-t px-4 py-2.5 text-sm ${result.ok ? "border-emerald-500/20 text-emerald-200" : "border-amber-500/20 text-amber-200"}`} role="status">
          {result.text}
          {result.notes.map((n) => <span key={n} className="mt-1 block text-xs text-surface-300">{n}</span>)}
        </div>
      )}
    </section>
  );
}
