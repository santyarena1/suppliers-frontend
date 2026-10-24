"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { ProductDTO } from "@/lib/api";
import { pcBuilderApi } from "@/lib/api";
import { formatARS, formatUSD, hasOwnPrice } from "@/lib/format";
import { usePrefs } from "@/lib/prefs";
import { usePurchasePolicies } from "@/lib/purchase";
import { purchaseLinePricing } from "@/lib/purchase-price";
import { displayAmountFromPricing } from "@/lib/display-price";
import type { Build, PcPart, PcStep } from "./compat";

export const PART_STEPS: PcStep[] = ["cpu", "mobo", "ram", "gpu", "ssd", "psu", "case", "cooler"];
export type StepId = PcStep | "extras" | "review";
export const ALL_STEPS: StepId[] = [...PART_STEPS, "extras", "review"];

export const offerKey = (p: Pick<ProductDTO, "provider" | "externalId">) => `${p.provider}:${p.externalId}`;
export const inStock = (p: ProductDTO) => (p.stock ?? 0) > 0 || (p.stock == null && Boolean(p.stockStatus) && !/sin stock/i.test(p.stockStatus ?? ""));

export interface ChosenPart { part: PcPart; offer: string | null; qty: number }
export interface ExtraLine { product: ProductDTO; qty: number }
export interface CustomLine { id: string; name: string; unitFinalPrice: number; ivaPercent: number; qty: number }

interface Draft {
  parts: Partial<Record<PcStep, ChosenPart>>;
  extras: ExtraLine[];
  custom: CustomLine[];
  title: string;
  client: string;
  split: "cheap" | "few";
}

const KEY = "nodo.pcBuilder.v1";
const EMPTY: Draft = { parts: {}, extras: [], custom: [], title: "", client: "", split: "cheap" };

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

/** Estado del armado, guardado como borrador en este navegador. */
export function usePcBuilder() {
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) setDraft({ ...EMPTY, ...JSON.parse(raw) });
    } catch {
      /* sin borrador */
    }
    setLoaded(true);
  }, []);
  useEffect(() => {
    if (!loaded) return;
    try {
      localStorage.setItem(KEY, JSON.stringify(draft));
    } catch {
      /* sin storage, el armado vive mientras la página esté abierta */
    }
  }, [draft, loaded]);

  const build: Build = useMemo(() => {
    const b: Build = {};
    for (const s of PART_STEPS) if (draft.parts[s]) b[s] = draft.parts[s]!.part;
    return b;
  }, [draft.parts]);

  const choose = (step: PcStep, part: PcPart, offer: string | null = null) =>
    setDraft((d) => ({ ...d, parts: { ...d.parts, [step]: { part, offer, qty: d.parts[step]?.qty ?? 1 } } }));
  const remove = (step: PcStep) => setDraft((d) => { const parts = { ...d.parts }; delete parts[step]; return { ...d, parts }; });
  const setOffer = (step: PcStep, offer: string) => setDraft((d) => (d.parts[step] ? { ...d, parts: { ...d.parts, [step]: { ...d.parts[step]!, offer } } } : d));
  const setQty = (step: PcStep, qty: number) => setDraft((d) => (d.parts[step] ? { ...d, parts: { ...d.parts, [step]: { ...d.parts[step]!, qty: Math.max(1, qty) } } } : d));
  const addExtra = (product: ProductDTO) =>
    setDraft((d) => {
      const i = d.extras.findIndex((e) => offerKey(e.product) === offerKey(product));
      if (i >= 0) return { ...d, extras: d.extras.map((e, j) => (j === i ? { ...e, qty: e.qty + 1 } : e)) };
      return { ...d, extras: [...d.extras, { product, qty: 1 }] };
    });
  const setExtraQty = (key: string, qty: number) => setDraft((d) => ({ ...d, extras: d.extras.map((e) => (offerKey(e.product) === key ? { ...e, qty: Math.max(1, qty) } : e)) }));
  const removeExtra = (key: string) => setDraft((d) => ({ ...d, extras: d.extras.filter((e) => offerKey(e.product) !== key) }));
  const addCustom = (line: Omit<CustomLine, "id">) => setDraft((d) => ({ ...d, custom: [...d.custom, { ...line, id: `${Date.now()}` }] }));
  const removeCustom = (id: string) => setDraft((d) => ({ ...d, custom: d.custom.filter((c) => c.id !== id) }));
  const setMeta = (patch: Partial<Pick<Draft, "title" | "client" | "split">>) => setDraft((d) => ({ ...d, ...patch, ...(patch.split ? { parts: Object.fromEntries(Object.entries(d.parts).map(([k, v]) => [k, { ...v!, offer: null }])) } : {}) }));
  const reset = () => setDraft(EMPTY);

  return { draft, loaded, build, choose, remove, setOffer, setQty, addExtra, setExtraQty, removeExtra, addCustom, removeCustom, setMeta, reset };
}

/** Productos de cada paso, pedidos una vez por visita. */
export function useStepParts(step: PcStep | null) {
  const [cache, setCache] = useState<Partial<Record<PcStep, PcPart[]>>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!step || cache[step]) return;
    let alive = true;
    setLoading(true);
    setError(null);
    pcBuilderApi.parts(step)
      .then((r) => { if (alive) setCache((c) => ({ ...c, [step]: r.data })); })
      .catch(() => { if (alive) setError("No se pudieron traer los productos. Reintentá en un momento."); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [step, cache]);
  return { parts: step ? cache[step] ?? null : null, loading, error };
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
