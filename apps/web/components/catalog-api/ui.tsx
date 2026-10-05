"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, Check, Copy, X } from "lucide-react";

export const inputClass =
  "w-full bg-surface-800 border border-surface-700 rounded-md px-2.5 py-1.5 text-sm text-white placeholder-surface-600 focus:outline-none focus:border-brand-500 disabled:opacity-60";

export const primaryBtn =
  "h-9 px-3 inline-flex items-center justify-center gap-1.5 rounded-lg bg-brand-600 hover:bg-brand-500 text-white text-xs font-semibold active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none transition-colors";

export const ghostBtn =
  "h-9 px-3 inline-flex items-center justify-center gap-1.5 rounded-lg border border-surface-700 hover:border-surface-500 text-surface-200 hover:text-white text-xs font-medium active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none transition-colors";

export const dangerBtn =
  "h-9 px-3 inline-flex items-center justify-center gap-1.5 rounded-lg border border-red-500/30 hover:border-red-400/60 text-red-300 hover:text-red-200 text-xs font-medium active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none transition-colors";

export function apiMessage(err: unknown, fallback: string): string {
  const data = (err as { response?: { data?: { message?: string; error?: { message?: string } } } })?.response?.data;
  return data?.message ?? data?.error?.message ?? fallback;
}

export function fmtDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("es-AR", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" });
}

