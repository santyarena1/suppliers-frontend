"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, FolderOpen, LayoutTemplate, Save } from "lucide-react";
import PartsStep from "@/components/pc-builder/PartsStep";
import ExtrasStep from "@/components/pc-builder/ExtrasStep";
import ReviewStep from "@/components/pc-builder/ReviewStep";
import AutoBuildPanel from "@/components/pc-builder/AutoBuildPanel";
import BuildsDialog from "@/components/pc-builder/BuildsDialog";
import BuildSummary, { useBuildTotals } from "@/components/pc-builder/BuildSummary";
import { STEP_LABEL, checks, marks, optionalNote, worst, type PcStep } from "@/lib/pc-builder/compat";
import { ALL_STEPS, PART_STEPS, hydrateBuild, resolveOffers, serializeDraft, usePcBuilder, useOfferPricer, type CustomLine, type StepId } from "@/lib/pc-builder/state";
import { quotesApi, useQuotes } from "@/lib/quotes";
import { useCart } from "@/lib/cart";
import { getTenant } from "@/lib/auth";
import { pcBuilderApi, type PcBuilderSettings, type ProductDTO } from "@/lib/api";
import { providerLabel } from "@/components/ProviderBadge";

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
  const [saving, setSaving] = useState(false);
  const [showBuilds, setShowBuilds] = useState(false);
  const [settings, setSettings] = useState<PcBuilderSettings | null>(null);
  const [manager, setManager] = useState(false);
  const [notice, setNotice] = useState<{ ok: boolean; text: string; href?: string; link?: string } | null>(null);

  useEffect(() => {
    const role = getTenant()?.role;
    setManager(role === "OWNER" || role === "ADMIN");
    pcBuilderApi.settings().then((r) => setSettings(r.data)).catch(() => undefined);
  }, []);

  const { draft, build, qty } = pc;
  const offers = useMemo(() => resolveOffers(draft.parts, draft.split, price), [draft.parts, draft.split, price]);
  // La línea de armado del comercio va como una línea libre más, si está prendida.
  const labor = settings?.laborPrice != null && settings.laborPrice > 0 ? { name: settings.laborName?.trim() || "Armado y prueba", price: settings.laborPrice, iva: settings.laborIva } : null;
  const custom: CustomLine[] = useMemo(
    () => (labor && draft.labor ? [...draft.custom, { id: "labor", name: labor.name, unitFinalPrice: labor.price, ivaPercent: labor.iva, qty: 1 }] : draft.custom),
    [draft.custom, draft.labor, labor?.name, labor?.price, labor?.iva] // eslint-disable-line react-hooks/exhaustive-deps
  );
  const totals = useBuildTotals(draft.parts, offers, draft.extras, custom);
  const cs = checks(build, qty);

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
      const lines = productLines();
      const { data } = await quotesApi.createWithItems({
        title: draft.title.trim() || "Armado de PC",
        ...(draft.client.trim() ? { clientName: draft.client.trim() } : {}),
        items: lines.map((l) => ({ provider: l.product.provider, externalId: l.product.externalId, qty: l.qty })),
        custom: custom.map((c) => ({ name: c.name, unitFinalPrice: c.unitFinalPrice, currency: "ARS" as const, qty: c.qty, ivaPercent: c.ivaPercent })),
      });
      void quotes.reload();
      if (data.skipped.length) {
        const names = data.skipped.map((s) => lines.find((l) => l.product.provider === s.provider && l.product.externalId === s.externalId)?.product.name ?? `${providerLabel(s.provider)} ${s.externalId}`);
        setNotice({ ok: false, text: `Presupuesto creado, pero no tienen precio de venta hoy: ${names.join(", ")}.`, href: `/presupuestos?id=${data.quote.id}`, link: "Abrir el presupuesto" });
      } else {
        router.push(`/presupuestos?id=${data.quote.id}`);
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
    setNotice({ ok: true, text: `${lines.length} producto${lines.length === 1 ? "" : "s"} en el carrito, cada uno con su distribuidor.${custom.length ? " Las líneas libres y el armado van solo en el presupuesto." : ""}`, href: "/cart", link: "Ir al carrito" });
  }

  async function save(asTemplate = false) {
    setSaving(true);
    setNotice(null);
    const title = draft.title.trim() || (asTemplate ? "Plantilla de armado" : `Armado del ${new Date().toLocaleDateString("es-AR")}`);
    const body = { title, clientName: asTemplate ? null : draft.client.trim() || null, template: asTemplate, data: serializeDraft(draft) };
    try {
      if (draft.buildId && !asTemplate) {
        await pcBuilderApi.updateBuild(draft.buildId, body);
        setNotice({ ok: true, text: `Guardado "${title}".` });
      } else {
        const { data } = await pcBuilderApi.createBuild(body);
        if (!asTemplate) pc.setMeta({ buildId: data.id, title });
        setNotice({ ok: true, text: asTemplate ? `Plantilla "${title}" guardada: el equipo la ve en Armados guardados.` : `Guardado "${title}". Lo retomás desde Armados guardados en cualquier compu.` });
      }
    } catch (err) {
      const msg = (err as { response?: { data?: { message?: string } } }).response?.data?.message;
      setNotice({ ok: false, text: typeof msg === "string" ? msg : "No se pudo guardar el armado." });
    } finally {
      setSaving(false);
    }
  }

  const open = useCallback(async (id: string, asTemplate: boolean) => {
    setShowBuilds(false);
    setNotice(null);
    try {
      const { data } = await pcBuilderApi.build(id);
      const { draft: next, gone } = await hydrateBuild(data.data, {
        id: asTemplate ? null : data.id,
        title: asTemplate ? "" : data.title,
        client: asTemplate ? "" : data.clientName ?? "",
      });
      pc.replace(next);
      setStep("review");
      setNotice({
        ok: gone.length === 0,
        text: `${asTemplate ? `Plantilla "${data.title}" cargada` : `"${data.title}" abierto`} con los precios y el stock de hoy.${gone.length ? ` Ya no están en tus distribuidores: ${gone.join(", ")}. Elegí otro.` : ""}`,
      });
    } catch {
      setNotice({ ok: false, text: "No se pudo abrir el armado." });
    }
  }, [pc]);

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
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => setShowBuilds(true)} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-surface-700 px-3 text-sm font-semibold text-surface-200 hover:border-surface-500 hover:text-white">
                <FolderOpen className="h-4 w-4" /> Armados guardados
              </button>
              <button type="button" disabled={saving || Object.keys(draft.parts).length === 0} onClick={() => void save(false)} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-surface-700 px-3 text-sm font-semibold text-surface-200 hover:border-surface-500 hover:text-white disabled:opacity-40">
                <Save className="h-4 w-4" /> {draft.buildId ? "Guardar cambios" : "Guardar"}
              </button>
              {manager && (
                <button type="button" disabled={saving || Object.keys(draft.parts).length === 0} onClick={() => void save(true)} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-surface-700 px-3 text-sm font-semibold text-surface-200 hover:border-surface-500 hover:text-white disabled:opacity-40" title="El equipo la usa como punto de partida">
                  <LayoutTemplate className="h-4 w-4" /> Guardar como plantilla
                </button>
              )}
              <button type="button" onClick={() => { pc.reset(); go("cpu"); setNotice(null); }} className="h-9 rounded-lg border border-surface-700 px-3 text-sm font-semibold text-surface-300 hover:border-surface-500 hover:text-white">Empezar de cero</button>
            </div>
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
            {step !== "extras" && step !== "review" && Object.keys(draft.parts).length < PART_STEPS.length && (
              <AutoBuildPanel build={build} qty={qty} onApply={(parts, message) => { pc.chooseMany(parts); setNotice({ ok: !/no alcanza|No hay/.test(message), text: message }); go("review"); }} />
            )}
            {step === "extras" ? (
              <ExtrasStep extras={draft.extras} custom={draft.custom} onAdd={pc.addExtra} onQty={pc.setExtraQty} onRemove={pc.removeExtra} onAddCustom={pc.addCustom} onRemoveCustom={pc.removeCustom} />
            ) : step === "review" ? (
              <ReviewStep parts={draft.parts} offers={offers} extras={draft.extras} custom={custom} onOffer={pc.setOffer} onQty={pc.setQty} onGo={go} />
            ) : (
              <PartsStep
                step={step}
                build={build}
                qty={qty}
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
            qty={qty}
            parts={draft.parts}
            offers={offers}
            extras={draft.extras}
            custom={custom}
            totals={totals}
            split={draft.split}
            onSplit={(s) => pc.setMeta({ split: s })}
            onGo={go}
            onQuote={() => void createQuote()}
            onCart={addToCart}
            busy={busy}
            labor={labor}
            laborOn={draft.labor}
            onLabor={(on) => pc.setMeta({ labor: on })}
          />
        </div>
      </div>
      {showBuilds && (
        <BuildsDialog
          currentId={draft.buildId}
          manager={manager}
          onOpen={(id, asTemplate) => void open(id, asTemplate)}
          onClose={() => setShowBuilds(false)}
          onSettings={setSettings}
        />
      )}
    </div>
  );
}
