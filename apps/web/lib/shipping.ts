"use client";

/**
 * Envío estimado por distribuidor. Misma lógica que
 * `packages/shared/src/shipping.ts` (tests en la API).
 *
 * NODO no cotiza el envío en la búsqueda: el costo real lo da el portal de cada
 * distribuidor recién en el checkout. Lo que sí sabe es cómo suele recibir el
 * comercio (sus pedidos o lo que cargó a mano) y cuánto le salió. Con eso
 * estima, y siempre lo muestra como aproximado.
 */

import { useEffect, useMemo, useState } from "react";
import api from "@/lib/api";
import { SESSION_EVENT } from "@/lib/auth";

export const SHIPPING_CURRENCIES = ["ARS", "USD"] as const;
export type ShippingCurrency = (typeof SHIPPING_CURRENCIES)[number];

export const SHIPPING_SPLITS = ["units", "value", "order"] as const;
export type ShippingSplit = (typeof SHIPPING_SPLITS)[number];

export const SHIPPING_SPLIT_LABELS: Record<ShippingSplit, { label: string; hint: string }> = {
  units: {
    label: "Por unidades",
    hint: "El envío se divide por la cantidad de unidades del pedido. Con 4 unidades, cada una carga un cuarto.",
  },
  value: {
    label: "Por valor",
    hint: "Cada producto carga envío según lo que pesa en el total del pedido: el caro carga más que el barato.",
  },
  order: {
    label: "Por pedido",
    hint: "El envío se cobra una vez por pedido: lo carga el primer producto de ese distribuidor y el resto no suma.",
  },
};

export const SHIPPING_DISCLAIMER =
  "Los valores de envío son aproximados y pueden variar según el producto en la consulta del distribuidor.";

export interface ShippingMethod {
  id: string;
  label: string;
  amount: number;
  currency: ShippingCurrency;
  habitual: boolean;
}

export interface LearnedShippingMethod {
  id: string;
  label: string;
  pickup: boolean;
  orders: number;
  lastAmount: number | null;
  currency: ShippingCurrency | null;
  lastAt: string;
}

export interface ShippingEstimate {
  id: string;
  label: string;
  pickup: boolean;
  amount: number | null;
  currency: ShippingCurrency | null;
  source: "manual" | "history";
  orders: number | null;
  ofOrders: number | null;
}

export interface ProviderShipping {
  provider: string;
  estimate: ShippingEstimate | null;
  learned: { orders: number; methods: LearnedShippingMethod[] };
  manual: ShippingMethod[];
}

export function isShippingSplit(value: unknown): value is ShippingSplit {
  return value === "units" || value === "value" || value === "order";
}

export function shippingMethodId(label: string): string {
  return (
    label
      .normalize("NFD")
      .replace(/\p{M}/gu, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 60) || "envio"
  );
}

export type ShippingShareBasis = "unit" | "order" | "in_cart";

/**
 * Cuánto envío le toca a una unidad de este producto. Si todavía no está en el
 * carrito se calcula como si se sumara una unidad; a medida que crece el
 * carrito de ese distribuidor, el envío se reparte entre más.
 */
export function shippingShare(input: {
  cost: number;
  split: ShippingSplit;
  cartUnits: number;
  cartValue: number;
  inCartQty: number;
  unitPrice: number;
}): { perUnit: number; basis: ShippingShareBasis } {
  const cost = Math.max(0, input.cost);
  const inCart = Math.max(0, input.inCartQty);
  const units = Math.max(0, input.cartUnits) + (inCart > 0 ? 0 : 1);
  const price = Math.max(0, input.unitPrice);
  if (cost === 0) return { perUnit: 0, basis: "unit" };

  if (input.split === "order") {
    const others = Math.max(0, input.cartUnits - inCart);
    if (others > 0) return { perUnit: 0, basis: "in_cart" };
    return { perUnit: cost / Math.max(1, inCart), basis: "order" };
  }

  if (input.split === "value") {
    const value = Math.max(0, input.cartValue) + (inCart > 0 ? 0 : price);
    if (value <= 0 || price <= 0) return { perUnit: cost / Math.max(1, units), basis: "unit" };
    return { perUnit: (cost * price) / value, basis: "unit" };
  }

  return { perUnit: cost / Math.max(1, units), basis: "unit" };
}

/** El costo del envío en dólares. Sin cotización no se puede pasar pesos a dólares. */
export function shippingCostUsd(
  estimate: Pick<ShippingEstimate, "amount" | "currency"> | null,
  arsPerUsd: number
): number | null {
  if (!estimate || estimate.amount == null) return null;
  if (estimate.currency === "USD") return estimate.amount;
  if (!(arsPerUsd > 0)) return null;
  return estimate.amount / arsPerUsd;
}

// --- Datos del servidor, cacheados por sesión ---

export const SHIPPING_UPDATED = "nodo:shipping-updated";
const TTL_MS = 5 * 60_000;
let cache: { list: ProviderShipping[]; at: number } | null = null;
let inflight: Promise<ProviderShipping[]> | null = null;

export async function loadShippingEstimates(force = false): Promise<ProviderShipping[]> {
  if (!force && cache && Date.now() - cache.at < TTL_MS) return cache.list;
  if (!force && inflight) return inflight;
  inflight = api
    .get<ProviderShipping[]>("/my/shipping-estimates")
    .then((r) => {
      const list = Array.isArray(r.data) ? r.data : [];
      cache = { list, at: Date.now() };
      return list;
    })
    .catch(() => cache?.list ?? [])
    .finally(() => {
      inflight = null;
    });
  return inflight;
}

/** Después de guardar formas de envío o de confirmar un pedido. */
export function invalidateShippingEstimates(): void {
  cache = null;
  inflight = null;
  if (typeof window !== "undefined") window.dispatchEvent(new Event(SHIPPING_UPDATED));
}

if (typeof window !== "undefined") {
  window.addEventListener(SESSION_EVENT, invalidateShippingEstimates);
}

export function useShippingEstimates(): Record<string, ProviderShipping> {
  const [list, setList] = useState<ProviderShipping[]>(() => cache?.list ?? []);
  useEffect(() => {
    let alive = true;
    const apply = (next: ProviderShipping[]) => {
      if (alive) setList(next);
    };
    void loadShippingEstimates().then(apply);
    const onUpdated = () => void loadShippingEstimates().then(apply);
    window.addEventListener(SHIPPING_UPDATED, onUpdated);
    return () => {
      alive = false;
      window.removeEventListener(SHIPPING_UPDATED, onUpdated);
    };
  }, []);
  return useMemo(() => {
    const map: Record<string, ProviderShipping> = {};
    for (const p of list) map[p.provider] = p;
    return map;
  }, [list]);
}
