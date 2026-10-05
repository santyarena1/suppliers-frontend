"use client";

import { useEffect, useRef, useState } from "react";
import { AlertTriangle, Undo2, X } from "lucide-react";
import { formatARS, formatUSD } from "@/lib/format";
import { usePrefs } from "@/lib/prefs";
import {
  SALE_MARGIN_SOURCE_LABELS,
  checkMargin,
  formatMargin,
  parseMarginInput,
  type SaleMarginSource,
} from "@/lib/sale-margins";

/** Importes de la pantalla de márgenes en la moneda elegida (los datos vienen en USD). */
export function useMoney() {
  const { currency, convert } = usePrefs();
  return (usd: number | null | undefined) => {
    if (usd == null || !Number.isFinite(usd)) return "—";
    return currency === "USD" ? formatUSD(usd) : formatARS(convert(usd).amount);
  };
}

const SOURCE_TONE: Record<SaleMarginSource, string> = {
  product: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
  category: "bg-emerald-500/10 text-emerald-300 border-emerald-500/25",
  provider: "bg-brand-500/10 text-brand-300 border-brand-500/25",
  store: "bg-surface-700/50 text-surface-300 border-surface-600",
  none: "bg-transparent text-surface-500 border-surface-700 border-dashed",
};

/** De dónde sale el margen: propio o heredado. */
export function SourceBadge({ source, own }: { source: SaleMarginSource; own?: boolean }) {
  const label = own ? "Propio" : SALE_MARGIN_SOURCE_LABELS[source];
  return (
    <span
      className={`inline-flex items-center rounded-md border px-1.5 py-0.5 text-[10px] font-medium whitespace-nowrap ${
        own ? SOURCE_TONE.product : SOURCE_TONE[source]
      }`}
      title={own ? "Margen cargado acá" : `Hereda el margen de: ${SALE_MARGIN_SOURCE_LABELS[source].toLowerCase()}`}
    >
      {label}
    </span>
  );
}

/**
 * Campo de margen en línea. Vacío = hereda (muestra el heredado de fondo).
 * Guarda al salir o con Enter; Escape descarta. Negativo o muy alto pide confirmar.
 */
export function MarginInput({
  value,
  inherited,
  disabled,
  onCommit,
  label,
  size = "md",
}: {
  value: number | null;
  inherited: number | null;
  disabled?: boolean;
  onCommit: (next: number | null) => void;
  label: string;
  size?: "sm" | "md";
}) {
  const [draft, setDraft] = useState(value == null ? "" : String(value));
  const [error, setError] = useState<string | null>(null);
  const editing = useRef(false);

  useEffect(() => {
    if (!editing.current) setDraft(value == null ? "" : String(value));
  }, [value]);

  function commit() {
    editing.current = false;
    const trimmed = draft.trim();
    if (!trimmed) {
      setError(null);
      if (value != null) onCommit(null);
      return;
    }
    const parsed = parseMarginInput(trimmed);
    if (parsed == null) {
      setError("Escribí un número, por ejemplo 25 o 12,5.");
      return;
    }
    const check = checkMargin(parsed);
    if (!check.ok) {
      setError(check.error);
      return;
    }
    if (check.warning && !window.confirm(check.warning)) {
      setDraft(value == null ? "" : String(value));
      setError(null);
      return;
    }
    setError(null);
    if (parsed !== value) onCommit(parsed);
  }

  const height = size === "sm" ? "h-8 text-xs" : "h-9 text-sm";
  return (
    <div className="relative">
      <div className="relative">
        <input
          type="text"
          inputMode="decimal"
          aria-label={label}
          aria-invalid={Boolean(error)}
          disabled={disabled}
          value={draft}
          placeholder={inherited != null ? formatMargin(inherited).replace(" %", "") : "0"}
          onFocus={() => {
            editing.current = true;
          }}
          onChange={(e) => {
            setDraft(e.target.value);
            setError(null);
          }}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") (e.target as HTMLInputElement).blur();
            if (e.key === "Escape") {
              editing.current = false;
              setDraft(value == null ? "" : String(value));
              setError(null);
              (e.target as HTMLInputElement).blur();
            }
          }}
          className={`w-full rounded-lg border bg-surface-800 pl-2.5 pr-7 font-mono tabular-nums text-white placeholder:text-surface-500 transition focus:outline-none focus:ring-2 disabled:cursor-not-allowed disabled:opacity-60 ${height} ${
            error
              ? "border-red-500/60 focus:ring-red-500/30"
              : value != null
                ? "border-emerald-500/40 focus:border-emerald-400 focus:ring-emerald-500/20"
                : "border-surface-700 focus:border-brand-500 focus:ring-brand-500/20"
          }`}
        />
        <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-surface-500">%</span>
      </div>
      {error && (
        <p role="alert" className="mt-1 text-[11px] leading-snug text-red-400">
          {error}
        </p>
      )}
    </div>
  );
}

