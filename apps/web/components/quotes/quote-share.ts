"use client";

import { useEffect, useState } from "react";
import { quotesApi, type QuoteSettings } from "@/lib/quotes";
import { whatsappNumber } from "@/lib/phone";
import type { QuotePdfModel } from "./pdf/quote-pdf-model";

/** Texto para WhatsApp o para copiar: corto, legible en el celular del cliente. Sale del mismo modelo que el PDF. */
export function quoteText(model: QuotePdfModel): string {
  const lines = [[model.business.name, `Presupuesto ${model.code}`].filter(Boolean).join(" · ")];
  if (model.client.name) lines.push(`Para: ${model.client.name}`);
  lines.push("");
  for (const l of model.lines) {
    lines.push(l.qty > 1 ? `• ${l.qty} × ${l.name} — ${l.unit} c/u = ${l.total}` : `• ${l.name} — ${l.total}`);
  }
  lines.push("");
  for (const t of model.totals) lines.push(`${t.strong ? "*" : ""}${t.label}: ${t.value}${t.strong ? "*" : ""}`);
  if (model.validUntil) lines.push(`Válido hasta el ${model.validUntil}.`);
  if (model.currencyNote) lines.push(model.currencyNote);
  if (model.notes) lines.push("", model.notes);
  if (model.terms?.trim()) lines.push("", `Condiciones: ${model.terms.trim()}`);
  return lines.join("\n");
}

/** wa.me con el teléfono del cliente; si no se entiende el número, WhatsApp deja elegir el contacto. */
export function whatsappUrl(text: string, phone: string | null): string {
  const target = whatsappNumber(phone);
  const base = target ? `https://wa.me/${target}` : "https://wa.me/";
  return `${base}?text=${encodeURIComponent(text)}`;
}

let cached: { at: number; value: Promise<QuoteSettings> } | null = null;
const listeners = new Set<(s: QuoteSettings) => void>();

/** Plantilla del comercio (un minuto en memoria; quien la guarda la refresca para todos). */
export function loadQuoteSettings(force = false): Promise<QuoteSettings> {
  if (!force && cached && Date.now() - cached.at < 60_000) return cached.value;
  const value = quotesApi.settings().then((r) => r.data);
  cached = { at: Date.now(), value };
  value.catch(() => {
    cached = null;
  });
  return value;
}

export function publishQuoteSettings(s: QuoteSettings) {
  cached = { at: Date.now(), value: Promise.resolve(s) };
  for (const fn of listeners) fn(s);
}

export function useQuoteSettings(): QuoteSettings | null {
  const [settings, setSettings] = useState<QuoteSettings | null>(null);
  useEffect(() => {
    let alive = true;
    void loadQuoteSettings()
      .then((s) => alive && setSettings(s))
      .catch(() => undefined);
    const fn = (s: QuoteSettings) => setSettings(s);
    listeners.add(fn);
    return () => {
      alive = false;
      listeners.delete(fn);
    };
  }, []);
  return settings;
}
