"use client";

import { Loader2 } from "lucide-react";
import { tgsErr } from "./tgs-format";

export function TgsLoading() {
  return (
    <div className="flex justify-center py-16">
      <Loader2 className="w-5 h-5 animate-spin text-brand-500" />
    </div>
  );
}

export function TgsError({ err, fallback }: { err: unknown; fallback: string }) {
  return <p className="text-xs rounded-md px-3 py-2 bg-red-500/10 text-red-400">{tgsErr(err, fallback)}</p>;
}

export function TgsEmpty({ text }: { text: string }) {
  return <p className="text-sm text-surface-500 py-10 text-center">{text}</p>;
}

export function TgsField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5 min-w-0">
      <dt className="text-[10px] uppercase tracking-wide text-surface-500">{label}</dt>
      <dd className="text-sm text-white break-words">{children ?? "—"}</dd>
    </div>
  );
}

export function TgsInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={`bg-surface-800 border border-surface-700 rounded-lg px-3 py-2 text-sm text-white placeholder:text-surface-500 focus:outline-none focus:border-brand-500 ${props.className ?? ""}`}
    />
  );
}

export function TgsSelect(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...props}
      className={`bg-surface-800 border border-surface-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-brand-500 ${props.className ?? ""}`}
    />
  );
}

export function TgsButton({
  children,
  tone = "brand",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { tone?: "brand" | "ghost" }) {
  const styles =
    tone === "brand"
      ? "bg-brand-600 hover:bg-brand-500 text-white disabled:opacity-40"
      : "border border-surface-700 text-surface-300 hover:bg-surface-800 disabled:opacity-40";
  return (
    <button
      type={props.type ?? "button"}
      {...props}
      className={`inline-flex items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold transition-colors ${styles} ${props.className ?? ""}`}
    >
      {children}
    </button>
  );
}
