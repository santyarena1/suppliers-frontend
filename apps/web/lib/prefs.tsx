"use client";

import { createContext, useContext, useEffect, useState, useCallback } from "react";
import { tenantSeesIibbPerceptions } from "@/lib/auth";
import { setArsPerUsd } from "./fx";
import { isShippingSplit, type ShippingSplit } from "@/lib/shipping";

export type Currency = "USD" | "ARS";
export type DollarType = "blue" | "oficial" | "tarjeta" | "mep" | "cripto" | "mayorista";

export interface DollarRate {
  type: DollarType;
  compra: number;
  venta: number;
  fechaActualizacion: string;
}

const DOLLAR_LABELS: Record<DollarType, string> = {
  oficial: "Oficial",
  blue: "Blue",
  mep: "MEP",
  tarjeta: "Tarjeta",
  cripto: "Cripto",
  mayorista: "Mayorista",
};

/**
 * Cómo arranca cada filtro de la búsqueda. Tocar el filtro en la búsqueda no
 * cambia esto: acá se elige con qué queda prendido o apagado al entrar.
 */
export interface SearchDefaults {
  /** Sumar el envío estimado al precio. Apagado, el envío queda como referencia. */
  shipping: boolean;
  offline: boolean;
  scheme: boolean;
  outOfStock: boolean;
}

const SEARCH_DEFAULTS: SearchDefaults = { shipping: false, offline: false, scheme: false, outOfStock: false };
const SEARCH_DEFAULT_KEYS: Record<keyof SearchDefaults, string> = {
  shipping: "pref_filter_shipping",
  offline: "pref_filter_offline",
  scheme: "pref_filter_scheme",
  outOfStock: "pref_filter_nostock",
};

/** Lectura directa, para inicializar la búsqueda al montar. */
export function readSearchDefaults(): SearchDefaults {
  if (typeof window === "undefined") return SEARCH_DEFAULTS;
  try {
    const out = { ...SEARCH_DEFAULTS };
    for (const key of Object.keys(SEARCH_DEFAULT_KEYS) as (keyof SearchDefaults)[]) {
      const raw = localStorage.getItem(SEARCH_DEFAULT_KEYS[key]);
      if (raw != null) out[key] = raw === "1";
    }
    return out;
  } catch {
    return SEARCH_DEFAULTS;
  }
}

interface PrefsContextValue {
  currency: Currency;
  setCurrency: (c: Currency) => void;
  withIva: boolean;
  setWithIva: (v: boolean) => void;
  /** Incluir percepciones/IIBB. Independiente del IVA. Default: true. Offline nunca las suma. */
  withIibb: boolean;
  setWithIibb: (v: boolean) => void;
  /**
   * Modo vendedor: quien ve costos puede mirar la app como la ve un vendedor
   * (solo precio de venta). Preferencia local de este navegador.
   */
  viewAsSeller: boolean;
  setViewAsSeller: (v: boolean) => void;
  /** Cómo se reparte el envío estimado entre los productos del pedido. */
  shippingSplit: ShippingSplit;
  setShippingSplit: (s: ShippingSplit) => void;
  searchDefaults: SearchDefaults;
  setSearchDefault: (key: keyof SearchDefaults, value: boolean) => void;
  dollarType: DollarType;
  setDollarType: (t: DollarType) => void;
  rates: DollarRate[];
  currentRate: DollarRate | null;
  refreshRates: () => Promise<void>;
  loadingRates: boolean;
  dollarLabel: (t: DollarType) => string;
  convert: (usdPrice: number) => { amount: number; currency: Currency };
}

const PrefsContext = createContext<PrefsContextValue | null>(null);

const RATES_CACHE_KEY = "pref_dollar_rates";

function readCachedRates(): DollarRate[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = JSON.parse(localStorage.getItem(RATES_CACHE_KEY) ?? "[]");
    return Array.isArray(raw) ? (raw as DollarRate[]).filter((r) => r && typeof r.venta === "number" && r.venta > 0) : [];
  } catch {
    return [];
  }
}

