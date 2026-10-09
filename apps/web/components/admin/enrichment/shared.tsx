"use client";

import { assetUrl } from "@/lib/assets";
import { proxyImg } from "@/lib/format";
import { confidenceTone, SOURCE_LABELS } from "@/lib/enrichment";

export type ShowToast = (m: string, ok?: boolean) => void;

export function errMsg(err: unknown, fallback: string): string {
  return (err as { response?: { data?: { message?: string } } })?.response?.data?.message || fallback;
}

export function thumb(url: string | null | undefined): string {
  if (!url) return "";
  if (url.startsWith("/assets/") || url.startsWith("/uploads/")) return assetUrl(url);
  return proxyImg(url, { trim: false });
}

export function fmtWhen(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("es-AR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

const TONE_CLASS = {
  high: "border-emerald-500/30 bg-emerald-500/10 text-emerald-300",
  mid: "border-amber-500/30 bg-amber-500/10 text-amber-300",
  low: "border-red-500/30 bg-red-500/10 text-red-300",
  none: "border-surface-700 bg-surface-800/60 text-surface-400",
};

/** Confianza 0–1 como porcentaje con color. */
export function ConfidenceBadge({ value }: { value: number | null | undefined }) {
  const tone = confidenceTone(value);
  return (
    <span className={`inline-flex items-center rounded-md border px-1.5 py-0.5 text-[10px] font-semibold tabular-nums ${TONE_CLASS[tone]}`}>
      {value === null || value === undefined ? "—" : `${Math.round(value * 100)}%`}
    </span>
  );
}

/** Fuente(s) de un dato: "icecat,ai" → "Open Icecat · IA". */
export function SourceTag({ source }: { source: string }) {
  return (
    <span className="text-[10px] uppercase tracking-wide text-surface-400">
      {source
        .split(",")
        .map((s) => SOURCE_LABELS[s] ?? s)
        .join(" · ")}
    </span>
  );
}

export function Stat({ label, value, hint }: { label: string; value: number | string; hint?: string }) {
  return (
    <div className="min-w-0 rounded-lg border border-surface-800 bg-surface-900/50 px-3 py-2">
      <p className="text-lg font-semibold tabular-nums text-white">{value}</p>
      <p className="truncate text-[11px] text-surface-400" title={hint}>
        {label}
      </p>
    </div>
  );
}
