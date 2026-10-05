"use client";

import { useState } from "react";
import { Check, FilePlus2, Loader2, Plus } from "lucide-react";
import { quoteBadge, quoteError, useQuotes } from "@/lib/quotes";

type Variant = "primary" | "icon" | "full" | "link";

/**
 * "Agregar al presupuesto" (modo vendedor). Va al presupuesto activo; si no hay,
 * crea uno. Para el vendedor reemplaza al carrito; para quien compra es una
 * acción secundaria. Sin modo vendedor no se muestra.
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
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!quotes.enabled) return null;

  const inActive =
    quotes.active?.items.find((it) => it.provider === product.provider && it.externalId === product.externalId)?.qty ?? 0;

  async function add(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (busy) return;
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

  const target = quotes.active ? quoteBadge(quotes.active) : "nuevo";
  const title = error ?? `Agregar al presupuesto ${quotes.active ? target : "(se crea uno nuevo)"}`;
  const Icon = busy ? Loader2 : done ? Check : variant === "icon" ? FilePlus2 : Plus;
  const iconCls = `h-3.5 w-3.5 ${busy ? "animate-spin" : ""}`;

  if (variant === "icon") {
    return (
      <button type="button" onClick={add} title={title} aria-label="Agregar al presupuesto" className={`pc__ghost ${inActive ? "is-on" : ""}`}>
        <Icon className={iconCls} />
      </button>
    );
  }

  if (variant === "link") {
    return (
      <button
        type="button"
        onClick={add}
        disabled={busy}
        className="inline-flex items-center gap-1.5 self-start text-xs font-medium text-surface-400 transition-colors hover:text-brand-300 disabled:opacity-60"
      >
        <Icon className={iconCls} />
        {error ?? (done ? `Agregado a ${target}` : inActive ? `En el presupuesto ${target} (${inActive}) · sumar` : "Agregar a un presupuesto")}
      </button>
    );
  }

  if (variant === "full") {
    return (
      <div className="flex flex-col gap-1">
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
  );
}
