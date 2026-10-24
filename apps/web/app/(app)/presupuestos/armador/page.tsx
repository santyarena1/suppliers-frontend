"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check } from "lucide-react";
import PartsStep from "@/components/pc-builder/PartsStep";
import ExtrasStep from "@/components/pc-builder/ExtrasStep";
import ReviewStep from "@/components/pc-builder/ReviewStep";
import BuildSummary, { useBuildTotals } from "@/components/pc-builder/BuildSummary";
import { STEP_LABEL, checks, marks, optionalNote, worst, type PcStep } from "@/lib/pc-builder/compat";
import { ALL_STEPS, PART_STEPS, resolveOffers, usePcBuilder, useOfferPricer, type StepId } from "@/lib/pc-builder/state";
import { quotesApi, useQuotes } from "@/lib/quotes";
import { useCart } from "@/lib/cart";
import type { ProductDTO } from "@/lib/api";

const LABEL: Record<StepId, string> = { ...STEP_LABEL, extras: "Extras", review: "Revisión" };
const DOT = { ok: "bg-emerald-400", warn: "bg-amber-400", bad: "bg-red-400" } as const;

export default function PcBuilderPage() {
  const router = useRouter();
  const pc = usePcBuilder();
  const price = useOfferPricer();
  const quotes = useQuotes();
  const cart = useCart();
  const [step, setStep] = useState<StepId>("cpu");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ ok: boolean; text: string; href?: string; link?: string } | null>(null);

  const { draft, build } = pc;
  const offers = useMemo(() => resolveOffers(draft.parts, draft.split, price), [draft.parts, draft.split, price]);
  const totals = useBuildTotals(draft.parts, offers, draft.extras, draft.custom);
  const cs = checks(build);

  const go = (s: StepId) => { setStep(s); window.scrollTo({ top: 0, behavior: "smooth" }); };
  const next = (from: StepId) => { const i = ALL_STEPS.indexOf(from); if (i < ALL_STEPS.length - 1) go(ALL_STEPS[i + 1]); };

  /** Lo que va al presupuesto o al carrito: piezas con su oferta y los extras. */
  const productLines = (): { product: ProductDTO; qty: number }[] => [
    ...PART_STEPS.filter((s) => draft.parts[s] && offers[s]).map((s) => ({ product: offers[s]!, qty: draft.parts[s]!.qty })),
    ...draft.extras.map((e) => ({ product: e.product, qty: e.qty })),
  ];

  async function createQuote() {
    setBusy(true);
    setNotice(null);
    try {
      const q = await quotes.create({ title: draft.title.trim() || "Armado de PC", ...(draft.client.trim() ? { clientName: draft.client.trim() } : {}) });
      const failed: string[] = [];
      for (const l of productLines()) {
        try { await quotesApi.addItem(q.id, { provider: l.product.provider, externalId: l.product.externalId, qty: l.qty }); } catch { failed.push(l.product.name); }
      }
      for (const c of draft.custom) {
        try { await quotesApi.addCustom(q.id, { name: c.name, unitFinalPrice: c.unitFinalPrice, currency: "ARS", qty: c.qty, ivaPercent: c.ivaPercent }); } catch { failed.push(c.name); }
      }
      if (failed.length) {
        setNotice({ ok: false, text: `Presupuesto creado, pero no se pudieron agregar: ${failed.join(", ")}.`, href: `/presupuestos?id=${q.id}`, link: "Abrir el presupuesto" });
      } else {
        router.push(`/presupuestos?id=${q.id}`);
      }
    } catch {
      setNotice({ ok: false, text: "No se pudo crear el presupuesto. Reintentá en un momento." });
    } finally {
      setBusy(false);
    }
  }

  function addToCart() {
    const lines = productLines();
    for (const l of lines) cart.add(l.product, l.qty);
    setNotice({ ok: true, text: `${lines.length} producto${lines.length === 1 ? "" : "s"} en el carrito, cada uno con su distribuidor.${draft.custom.length ? " Las líneas libres van solo en el presupuesto." : ""}`, href: "/cart", link: "Ir al carrito" });
  }

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="mx-auto flex max-w-[1500px] flex-col gap-5 px-4 py-5 sm:px-6">
        <header className="flex flex-col gap-3 border-b border-surface-800 pb-4">
          <nav className="text-xs text-surface-500" aria-label="Ubicación"><Link href="/presupuestos" className="hover:text-white">Presupuestos</Link> <span aria-hidden>›</span> <span className="text-surface-300">Armador de PC</span></nav>
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div className="flex min-w-0 flex-wrap items-end gap-3">
              <label className="flex flex-col gap-1 text-xs text-surface-500">
                Armado
                <input value={draft.title} onChange={(e) => pc.setMeta({ title: e.target.value })} placeholder="PC gamer de Tomás" className="h-10 w-[280px] max-w-full rounded-lg border border-surface-700 bg-surface-900 px-3 text-base font-semibold text-white placeholder:font-normal placeholder:text-surface-500 focus:border-brand-500 focus:outline-none" />
              </label>
              <label className="flex flex-col gap-1 text-xs text-surface-500">
                Cliente
                <input value={draft.client} onChange={(e) => pc.setMeta({ client: e.target.value })} placeholder="Nombre del cliente" className="h-10 w-[220px] max-w-full rounded-lg border border-surface-700 bg-surface-900 px-3 text-sm text-white placeholder:text-surface-500 focus:border-brand-500 focus:outline-none" />
              </label>
            </div>
            <button type="button" onClick={() => { pc.reset(); go("cpu"); }} className="h-9 rounded-lg border border-surface-700 px-3 text-sm font-semibold text-surface-300 hover:border-surface-500 hover:text-white">Empezar de cero</button>
          </div>
        </header>

        <ol className="m-0 flex list-none gap-1 overflow-x-auto rounded-xl border border-surface-800 bg-surface-900/60 p-1.5" aria-label="Pasos del armado">
          {ALL_STEPS.map((s, i) => {
            const chosen = s !== "extras" && s !== "review" ? draft.parts[s as PcStep] : null;
            const issues = chosen ? cs.filter((c) => marks(c, s as PcStep)) : [];
            const level = issues.length ? worst(issues) : "ok";
            const optional = s !== "extras" && s !== "review" && !chosen && optionalNote(s as PcStep, build);
            const done = Boolean(chosen) || (s === "extras" && draft.extras.length + draft.custom.length > 0);
            return (
              <li key={s} className="flex-shrink-0">
                <button
                  type="button"
                  onClick={() => go(s)}
                  aria-current={step === s ? "step" : undefined}
                  className={`flex h-12 items-center gap-2.5 rounded-lg px-3 text-left transition-colors ${step === s ? "bg-brand-600/15 text-white ring-1 ring-brand-500/50" : "text-surface-400 hover:bg-surface-800 hover:text-white"}`}
                >
                  <span className={`flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-bold ${done ? (level === "ok" ? "bg-emerald-500/20 text-emerald-300" : level === "warn" ? "bg-amber-500/20 text-amber-300" : "bg-red-500/20 text-red-300") : "border border-surface-600 text-surface-400"}`}>
                    {done && level === "ok" ? <Check className="h-3.5 w-3.5" /> : done ? "!" : i + 1}
                  </span>
                  <span className="flex flex-col">
                    <span className="text-[13px] font-semibold leading-tight">{LABEL[s]}</span>
                    {optional && <span className="text-[10px] leading-tight text-surface-500">Opcional</span>}
                  </span>
                  {done && level !== "ok" && <span className={`h-1.5 w-1.5 rounded-full ${DOT[level]}`} aria-hidden />}
                </button>
              </li>
            );
          })}
        </ol>

        {notice && (
          <p role="status" className={`rounded-xl border px-4 py-3 text-sm ${notice.ok ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-200" : "border-amber-500/30 bg-amber-500/10 text-amber-200"}`}>
            {notice.text} {notice.href && <Link href={notice.href} className="font-semibold underline underline-offset-2">{notice.link}</Link>}
          </p>
        )}

        <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
          <div className="flex min-w-0 flex-col gap-5">
            {step === "extras" ? (
              <ExtrasStep extras={draft.extras} custom={draft.custom} onAdd={pc.addExtra} onQty={pc.setExtraQty} onRemove={pc.removeExtra} onAddCustom={pc.addCustom} onRemoveCustom={pc.removeCustom} />
            ) : step === "review" ? (
              <ReviewStep parts={draft.parts} offers={offers} extras={draft.extras} custom={draft.custom} onOffer={pc.setOffer} onQty={pc.setQty} onGo={go} />
            ) : (
              <PartsStep
                step={step}
                build={build}
                chosen={draft.parts[step]}
                onChoose={(part, offer) => { pc.choose(step, part, offer); if (!offer) next(step); }}
                onSkip={() => next(step)}
              />
            )}
            <div className="flex justify-between border-t border-surface-800 pt-4">
              <button type="button" disabled={step === ALL_STEPS[0]} onClick={() => go(ALL_STEPS[ALL_STEPS.indexOf(step) - 1])} className="h-10 rounded-lg border border-surface-700 px-4 text-sm font-semibold text-surface-200 hover:border-surface-500 disabled:opacity-40">Anterior</button>
              {step !== "review" && (
                <button type="button" onClick={() => next(step)} className="h-10 rounded-lg border border-surface-600 px-4 text-sm font-semibold text-white hover:border-surface-400">
                  Siguiente: {LABEL[ALL_STEPS[ALL_STEPS.indexOf(step) + 1]]}
                </button>
              )}
            </div>
          </div>
          <BuildSummary
            build={build}
            parts={draft.parts}
            offers={offers}
            extras={draft.extras}
            custom={draft.custom}
            totals={totals}
            split={draft.split}
            onSplit={(s) => pc.setMeta({ split: s })}
            onGo={go}
            onQuote={() => void createQuote()}
            onCart={addToCart}
            busy={busy}
          />
        </div>
      </div>
    </div>
  );
}
