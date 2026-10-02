"use client";

import type { ReactNode } from "react";
import type { AdminSubscriptionRow, SubscriptionPaymentProvider, SubscriptionStatus, TenantPlan } from "@/lib/plans";

export type ShowToast = (msg: string, ok?: boolean) => void;

export const STATUS_TONE: Record<SubscriptionStatus, string> = {
  TRIAL: "bg-sky-500/15 text-sky-300",
  ACTIVE: "bg-emerald-500/15 text-emerald-300",
  PAST_DUE: "bg-amber-500/15 text-amber-300",
  GRACE_PERIOD: "bg-orange-500/15 text-orange-300",
  SUSPENDED: "bg-red-500/15 text-red-300",
  COURTESY: "bg-violet-500/15 text-violet-300",
  CANCELLED: "bg-surface-800 text-surface-400",
};

export const PAYMENT_PROVIDERS: SubscriptionPaymentProvider[] = ["MANUAL", "TRANSFER", "COURTESY", "OTHER"];
export const PLANS: TenantPlan[] = ["BASE", "PRO", "CUSTOM"];

export function fmtDate(iso: string | null | undefined): string {
  return iso ? new Date(iso).toLocaleDateString("es-AR") : "—";
}

export function dateInput(iso: string | null | undefined): string {
  return iso ? iso.slice(0, 10) : "";
}

export function today(): string {
  return new Date().toISOString().slice(0, 10);
}

/** `YYYY-MM-DD` del input → ISO al mediodía, para no correr de día por huso. */
export function toIso(day: string): string {
  return new Date(`${day}T12:00:00`).toISOString();
}

export function errMsg(err: unknown, fallback: string): string {
  return (err as { response?: { data?: { message?: string } } })?.response?.data?.message ?? fallback;
}

export const inputCls =
  "bg-surface-800 border border-surface-700 rounded-md px-2 py-1.5 text-xs text-white focus:outline-none focus:border-brand-500";
export const btnCls =
  "text-xs font-medium rounded-md px-3 py-1.5 bg-surface-800 text-surface-200 hover:bg-surface-700 disabled:opacity-50 transition-colors";
export const primaryCls =
  "text-xs font-semibold rounded-md px-3 py-1.5 bg-brand-600 text-white hover:bg-brand-500 disabled:opacity-50 transition-colors active:scale-[0.98]";

export function StatusPill({ row }: { row: Pick<AdminSubscriptionRow, "status" | "statusLabel"> }) {
  return <span className={`text-[11px] rounded-full px-2 py-0.5 whitespace-nowrap ${STATUS_TONE[row.status]}`}>{row.statusLabel}</span>;
}

export function Field({ label, children, grow = false }: { label: string; children: ReactNode; grow?: boolean }) {
  return (
    <label className={`flex flex-col gap-0.5 text-[10px] text-surface-500 ${grow ? "flex-1 min-w-[10rem]" : ""}`}>
      {label}
      {children}
    </label>
  );
}

/** Bloque plegable, cerrado por defecto. */
export function Fold({ title, count, children }: { title: string; count?: number; children: ReactNode }) {
  return (
    <details className="group border border-surface-800 rounded-xl">
      <summary className="cursor-pointer select-none list-none flex items-center justify-between px-3 py-2.5 text-xs font-semibold text-white">
        <span>
          {title}
          {count !== undefined && <span className="ml-1.5 font-normal text-surface-500">{count}</span>}
        </span>
        <span className="text-surface-500 transition-transform group-open:rotate-90" aria-hidden="true">
          ›
        </span>
      </summary>
      <div className="px-3 pb-3">{children}</div>
    </details>
  );
}
