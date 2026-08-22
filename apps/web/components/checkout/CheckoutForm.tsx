"use client";

import { ReactNode, SelectHTMLAttributes, InputHTMLAttributes, ButtonHTMLAttributes } from "react";
import NodoSpinner from "@/components/NodoSpinner";
import { AlertTriangle, CheckCircle2 } from "lucide-react";
import Link from "next/link";

export const controlClass =
  "h-10 w-full bg-surface-950 border border-surface-700/90 px-3 text-sm text-white rounded-sm " +
  "focus:outline-none focus:border-white/30 disabled:opacity-40 disabled:cursor-not-allowed " +
  "transition-[border-color,background-color] duration-150 appearance-none";

export function CheckoutField({
  label,
  htmlFor,
  hint,
  className = "",
  children,
}: {
  label: string;
  htmlFor?: string;
  hint?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <label htmlFor={htmlFor} className={`flex flex-col min-w-0 ${className}`}>
      <span className="mb-1.5 text-[10px] font-medium uppercase tracking-[0.16em] text-surface-500">
        {label}
      </span>
      {children}
      {hint && <span className="mt-1 text-[11px] text-surface-500 leading-snug">{hint}</span>}
    </label>
  );
}

export function CheckoutSelect(props: SelectHTMLAttributes<HTMLSelectElement>) {
  const { className = "", children, ...rest } = props;
  return (
    <div className="relative">
      <select {...rest} className={`${controlClass} pr-8 ${className}`}>
        {children}
      </select>
      <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-surface-500 text-[10px]">
        ▾
      </span>
    </div>
  );
}

export function CheckoutInput(props: InputHTMLAttributes<HTMLInputElement>) {
  const { className = "", ...rest } = props;
  return <input {...rest} className={`${controlClass} placeholder:text-surface-600 ${className}`} />;
}

export function CheckoutSegmented<T extends string>({
  value,
  onChange,
  options,
  ariaLabel,
}: {
  value: T;
  onChange: (next: T) => void;
  options: { value: T; label: string }[];
  ariaLabel: string;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className="grid h-10 p-0.5 rounded-sm bg-surface-950 border border-surface-700/90"
      style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}
    >
      {options.map((opt) => {
        const on = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onChange(opt.value)}
            className={`px-3 text-[13px] tracking-tight rounded-[1px] transition-colors ${
              on ? "bg-white text-black font-semibold" : "text-surface-400 hover:text-white"
            }`}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

export function CheckoutSubmit({
  children,
  loading,
  className = "",
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { loading?: boolean }) {
  return (
    <button
      type="button"
      {...rest}
      className={
        "h-10 px-4 inline-flex items-center justify-center gap-2 rounded-sm text-[13px] font-semibold tracking-tight " +
        "bg-white text-black hover:bg-surface-100 disabled:bg-surface-800 disabled:text-surface-500 disabled:hover:bg-surface-800 " +
        "transition-colors flex-shrink-0 " +
        className
      }
    >
      {loading ? <NodoSpinner className="w-3.5 h-3.5" /> : children}
    </button>
  );
}

export function CheckoutGhostButton({
  children,
  loading,
  className = "",
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { loading?: boolean }) {
  return (
    <button
      type="button"
      {...rest}
      className={
        "h-10 px-3 inline-flex items-center justify-center gap-2 rounded-sm text-[13px] font-medium tracking-tight " +
        "border border-surface-700 text-surface-200 hover:border-surface-500 hover:text-white " +
        "disabled:opacity-40 transition-colors flex-shrink-0 " +
        className
      }
    >
      {loading ? <NodoSpinner className="w-3.5 h-3.5" /> : children}
    </button>
  );
}

export function CheckoutLoading({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-2.5 h-10 text-sm text-surface-500">
      <NodoSpinner className="w-3.5 h-3.5" />
      {label}
    </div>
  );
}

export function CheckoutError({
  children,
  href,
  hrefLabel,
}: {
  children: ReactNode;
  href?: string;
  hrefLabel?: string;
}) {
  return (
    <div className="flex items-start gap-2 text-sm text-red-400 leading-snug">
      <AlertTriangle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
      <p className="min-w-0">
        {children}
        {href && (
          <>
            {" "}
            <Link href={href} className="underline text-red-300 hover:text-white">
              {hrefLabel ?? "Abrir"}
            </Link>
          </>
        )}
      </p>
    </div>
  );
}

export function CheckoutSuccess({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <p className="flex items-center gap-2 text-sm font-semibold text-emerald-400">
        <CheckCircle2 className="w-4 h-4" /> {title}
      </p>
      {children && <div className="text-sm text-surface-400 leading-relaxed">{children}</div>}
    </div>
  );
}
