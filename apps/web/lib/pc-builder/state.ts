"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ProductDTO } from "@/lib/api";
import { pcBuilderApi, type PcBuildData } from "@/lib/api";
import { getTenant, getUser } from "@/lib/auth";
import { formatARS, formatUSD, hasOwnPrice } from "@/lib/format";
import { usePrefs } from "@/lib/prefs";
import { usePurchasePolicies } from "@/lib/purchase";
import { purchaseLinePricing } from "@/lib/purchase-price";
import { displayAmountFromPricing } from "@/lib/display-price";
import type { Build, PcPart, PcStep, Qty } from "./compat";

export const PART_STEPS: PcStep[] = ["cpu", "mobo", "ram", "gpu", "ssd", "psu", "case", "cooler"];
export type StepId = PcStep | "extras" | "review";
export const ALL_STEPS: StepId[] = [...PART_STEPS, "extras", "review"];

export const offerKey = (p: Pick<ProductDTO, "provider" | "externalId">) => `${p.provider}:${p.externalId}`;
export const inStock = (p: ProductDTO) => (p.stock ?? 0) > 0 || (p.stock == null && Boolean(p.stockStatus) && !/sin stock/i.test(p.stockStatus ?? ""));

export interface ChosenPart { part: PcPart; offer: string | null; qty: number }
export interface ExtraLine { product: ProductDTO; qty: number }
export interface CustomLine { id: string; name: string; unitFinalPrice: number; ivaPercent: number; qty: number }

export interface Draft {
  parts: Partial<Record<PcStep, ChosenPart>>;
  extras: ExtraLine[];
  custom: CustomLine[];
  title: string;
  client: string;
  split: "cheap" | "few";
  /** Armado guardado que se está editando (null = uno nuevo). */
  buildId: string | null;
  /** Suma la línea de armado configurada por el comercio. */
  labor: boolean;
}

const EMPTY: Draft = { parts: {}, extras: [], custom: [], title: "", client: "", split: "cheap", buildId: null, labor: true };
const LEGACY_KEY = "nodo.pcBuilder.v1";
/** Un borrador por persona y comercio: dos cuentas en la misma compu no comparten armado. */
function draftKey(): string {
  return `nodo.pcBuilder.v2:${getTenant()?.id ?? "-"}:${getUser()?.id ?? "-"}`;
}

/** Precio final por unidad de una oferta, como en el carrito (IVA, IIBB y dólar del comercio). */
export function useOfferPricer() {
  const { currency, withIva, withIibb, convert } = usePrefs();
  const policies = usePurchasePolicies();
  return useCallback(
    (p: ProductDTO) => {
      if (!hasOwnPrice(p)) return null;
      const usd = displayAmountFromPricing(purchaseLinePricing(p, policies[p.provider], "list", 1), { withIva, withIibb, provider: p.provider }, 1).unitDisplayUsd;
      const amount = currency === "USD" ? usd : p.sourceCurrency === "ARS" && p.fxRate ? usd * p.fxRate : convert(usd).amount;
      return { usd, amount, label: currency === "USD" ? formatUSD(usd) : formatARS(amount) };
    },
    [currency, withIva, withIibb, convert, policies]
  );
}

/* ── Catálogo por paso, compartido por la pantalla, el armado automático y la carga de armados ── */

const CATALOG_TTL_MS = 5 * 60_000;
const catalog = new Map<PcStep, { at: number; rows: Promise<PcPart[]> }>();

/** Productos de un paso (con las ofertas de la cuenta). Se piden una vez cada 5 minutos. */
export function loadStep(step: PcStep, fresh = false): Promise<PcPart[]> {
  const hit = catalog.get(step);
  if (!fresh && hit && Date.now() - hit.at < CATALOG_TTL_MS) return hit.rows;
  const rows = pcBuilderApi.parts(step).then((r) => r.data as PcPart[]);
  catalog.set(step, { at: Date.now(), rows });
  rows.catch(() => catalog.delete(step));
  return rows;
}

/** Todos los pasos (para el armado automático). */
export async function loadAllSteps(): Promise<Partial<Record<PcStep, PcPart[]>>> {
  const entries = await Promise.all(PART_STEPS.map(async (s) => [s, await loadStep(s)] as const));
  return Object.fromEntries(entries);
}

