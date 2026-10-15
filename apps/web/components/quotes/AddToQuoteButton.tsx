"use client";

import { useState } from "react";
import { Check, FilePlus2, Loader2, Plus } from "lucide-react";
import { quoteBadge, quoteError, useQuotes } from "@/lib/quotes";
import { useSellerSession } from "@/lib/sale-price";
import QuotePicker from "./QuotePicker";

type Variant = "primary" | "icon" | "full" | "link" | "bar";

/**
 * "Agregar al presupuesto" (modo vendedor). Va al presupuesto activo.
 * - Vendedor (con burbuja): si no hay activo, crea uno; reemplaza al carrito.
 * - Quien compra: si no está armando ninguno, pregunta a cuál (o uno nuevo) y
 *   ese queda como el que está armando. Es una acción secundaria.
 * Sin modo vendedor no se muestra.
 */
export default function AddToQuoteButton({
  product,
  qty = 1,
  variant = "primary",
  tone = "light",
  compact = false,
}: {
  product: { provider: string; externalId: string; name?: string };
  qty?: number;
  variant?: Variant;
  tone?: "light" | "dark";
  compact?: boolean;
}) {
  const quotes = useQuotes();
  const { isSeller } = useSellerSession();
  const [busy, setBusy] = useState(false);
  const [picking, setPicking] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!quotes.enabled) return null;

  const inActive =
    quotes.active?.items.find((it) => it.provider === product.provider && it.externalId === product.externalId)?.qty ?? 0;

  async function add(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (busy) return;
    // Quien compra elige el destino la primera vez.
    if (!isSeller && !quotes.active) {
      setPicking(true);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await quotes.add(product, qty);
      setDone(true);
      setTimeout(() => setDone(false), 1400);
    } catch (err) {
      setError(quoteError(err, "No se pudo agregar"));
      setTimeout(() => setError(null), 3500);
    } finally {
      setBusy(false);
    }
  }

  async function addTo(quoteId: string | null) {
    const id = quoteId ?? (await quotes.create()).id;
    await quotes.add(product, qty, id);
    setDone(true);
    setTimeout(() => setDone(false), 1400);
  }

  const picker = picking ? (
    <QuotePicker productName={product.name} onPick={addTo} onClose={() => setPicking(false)} />
  ) : null;

  const target = quotes.active ? quoteBadge(quotes.active) : "nuevo";
  const title =
    error ??
    (quotes.active
      ? `Agregar al presupuesto ${target}`
      : isSeller
        ? "Agregar al presupuesto (se crea uno nuevo)"
        : "Agregar a un presupuesto");
  const Icon = busy ? Loader2 : done ? Check : variant === "icon" ? FilePlus2 : Plus;
  const iconCls = `h-3.5 w-3.5 ${busy ? "animate-spin" : ""}`;

  // Franja de la tarjeta mientras se arma un presupuesto: dice a cuál va y cuántos tiene ya.
  if (variant === "bar" && quotes.active) {
    const who = quotes.active.clientName ? ` · ${quotes.active.clientName}` : "";
    return (
      <>
        {picker}
        <button
          type="button"
          onClick={add}
          disabled={busy}
          title={title}
          className={`flex h-8 w-full items-center justify-center gap-1.5 rounded-lg border px-2 text-[11px] font-semibold transition-colors disabled:opacity-60 ${
            error
              ? "border-red-300 text-red-500"
              : done
                ? "border-emerald-300 bg-emerald-50 text-emerald-700"
                : inActive
                  ? "border-brand-300 bg-brand-50 text-brand-700"
                  : "border-brand-200 bg-white text-brand-600 hover:border-brand-400 hover:bg-brand-50"
          }`}
        >
          <Icon className={`flex-shrink-0 ${iconCls}`} />
          <span className="truncate">
            {error ?? (done ? `Agregado a #${quotes.active.number}` : inActive ? `Sumar a #${quotes.active.number} · ya tiene ${inActive}` : `Agregar a #${quotes.active.number}${who}`)}
          </span>
        </button>
      </>
    );
  }

  if (variant === "icon") {
    // Armando un presupuesto: el botón dice a cuál va (un ícono solo no se entendía).
    if (quotes.active) {
      return (
        <>
          {picker}
          <button
            type="button"
            onClick={add}
            title={title}
            aria-label={`Agregar al presupuesto ${target}`}
            className={`inline-flex h-8 items-center gap-1 rounded-lg border px-2 text-[11px] font-semibold transition-colors ${
              error
                ? "border-red-300 text-red-500"
                : inActive || done
                  ? "border-brand-300 bg-brand-50 text-brand-700"
                  : "border-brand-200 bg-white text-brand-600 hover:border-brand-400"
            }`}
          >
            <Icon className={iconCls} />
            <span className="tabular-nums">{done ? "Listo" : inActive ? `${target} · ${inActive}` : target}</span>
          </button>
        </>
      );
    }
    return (
      <>
      {picker}
      <button type="button" onClick={add} title={title} aria-label="Agregar a un presupuesto" className={`pc__ghost ${inActive ? "is-on" : ""}`}>
        <Icon className={iconCls} />
      </button>
      </>
    );
  }

  if (variant === "link") {
    return (
      <>
      {picker}
      <button
        type="button"
        onClick={add}
        disabled={busy}
        className="inline-flex items-center gap-1.5 self-start text-xs font-medium text-surface-400 transition-colors hover:text-brand-300 disabled:opacity-60"
      >
        <Icon className={iconCls} />
        {error ??
          (done
            ? `Agregado a ${quotes.active ? quoteBadge(quotes.active) : target}`
            : inActive
              ? `En el presupuesto ${target} (${inActive}) · sumar`
              : quotes.active
                ? `Agregar al presupuesto ${target}`
                : "Agregar a un presupuesto")}
      </button>
      </>
    );
  }

  if (variant === "full") {
    return (
      <div className="flex flex-col gap-1">
        {picker}
        <button
          type="button"
          onClick={add}
          disabled={busy}
          className={`flex w-full items-center justify-center gap-2 rounded-lg py-2.5 text-sm font-semibold transition-colors disabled:opacity-60 ${
            done ? "bg-emerald-600 text-white" : "bg-brand-600 text-white hover:bg-brand-500"
          }`}
        >
          <Icon className="h-4 w-4" />
          {done ? `Agregado a ${target}` : inActive ? `En el presupuesto ${target} (${inActive})` : "Agregar al presupuesto"}
        </button>
        {error && <p className="text-xs text-red-300">{error}</p>}
      </div>
    );
  }

  const shell =
    tone === "light"
      ? inActive
        ? "border-brand-200/80 bg-brand-50/80 text-brand-700"
        : "border-slate-200/90 bg-white text-brand-600 shadow-sm hover:border-brand-300"
      : inActive
        ? "border-brand-500/30 bg-brand-500/15 text-brand-200"
        : "border-surface-700 bg-surface-800 text-surface-200 hover:text-white";

  return (
    <>
    {picker}
    <button
      type="button"
      onClick={add}
      title={title}
      disabled={busy}
      className={`flex min-w-0 flex-1 items-center justify-center gap-1.5 rounded-lg border font-semibold transition-colors disabled:opacity-60 ${shell} ${
        compact ? "h-8 px-2 text-[11px]" : "h-9 px-2 text-xs sm:h-8"
      } ${error ? "!border-red-300 !text-red-500" : ""}`}
    >
      <Icon className={`flex-shrink-0 ${iconCls}`} />
      <span className="truncate">{done ? "Agregado" : "Presupuesto"}</span>
      {inActive > 0 && !done && <span className="flex-shrink-0 tabular-nums opacity-70">{inActive}</span>}
    </button>
    </>
  );
}
