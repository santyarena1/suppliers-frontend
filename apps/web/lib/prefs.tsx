"use client";

import { createContext, useContext, useEffect, useState, useCallback } from "react";

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

interface PrefsContextValue {
  currency: Currency;
  setCurrency: (c: Currency) => void;
  withIva: boolean;
  setWithIva: (v: boolean) => void;
  /** Incluir percepciones/IIBB. Independiente del IVA. Default: false. */
  withIibb: boolean;
  setWithIibb: (v: boolean) => void;
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

export function PrefsProvider({ children }: { children: React.ReactNode }) {
  const [currency, setCurrencyState] = useState<Currency>("ARS");
  const [withIva, setWithIvaState] = useState<boolean>(true);
  const [withIibb, setWithIibbState] = useState<boolean>(false);
  const [dollarType, setDollarTypeState] = useState<DollarType>("oficial");
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
    if (d) setDollarTypeState(d);
  }, []);

  const setCurrency = useCallback((c: Currency) => {
    setCurrencyState(c);
    localStorage.setItem("pref_currency", c);
  }, []);
  const setWithIva = useCallback((v: boolean) => {
    setWithIvaState(v);
    localStorage.setItem("pref_iva", v ? "1" : "0");
  }, []);
  const setWithIibb = useCallback((v: boolean) => {
    setWithIibbState(v);
    localStorage.setItem("pref_iibb", v ? "1" : "0");
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

  const convert = useCallback((usdPrice: number) => {
    if (currency === "USD") return { amount: usdPrice, currency: "USD" as Currency };
    const rate = currentRate?.venta || 0;
    return { amount: usdPrice * rate, currency: "ARS" as Currency };
  }, [currency, currentRate]);

  return (
    <PrefsContext.Provider value={{
      currency, setCurrency, withIva, setWithIva, withIibb, setWithIibb,
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
  return ctx;
}