export function PrefsProvider({ children }: { children: React.ReactNode }) {
  const [currency, setCurrencyState] = useState<Currency>("ARS");
  const [withIva, setWithIvaState] = useState<boolean>(true);
  const [withIibb, setWithIibbState] = useState<boolean>(true);
  const [viewAsSeller, setViewAsSellerState] = useState<boolean>(false);
  const [dollarType, setDollarTypeState] = useState<DollarType>("oficial");
  const [shippingSplit, setShippingSplitState] = useState<ShippingSplit>("units");
  const [searchDefaults, setSearchDefaults] = useState<SearchDefaults>(SEARCH_DEFAULTS);
  // Arranca con la última cotización guardada: sin esto, al abrir la app los
  // precios en pesos pasaban de "sin cotización" al valor real (se movían).
  const [rates, setRates] = useState<DollarRate[]>([]);
  const [loadingRates, setLoadingRates] = useState(false);

  useEffect(() => {
    const c = localStorage.getItem("pref_currency") as Currency | null;
    const i = localStorage.getItem("pref_iva");
    const iibb = localStorage.getItem("pref_iibb");
    const d = localStorage.getItem("pref_dollar") as DollarType | null;
    if (c) setCurrencyState(c);
    if (i != null) setWithIvaState(i === "1");
    if (iibb != null) setWithIibbState(iibb === "1");
    setViewAsSellerState(localStorage.getItem("pref_view_as_seller") === "1");
    if (d) setDollarTypeState(d);
    const cachedRates = readCachedRates();
    if (cachedRates.length > 0) setRates((prev) => (prev.length > 0 ? prev : cachedRates));
    const split = localStorage.getItem("pref_shipping_split");
    if (isShippingSplit(split)) setShippingSplitState(split);
    setSearchDefaults(readSearchDefaults());
  }, []);

  const setCurrency = useCallback((c: Currency) => {
    setCurrencyState(c);
    localStorage.setItem("pref_currency", c);
  }, []);
  const setWithIva = useCallback((v: boolean) => {
    setWithIvaState(v);
    localStorage.setItem("pref_iva", v ? "1" : "0");
  }, []);
  const setViewAsSeller = useCallback((v: boolean) => {
    setViewAsSellerState(v);
    localStorage.setItem("pref_view_as_seller", v ? "1" : "0");
  }, []);
  const setWithIibb = useCallback((v: boolean) => {
    setWithIibbState(v);
    localStorage.setItem("pref_iibb", v ? "1" : "0");
  }, []);
  const setShippingSplit = useCallback((s: ShippingSplit) => {
    setShippingSplitState(s);
    localStorage.setItem("pref_shipping_split", s);
  }, []);
  const setSearchDefault = useCallback((key: keyof SearchDefaults, value: boolean) => {
    setSearchDefaults((prev) => ({ ...prev, [key]: value }));
    localStorage.setItem(SEARCH_DEFAULT_KEYS[key], value ? "1" : "0");
  }, []);
  const setDollarType = useCallback((t: DollarType) => {
    setDollarTypeState(t);
    localStorage.setItem("pref_dollar", t);
  }, []);

  const refreshRates = useCallback(async () => {
    setLoadingRates(true);
    try {
      const res = await fetch("https://dolarapi.com/v1/dolares");
      const data = await res.json();
      const mapped: DollarRate[] = data.map((d: { casa: string; compra: number; venta: number; fechaActualizacion: string }) => ({
        type: d.casa as DollarType,
        compra: d.compra,
        venta: d.venta,
        fechaActualizacion: d.fechaActualizacion,
      }));
      setRates(mapped);
      try {
        localStorage.setItem(RATES_CACHE_KEY, JSON.stringify(mapped));
      } catch {
        /* sin storage: solo memoria */
      }
    } catch {
      // keep previous rates
    } finally {
      setLoadingRates(false);
    }
  }, []);

  useEffect(() => {
    refreshRates();
  }, [refreshRates]);

  const currentRate = rates.find((r) => r.type === dollarType) || null;

  // Los precios que un proveedor da en pesos se pasan a USD con este mismo dólar (lib/fx.ts).
  useEffect(() => {
    setArsPerUsd(currentRate?.venta);
  }, [currentRate]);

  const convert = useCallback((usdPrice: number) => {
    if (currency === "USD") return { amount: usdPrice, currency: "USD" as Currency };
    const rate = currentRate?.venta || 0;
    return { amount: usdPrice * rate, currency: "ARS" as Currency };
  }, [currency, currentRate]);

  return (
    <PrefsContext.Provider value={{
      currency, setCurrency, withIva, setWithIva, withIibb, setWithIibb,
      viewAsSeller, setViewAsSeller,
      shippingSplit, setShippingSplit, searchDefaults, setSearchDefault,
      dollarType, setDollarType,
      rates, currentRate, refreshRates, loadingRates,
      dollarLabel: (t) => DOLLAR_LABELS[t] || t,
      convert,
    }}>
      {children}
    </PrefsContext.Provider>
  );
}

export function usePrefs() {
  const ctx = useContext(PrefsContext);
  if (!ctx) throw new Error("usePrefs must be used inside PrefsProvider");
  const seesIibb = tenantSeesIibbPerceptions();
  return {
    ...ctx,
    withIibb: seesIibb ? ctx.withIibb : false,
    setWithIibb: seesIibb ? ctx.setWithIibb : () => undefined,
  };
}