/** "hace 3 min", "hace 2 h", "hace 4 días". */
export function fmtAgo(iso: string | null | undefined): string {
  if (!iso) return "Nunca";
  const ms = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(ms)) return "—";
  const min = Math.round(ms / 60_000);
  if (min < 1) return "recién";
  if (min < 60) return `hace ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `hace ${h} h`;
  const d = Math.round(h / 24);
  return `hace ${d} ${d === 1 ? "día" : "días"}`;
}

export function useCopy(timeout = 1800) {
  const [copied, setCopied] = useState<string | null>(null);
  const copy = useCallback(
    async (text: string, key = text) => {
      try {
        await navigator.clipboard.writeText(text);
        setCopied(key);
        setTimeout(() => setCopied((v) => (v === key ? null : v)), timeout);
        return true;
      } catch {
        return false;
      }
    },
    [timeout]
  );
  return { copied, copy };
}

export function CopyButton({ text, label, className = "" }: { text: string; label?: string; className?: string }) {
  const { copied, copy } = useCopy();
  const done = copied === text;
  return (
    <button
      type="button"
      onClick={() => void copy(text)}
      className={`inline-flex items-center gap-1 text-[11px] font-medium rounded-md px-2 h-7 border transition-colors ${
        done ? "border-emerald-500/40 text-emerald-300" : "border-surface-700 text-surface-300 hover:text-white hover:border-surface-500"
      } ${className}`}
      aria-label={label ? `Copiar ${label}` : "Copiar"}
    >
      {done ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
      {done ? "Copiado" : "Copiar"}
    </button>
  );
}

/** Valor monoespaciado con botón de copiar. */
export function CopyField({ value, label, mask }: { value: string; label?: string; mask?: boolean }) {
  return (
    <div className="flex items-center gap-2 min-w-0">
      <code className="flex-1 min-w-0 truncate rounded-md bg-surface-900 border border-surface-800 px-2.5 py-1.5 text-xs font-mono text-surface-200">
        {mask ? "•".repeat(Math.min(value.length, 32)) : value}
      </code>
      <CopyButton text={value} label={label} />
    </div>
  );
}

export function Modal({
  title,
  onClose,
  children,
  wide,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  wide?: boolean;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm p-0 sm:p-4" role="dialog" aria-modal="true" aria-label={title}>
      <div className={`w-full ${wide ? "sm:max-w-2xl" : "sm:max-w-lg"} max-h-[92dvh] overflow-y-auto rounded-t-2xl sm:rounded-2xl border border-surface-700 bg-surface-950 shadow-2xl`}>
        <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-surface-800 bg-surface-950 px-5 py-3.5">
          <h2 className="text-sm font-semibold text-white">{title}</h2>
          <button type="button" onClick={onClose} className="text-surface-500 hover:text-white p-1" aria-label="Cerrar">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="px-5 py-4">{children}</div>
      </div>
    </div>
  );
}

/** Secret que se ve una sola vez: se copia, se confirma y se cierra. */
export function SecretReveal({
  title,
  lead,
  items,
  footnote,
  onClose,
}: {
  title: string;
  lead: string;
  items: { label: string; value: string }[];
  footnote?: string;
  onClose: () => void;
}) {
  const [saved, setSaved] = useState(false);
  return (
    <Modal title={title} onClose={() => saved && onClose()}>
      <div className="flex items-start gap-2.5 rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2.5">
        <AlertTriangle className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
        <p className="text-xs text-amber-100/90 leading-relaxed">{lead}</p>
      </div>
      <div className="mt-4 flex flex-col gap-3">
        {items.map((it) => (
          <div key={it.label}>
            <p className="text-[11px] uppercase tracking-wider text-surface-500 mb-1">{it.label}</p>
            <CopyField value={it.value} label={it.label} />
          </div>
        ))}
      </div>
      {footnote && <p className="mt-3 text-[11px] text-surface-500 leading-relaxed">{footnote}</p>}
      <label className="mt-4 flex items-center gap-2 text-xs text-surface-300 cursor-pointer select-none">
        <input type="checkbox" checked={saved} onChange={(e) => setSaved(e.target.checked)} className="accent-brand-500" />
        Ya lo guardé en un lugar seguro
      </label>
      <div className="mt-4 flex justify-end">
        <button type="button" disabled={!saved} onClick={onClose} className={primaryBtn}>
          Listo
        </button>
      </div>
    </Modal>
  );
}

export function StatusPill({ tone, children }: { tone: "ok" | "warn" | "bad" | "muted" | "brand"; children: React.ReactNode }) {
  const tones = {
    ok: "bg-emerald-500/10 text-emerald-300 border-emerald-500/25",
    warn: "bg-amber-500/10 text-amber-300 border-amber-500/25",
    bad: "bg-red-500/10 text-red-300 border-red-500/25",
    muted: "bg-surface-800 text-surface-400 border-surface-700",
    brand: "bg-brand-500/10 text-brand-300 border-brand-500/30",
  } as const;
  return (
    <span className={`inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[11px] font-medium ${tones[tone]}`}>{children}</span>
  );
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5" role="group" aria-label={label}>
      <span className="text-xs font-medium text-surface-200">{label}</span>
      {children}
      {hint && <span className="text-[11px] text-surface-500 leading-relaxed">{hint}</span>}
    </div>
  );
}

/** Grupo de opciones excluyentes con aspecto de botones. */
export function Segmented<T extends string>({
  value,
  options,
  onChange,
  disabled,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex flex-wrap gap-1.5" role="radiogroup">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          disabled={disabled}
          onClick={() => onChange(o.value)}
          className={`h-8 px-2.5 rounded-md border text-xs font-medium transition-colors disabled:opacity-60 ${
            value === o.value ? "border-brand-500 bg-brand-500/10 text-white" : "border-surface-700 text-surface-400 hover:text-white hover:border-surface-500"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Toggle({
  checked,
  onChange,
  label,
  hint,
  disabled,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  hint?: string;
  disabled?: boolean;
}) {
  return (
    <div className={`flex items-start gap-3 ${disabled ? "opacity-60" : ""}`}>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={`relative mt-0.5 h-5 w-9 flex-shrink-0 rounded-full transition-colors ${checked ? "bg-brand-500" : "bg-surface-700"}`}
      >
        <span className={`absolute top-0.5 left-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${checked ? "translate-x-4" : ""}`} />
      </button>
      <span className="min-w-0">
        <span className="block text-xs font-medium text-surface-100">{label}</span>
        {hint && <span className="block text-[11px] text-surface-500 mt-0.5 leading-relaxed">{hint}</span>}
      </span>
    </div>
  );
}

/** "en 5 min", "en 2 h" para un momento futuro. */
export function fmtIn(iso: string | null | undefined): string {
  if (!iso) return "pronto";
  const ms = new Date(iso).getTime() - Date.now();
  if (!Number.isFinite(ms) || ms <= 60_000) return "en instantes";
  const min = Math.round(ms / 60_000);
  if (min < 60) return `en ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `en ${h} h`;
  const d = Math.round(h / 24);
  return `en ${d} ${d === 1 ? "día" : "días"}`;
}

/** Si una fecha ISO ya pasó. */
export function isPast(iso: string | null | undefined): boolean {
  if (!iso) return false;
  const t = new Date(iso).getTime();
  return Number.isFinite(t) && t < Date.now();
}