/** Productos de un paso para la pantalla. */
export function useStepParts(step: PcStep | null) {
  const [parts, setParts] = useState<PcPart[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!step) return;
    let alive = true;
    setParts(null);
    setLoading(true);
    setError(null);
    loadStep(step)
      .then((r) => { if (alive) setParts(r); })
      .catch(() => { if (alive) setError("No se pudieron traer los productos. Reintentá en un momento."); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [step]);
  return { parts, loading, error };
}

/* ── Guardar y abrir: el armado se guarda como ids; al abrirlo se trae con los precios de hoy ── */

/** Lo que se guarda de un armado (sin las ofertas: los precios se buscan al abrirlo). */
export function serializeDraft(d: Draft): PcBuildData {
  const parts: PcBuildData["parts"] = {};
  for (const s of PART_STEPS) {
    const c = d.parts[s];
    if (!c) continue;
    const { contentId, name, brand, image, compat, estimated } = c.part;
    parts[s] = { contentId, offer: c.offer, qty: c.qty, snapshot: { contentId, name, brand, image, compat, estimated } };
  }
  return { parts, extras: d.extras, custom: d.custom, split: d.split, labor: d.labor };
}

/** Arma el borrador desde lo guardado, con las piezas y ofertas de hoy. Lo que ya no está, vuelve sin ofertas. */
export async function hydrateBuild(data: PcBuildData, meta: { id: string | null; title: string; client: string }): Promise<{ draft: Draft; gone: string[] }> {
  const parts: Draft["parts"] = {};
  const gone: string[] = [];
  await Promise.all(
    (Object.entries(data.parts ?? {}) as [PcStep, NonNullable<PcBuildData["parts"][PcStep]>][]).map(async ([step, saved]) => {
      const rows = await loadStep(step).catch(() => [] as PcPart[]);
      const fresh = rows.find((p) => p.contentId === saved.contentId);
      if (!fresh) gone.push(saved.snapshot?.name ?? step);
      const part: PcPart = fresh ?? { ...(saved.snapshot as Omit<PcPart, "offers">), contentId: saved.contentId, offers: [] };
      const offer = saved.offer && part.offers.some((o) => offerKey(o) === saved.offer) ? saved.offer : null;
      parts[step] = { part, offer, qty: Math.max(1, saved.qty || 1) };
    })
  );
  return {
    draft: {
      ...EMPTY,
      parts,
      extras: Array.isArray(data.extras) ? data.extras : [],
      custom: Array.isArray(data.custom) ? data.custom : [],
      split: data.split === "few" ? "few" : "cheap",
      labor: data.labor !== false,
      title: meta.title,
      client: meta.client,
      buildId: meta.id,
    },
    gone,
  };
}

/** Estado del armado, guardado como borrador en este navegador para esta persona. */
export function usePcBuilder() {
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [loaded, setLoaded] = useState(false);
  const key = useRef<string>("");
  useEffect(() => {
    key.current = draftKey();
    let restored: Draft | null = null;
    try {
      const raw = localStorage.getItem(key.current) ?? localStorage.getItem(LEGACY_KEY);
      if (raw) restored = { ...EMPTY, ...JSON.parse(raw) };
      localStorage.removeItem(LEGACY_KEY);
    } catch {
      /* sin borrador */
    }
    if (!restored) { setLoaded(true); return; }
    setDraft(restored);
    setLoaded(true);
    // Las piezas guardadas traen los precios de cuando se eligieron: se cambian por las de hoy.
    const ids = Object.fromEntries(Object.entries(restored.parts).map(([s, c]) => [s, c!.part.contentId]));
    void Promise.all(PART_STEPS.filter((s) => ids[s]).map(async (s) => [s, (await loadStep(s).catch(() => [] as PcPart[])).find((p) => p.contentId === ids[s])] as const))
      .then((fresh) => setDraft((d) => {
        const parts = { ...d.parts };
        for (const [s, p] of fresh) if (p && parts[s]?.part.contentId === p.contentId) parts[s] = { ...parts[s]!, part: p };
        return { ...d, parts };
      }));
  }, []);
  useEffect(() => {
    if (!loaded) return;
    try {
      localStorage.setItem(key.current, JSON.stringify(draft));
    } catch {
      /* sin storage, el armado vive mientras la página esté abierta */
    }
  }, [draft, loaded]);

  const build: Build = useMemo(() => {
    const b: Build = {};
    for (const s of PART_STEPS) if (draft.parts[s]) b[s] = draft.parts[s]!.part;
    return b;
  }, [draft.parts]);
  const qty: Qty = useMemo(() => Object.fromEntries(Object.entries(draft.parts).map(([s, c]) => [s, c!.qty])), [draft.parts]);

  const choose = (step: PcStep, part: PcPart, offer: string | null = null) =>
    setDraft((d) => ({ ...d, parts: { ...d.parts, [step]: { part, offer, qty: d.parts[step]?.qty ?? 1 } } }));
  /** Varias piezas de una vez (armado automático): lo elegido a mano no se toca. */
  const chooseMany = (parts: Build) =>
    setDraft((d) => {
      const next = { ...d.parts };
      for (const [s, p] of Object.entries(parts) as [PcStep, PcPart][]) if (!next[s]) next[s] = { part: p, offer: null, qty: 1 };
      return { ...d, parts: next };
    });
  const remove = (step: PcStep) => setDraft((d) => { const parts = { ...d.parts }; delete parts[step]; return { ...d, parts }; });
  const setOffer = (step: PcStep, offer: string) => setDraft((d) => (d.parts[step] ? { ...d, parts: { ...d.parts, [step]: { ...d.parts[step]!, offer } } } : d));
  const setQty = (step: PcStep, q: number) => setDraft((d) => (d.parts[step] ? { ...d, parts: { ...d.parts, [step]: { ...d.parts[step]!, qty: Math.max(1, Math.min(8, q)) } } } : d));
  const addExtra = (product: ProductDTO) =>
    setDraft((d) => {
      const i = d.extras.findIndex((e) => offerKey(e.product) === offerKey(product));
      if (i >= 0) return { ...d, extras: d.extras.map((e, j) => (j === i ? { ...e, qty: e.qty + 1 } : e)) };
      return { ...d, extras: [...d.extras, { product, qty: 1 }] };
    });
  const setExtraQty = (k: string, q: number) => setDraft((d) => ({ ...d, extras: d.extras.map((e) => (offerKey(e.product) === k ? { ...e, qty: Math.max(1, q) } : e)) }));
  const removeExtra = (k: string) => setDraft((d) => ({ ...d, extras: d.extras.filter((e) => offerKey(e.product) !== k) }));
  const addCustom = (line: Omit<CustomLine, "id">) => setDraft((d) => ({ ...d, custom: [...d.custom, { ...line, id: `${Date.now()}` }] }));
  const removeCustom = (id: string) => setDraft((d) => ({ ...d, custom: d.custom.filter((c) => c.id !== id) }));
  // Cambiar el reparto no borra los distribuidores elegidos a mano: solo cambia los automáticos.
  const setMeta = (patch: Partial<Pick<Draft, "title" | "client" | "split" | "labor" | "buildId">>) => setDraft((d) => ({ ...d, ...patch }));
  const replace = (next: Draft) => setDraft(next);
  const reset = () => setDraft(EMPTY);

  return { draft, loaded, build, qty, choose, chooseMany, remove, setOffer, setQty, addExtra, setExtraQty, removeExtra, addCustom, removeCustom, setMeta, replace, reset };
}

/**
 * Qué oferta va para cada pieza: la que eligió el comercio o, si no, la más barata
 * con stock ("cheap") o la del distribuidor que cubre más piezas ("few").
 */
export function resolveOffers(
  parts: Partial<Record<PcStep, ChosenPart>>,
  split: "cheap" | "few",
  price: (p: ProductDTO) => { usd: number } | null
): Partial<Record<PcStep, ProductDTO | null>> {
  const options = (c: ChosenPart) => c.part.offers.filter((o) => inStock(o) && price(o)).sort((a, b) => price(a)!.usd - price(b)!.usd);
  const out: Partial<Record<PcStep, ProductDTO | null>> = {};
  const pending: PcStep[] = [];
  for (const [step, c] of Object.entries(parts) as [PcStep, ChosenPart][]) {
    const manual = c.offer ? c.part.offers.find((o) => offerKey(o) === c.offer) : null;
    if (manual) out[step] = manual;
    else pending.push(step);
  }
  if (split === "few") {
    let left = pending.slice();
    while (left.length) {
      const count: Record<string, number> = {};
      for (const st of left) for (const o of options(parts[st]!)) count[o.provider] = (count[o.provider] ?? 0) + 1;
      const top = Object.keys(count).sort((a, b) => count[b] - count[a])[0];
      if (!top) break;
      left = left.filter((st) => {
        const o = options(parts[st]!).find((x) => x.provider === top);
        if (o) out[st] = o;
        return !o;
      });
    }
    for (const st of left) out[st] = options(parts[st]!)[0] ?? null;
  } else {
    for (const st of pending) out[st] = options(parts[st]!)[0] ?? null;
  }
  return out;
}