/** Aviso abajo con "Deshacer" durante unos segundos. */
export function UndoToast({
  message,
  onUndo,
  onClose,
  tone = "ok",
}: {
  message: string;
  onUndo?: () => void;
  onClose: () => void;
  tone?: "ok" | "error";
}) {
  useEffect(() => {
    const t = window.setTimeout(onClose, 8000);
    return () => window.clearTimeout(t);
  }, [message, onClose]);
  return (
    <div
      role="status"
      className={`fixed bottom-5 left-1/2 z-[60] flex max-w-[calc(100vw-2rem)] -translate-x-1/2 items-center gap-3 rounded-xl border px-4 py-2.5 text-sm shadow-2xl ${
        tone === "error" ? "border-red-500/40 bg-red-950/95 text-red-100" : "border-surface-700 bg-surface-900/95 text-surface-100"
      } backdrop-blur`}
    >
      {tone === "error" && <AlertTriangle className="h-4 w-4 flex-shrink-0 text-red-400" />}
      <span className="min-w-0">{message}</span>
      {onUndo && (
        <button
          type="button"
          onClick={() => {
            onUndo();
            onClose();
          }}
          className="inline-flex flex-shrink-0 items-center gap-1 rounded-md px-2 py-1 text-xs font-semibold text-emerald-300 hover:bg-white/5"
        >
          <Undo2 className="h-3.5 w-3.5" />
          Deshacer
        </button>
      )}
      <button type="button" onClick={onClose} className="flex-shrink-0 text-surface-500 hover:text-white" aria-label="Cerrar aviso">
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

/** Barra flotante de acciones para lo seleccionado. */
export function BulkBar({
  count,
  noun,
  disabled,
  onApply,
  onClear,
  onDeselect,
}: {
  count: number;
  noun: { one: string; many: string };
  disabled?: boolean;
  onApply: (percent: number) => void;
  onClear: () => void;
  onDeselect: () => void;
}) {
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  if (count === 0) return null;

  function apply() {
    const parsed = parseMarginInput(draft);
    if (parsed == null) {
      setError("Escribí el margen.");
      return;
    }
    const check = checkMargin(parsed);
    if (!check.ok) {
      setError(check.error);
      return;
    }
    if (check.warning && !window.confirm(check.warning)) return;
    setError(null);
    onApply(parsed);
    setDraft("");
  }

  return (
    <div className="sticky bottom-3 z-30 mt-3">
      <div className="mx-auto flex max-w-3xl flex-wrap items-center gap-2 rounded-2xl border border-emerald-500/30 bg-surface-900/95 px-3 py-2.5 shadow-[0_20px_50px_-20px_rgb(0_0_0/0.8)] backdrop-blur">
        <span className="mr-1 text-sm text-white">
          <b className="tabular-nums">{count}</b> {count === 1 ? noun.one : noun.many}
        </span>
        <div className="flex items-center gap-1.5">
          <div className="relative w-24">
            <input
              type="text"
              inputMode="decimal"
              aria-label="Margen para lo seleccionado"
              placeholder="25"
              value={draft}
              disabled={disabled}
              onChange={(e) => {
                setDraft(e.target.value);
                setError(null);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") apply();
              }}
              className="h-9 w-full rounded-lg border border-surface-700 bg-surface-800 pl-2.5 pr-7 font-mono text-sm tabular-nums text-white focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
            />
            <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-surface-500">%</span>
          </div>
          <button
            type="button"
            disabled={disabled}
            onClick={apply}
            className="h-9 rounded-lg bg-emerald-600 px-3 text-sm font-semibold text-white transition hover:bg-emerald-500 active:translate-y-px disabled:opacity-50"
          >
            Aplicar
          </button>
        </div>
        <button
          type="button"
          disabled={disabled}
          onClick={onClear}
          className="h-9 rounded-lg border border-surface-700 px-3 text-sm text-surface-300 transition hover:border-surface-500 hover:text-white disabled:opacity-50"
        >
          Quitar margen propio
        </button>
        <button type="button" onClick={onDeselect} className="ml-auto h-9 px-2 text-xs text-surface-500 hover:text-white">
          Deseleccionar
        </button>
        {error && <p className="basis-full text-[11px] text-red-400">{error}</p>}
      </div>
    </div>
  );
}
