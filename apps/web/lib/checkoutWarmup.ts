"use client";

import { useEffect, useState } from "react";
import {
  airCheckoutApi,
  elitCheckoutApi,
  grupoNucleoCheckoutApi,
  invidCheckoutApi,
  newBytesCheckoutApi,
  type AirCheckoutPreview,
  type ElitCheckoutPreview,
  type GnCheckoutPreview,
  type InvidAddress,
  type InvidCheckoutPreview,
  type InvidPaymentOption,
  type NewBytesAddress,
  type NewBytesCheckoutPreview,
  type NewBytesPaymentOption,
  type ProviderOption,
} from "@/lib/api";
import { getToken, isTokenExpired } from "@/lib/auth";

export const WARM_PROVIDERS = ["INVID", "NEW_BYTES", "ELIT", "GRUPO_NUCLEO", "AIR"] as const;
export type WarmProvider = (typeof WARM_PROVIDERS)[number];

export type CartLine = { code: string; qty: number; name?: string };

export function cartLinesFromItems(items: { externalId: string; qty: number; name?: string }[]): CartLine[] {
  return items.map((it) => ({ code: it.externalId, qty: it.qty, name: it.name }));
}

export function cartItemsKey(items: CartLine[]): string {
  return items.map((it) => `${it.code}:${it.qty}`).join("|");
}

export type InvidWarmData = {
  addresses: InvidAddress[];
  payments: InvidPaymentOption[];
  deliveries: InvidPaymentOption[];
  expresoCompanies: InvidPaymentOption[];
  addressId: string;
  paymentOption: string;
  deliveryOption: string;
  preview: InvidCheckoutPreview;
};

export type NewBytesWarmData = {
  addresses: NewBytesAddress[];
  payments: NewBytesPaymentOption[];
  preview: NewBytesCheckoutPreview;
};

export type ElitWarmData = { preview: ElitCheckoutPreview };

export type GnWarmData = {
  preview: GnCheckoutPreview;
  provinces: { value: number; label: string }[];
  documentTypes: ProviderOption[];
};

export type AirWarmData = {
  sucursales: ProviderOption[];
  vendedores: ProviderOption[];
  pagos: ProviderOption[];
  entregas: ProviderOption[];
  transportes: ProviderOption[];
  sucursal: string;
  vendedor: string;
  pago: string;
  entrega: string;
  preview: AirCheckoutPreview;
};

type WarmDataMap = {
  INVID: InvidWarmData;
  NEW_BYTES: NewBytesWarmData;
  ELIT: ElitWarmData;
  GRUPO_NUCLEO: GnWarmData;
  AIR: AirWarmData;
};

export type WarmSnapshot<P extends WarmProvider = WarmProvider> = {
  provider: P;
  itemsKey: string;
  status: "idle" | "loading" | "ready" | "error";
  error: string | null;
  data: WarmDataMap[P] | null;
};

const EVT = "nodo-checkout-warmup";

type Slot = {
  generation: number;
  itemsKey: string;
  status: "loading" | "ready" | "error";
  error: string | null;
  data: unknown;
  timer: ReturnType<typeof setTimeout> | null;
};

const slots: Record<string, Slot> = {};

function emptySnap<P extends WarmProvider>(provider: P, itemsKey: string): WarmSnapshot<P> {
  return { provider, itemsKey, status: "idle", error: null, data: null };
}

function emit() {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(EVT));
}

function errMessage(err: unknown, fallback: string) {
  const msg = (err as { response?: { data?: { message?: string | string[] } } })?.response?.data?.message;
  if (Array.isArray(msg)) return msg.join(" · ");
  return msg || (err instanceof Error ? err.message : fallback);
}

function toSnap<P extends WarmProvider>(provider: P, itemsKey: string): WarmSnapshot<P> {
  const slot = slots[provider];
  if (!slot || slot.itemsKey !== itemsKey) return emptySnap(provider, itemsKey);
  return {
    provider,
    itemsKey,
    status: slot.status,
    error: slot.error,
    data: slot.status === "ready" ? (slot.data as WarmDataMap[P]) : null,
  };
}

