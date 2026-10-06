"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { FileText, Loader2, Plus, X } from "lucide-react";
import { quoteBadge, quoteError, quoteTitle, useQuoteTotal, useQuotes } from "@/lib/quotes";

const RECENT = 6;

/**
 * "¿A qué presupuesto lo agrego?": los presupuestos recientes y uno nuevo. Lo
 * usa quien no ve la burbuja de vendedor cuando no está armando ninguno. Al
 * elegir, ese presupuesto queda como el que se está armando.
 */
export default function QuotePicker({
  productName,
  onPick,
  onClose,
}: {
  productName?: string;
  /** `null` = crear uno nuevo. */
  onPick: (quoteId: string | null) => Promise<void>;
  onClose: () => void;
}) {
  const quotes = useQuotes();
  const totalOf = useQuoteTotal();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const firstRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    firstRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function pick(id: string | null) {
    if (busy) return;
    setBusy(id ?? "new");
    setError(null);
    try {
      await onPick(id);
      onClose();
    } catch (err) {
      setError(quoteError(err, "No se pudo agregar"));
      setBusy(null);
    }
  }

  const recent = quotes.mine.slice(0, RECENT);

  return createPortal(
    <div
      className="fixed inset-0 z-[70] flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4"
      onClick={(e) => {
        e.stopPropagation();
        onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="quote-picker-title"
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-sm overflow-hidden rounded-t-2xl border border-surface-700 bg-surface-950 shadow-2xl sm:rounded-2xl"
      >
        <header className="flex items-start gap-3 border-b border-surface-800 px-4 py-3">
          <div className="min-w-0 flex-1">
            <h2 id="quote-picker-title" className="text-sm font-semibold text-white">
              ¿A qué presupuesto lo agregás?
            </h2>
            {productName && <p className="mt-0.5 truncate text-xs text-surface-500">{productName}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1 text-surface-500 hover:bg-surface-800 hover:text-white"
            aria-label="Cerrar"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="max-h-[50dvh] overflow-y-auto p-2">
          <button
            ref={firstRef}
            type="button"
            onClick={() => pick(null)}
            disabled={busy !== null}
            className="flex w-full items-center gap-3 rounded-xl border border-dashed border-brand-500/50 px-3 py-2.5 text-left hover:bg-brand-500/10 disabled:opacity-60"
          >
            <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-brand-600 text-white">
              {busy === "new" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            </span>
            <span className="min-w-0">
              <span className="block text-sm font-semibold text-white">Nuevo presupuesto</span>
              <span className="block text-[11px] text-surface-500">Para un cliente nuevo; los datos los cargás después</span>
            </span>
          </button>

          {recent.length > 0 && (
            <p className="px-2 pb-1 pt-3 text-[10px] font-semibold uppercase tracking-wider text-surface-500">Tus presupuestos</p>
          )}
          <ul className="space-y-1">
            {recent.map((q) => (
              <li key={q.id}>
                <button
                  type="button"
                  onClick={() => pick(q.id)}
                  disabled={busy !== null}
                  className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left hover:bg-surface-900 disabled:opacity-60"
                >
                  <span className="flex h-9 min-w-[2.25rem] flex-shrink-0 items-center justify-center rounded-full bg-surface-800 px-1.5 text-[11px] font-bold text-surface-200">
                    {busy === q.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : quoteBadge(q)}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm text-white">{quoteTitle(q)}</span>
                    <span className="block text-[11px] text-surface-500">
                      {q.itemCount === 0 ? "Sin productos" : `${q.itemCount} u. · ${totalOf(q)}`}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
          {recent.length === 0 && quotes.loaded && (
            <p className="flex items-center gap-2 px-3 py-3 text-xs text-surface-500">
              <FileText className="h-3.5 w-3.5" /> Todavía no tenés presupuestos abiertos.
            </p>
          )}
        </div>
        {error && <p className="border-t border-surface-800 px-4 py-2 text-xs text-red-300">{error}</p>}
      </div>
    </div>,
    document.body
  );
}