async function fetchWarm(provider: WarmProvider, items: CartLine[]): Promise<WarmDataMap[WarmProvider]> {
  if (provider === "INVID") {
    const [addrRes, payRes, delRes] = await Promise.all([
      invidCheckoutApi.addresses(),
      invidCheckoutApi.payments(),
      invidCheckoutApi.deliveries(),
    ]);
    const addresses = addrRes.data ?? [];
    const payments = payRes.data ?? [];
    const deliveries = delRes.data ?? [];
    const addressId = addresses.find((a) => a.isDefault)?.id ?? addresses[0]?.id ?? "";
    if (!addressId) throw new Error("No hay dirección de Invid para armar el carrito");
    const paymentOption = payments.some((p) => p.value === "67") ? "67" : (payments[0]?.value ?? "67");
    const deliveryOption = deliveries[0]?.value ?? "1";
    const preview = (await invidCheckoutApi.preview({
      items,
      addressId,
      paymentOption,
      deliveryOption,
    })).data;
    return {
      addresses,
      payments,
      deliveries: preview.deliveries?.length ? preview.deliveries : deliveries,
      expresoCompanies: preview.expresoCompanies ?? [],
      addressId,
      paymentOption,
      deliveryOption,
      preview,
    } satisfies InvidWarmData;
  }

  if (provider === "NEW_BYTES") {
    const [addrRes, payRes] = await Promise.all([
      newBytesCheckoutApi.addresses(),
      newBytesCheckoutApi.payments(),
    ]);
    await newBytesCheckoutApi.cart({ items });
    const preview = (await newBytesCheckoutApi.preview({ items, delivery: "pickup" })).data;
    return {
      addresses: addrRes.data ?? [],
      payments: payRes.data ?? preview.payments ?? [],
      preview,
    } satisfies NewBytesWarmData;
  }

  if (provider === "ELIT") {
    const preview = (await elitCheckoutApi.preview({ items })).data;
    return { preview } satisfies ElitWarmData;
  }

  if (provider === "GRUPO_NUCLEO") {
    const [opt, prev] = await Promise.all([
      grupoNucleoCheckoutApi.options(),
      grupoNucleoCheckoutApi.preview({ items }),
    ]);
    return {
      preview: prev.data,
      provinces: opt.data.provinces,
      documentTypes: opt.data.documentTypes,
    } satisfies GnWarmData;
  }

  const options = (await airCheckoutApi.options()).data;
  const sucursal = options.sucursales[0]?.value ?? "";
  const vendedor = options.vendedores[0]?.value ?? "";
  const pago = options.pagos[0]?.value ?? "01";
  const entrega = "01";
  const preview = (await airCheckoutApi.preview({
    items,
    sucursal,
    vendedor,
    pago,
    entrega,
  })).data;
  return {
    sucursales: options.sucursales,
    vendedores: options.vendedores,
    pagos: options.pagos,
    entregas: options.entregas.filter((e) => e.value !== "05"),
    transportes: options.transportes,
    sucursal,
    vendedor,
    pago,
    entrega,
    preview,
  } satisfies AirWarmData;
}

export function peekCheckoutWarmup<P extends WarmProvider>(provider: P, itemsKey: string): WarmSnapshot<P> {
  return toSnap(provider, itemsKey);
}

export function forgetCheckoutWarmup(provider: WarmProvider) {
  const slot = slots[provider];
  if (slot?.timer) clearTimeout(slot.timer);
  delete slots[provider];
  emit();
}

export function ensureCheckoutWarmup(
  provider: WarmProvider,
  items: CartLine[],
  debounceMs = 0
) {
  if (typeof window === "undefined") return;
  if (!getToken() || isTokenExpired()) return;
  if (items.length === 0) {
    forgetCheckoutWarmup(provider);
    return;
  }

  const itemsKey = cartItemsKey(items);
  const current = slots[provider];
  if (current && current.itemsKey === itemsKey && (current.status === "ready" || current.status === "loading")) {
    return;
  }
  if (current?.timer) clearTimeout(current.timer);

  const generation = (current?.generation ?? 0) + 1;
  slots[provider] = {
    generation,
    itemsKey,
    status: "loading",
    error: null,
    data: null,
    timer: null,
  };
  emit();

  const run = async () => {
    try {
      const data = await fetchWarm(provider, items);
      const slot = slots[provider];
      if (!slot || slot.generation !== generation) return;
      slot.status = "ready";
      slot.data = data;
      slot.error = null;
      emit();
    } catch (err: unknown) {
      const slot = slots[provider];
      if (!slot || slot.generation !== generation) return;
      slot.status = "error";
      slot.data = null;
      slot.error = errMessage(err, "No se pudo armar el carrito en el distribuidor");
      emit();
    }
  };

  if (debounceMs <= 0) {
    void run();
    return;
  }
  slots[provider].timer = setTimeout(() => {
    const slot = slots[provider];
    if (slot) slot.timer = null;
    void run();
  }, debounceMs);
}

export function useCheckoutWarmup<P extends WarmProvider>(
  provider: P,
  items: CartLine[],
  enabled = true
): WarmSnapshot<P> {
  const itemsKey = cartItemsKey(items);
  const [snap, setSnap] = useState<WarmSnapshot<P>>(() => toSnap(provider, itemsKey));

  useEffect(() => {
    if (enabled && items.length > 0) ensureCheckoutWarmup(provider, items, 0);
    const sync = () => setSnap(toSnap(provider, cartItemsKey(items)));
    sync();
    window.addEventListener(EVT, sync);
    return () => window.removeEventListener(EVT, sync);
  }, [provider, itemsKey, enabled]); // eslint-disable-line react-hooks/exhaustive-deps

  return snap.itemsKey === itemsKey ? snap : toSnap(provider, itemsKey);
}

/**
 * En “Todos” arma el canasto real de cada distribuidor en segundo plano
 * (Invid, New Bytes, Elit, Grupo Núcleo, Air), sin esperar a abrir la pestaña.
 * No borra el cache si todavía no hidrató el carrito: un paint vacío no cancela un warmup en curso.
 */
export function useWarmAllCheckoutCarts(
  onlineByProvider: Record<string, { externalId: string; qty: number; name?: string }[]>,
  enabled: boolean
) {
  const signature = WARM_PROVIDERS.map((p) => {
    const items = onlineByProvider[p] ?? [];
    return `${p}:${cartItemsKey(cartLinesFromItems(items))}`;
  }).join(";");

  useEffect(() => {
    if (!enabled) return;
    for (const provider of WARM_PROVIDERS) {
      const items = onlineByProvider[provider] ?? [];
      if (items.length === 0) {
        forgetCheckoutWarmup(provider);
        continue;
      }
      ensureCheckoutWarmup(provider, cartLinesFromItems(items), 0);
    }
  }, [enabled, signature, onlineByProvider]);
}
