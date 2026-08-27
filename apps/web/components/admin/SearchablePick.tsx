"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, Plus } from "lucide-react";
import type { LabelChoice } from "@/lib/catalog-menu";

export default function SearchablePick({
  label,
  value,
  options,
  onChange,
  onCreate,
  optional,
  creating,
  placeholder,
}: {
  label?: string;
  value: string;
  options: LabelChoice[];
  onChange: (v: string) => void;
  onCreate?: (name: string) => void | Promise<void>;
  optional?: boolean;
  creating?: boolean;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const q = value.trim().toLowerCase();
  const filtered = (q ? options.filter((o) => o.label.toLowerCase().includes(q)) : options).slice(0, 80);
  const exact = options.some((o) => o.label.toLowerCase() === q);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  return (
    <div ref={wrapRef} className="flex flex-col gap-0.5 min-w-[200px] relative">
      {label && <span className="text-[10px] text-surface-500 uppercase tracking-wide">{label}</span>}
      <input
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        placeholder={placeholder ?? (optional ? "Opcional — escribí cualquiera" : "Escribí para buscar…")}
        className="rounded-lg border border-surface-700 bg-surface-900 px-2.5 py-1.5 text-sm text-white"
      />
      {open && (
        <div className="absolute left-0 right-0 top-full z-30 mt-1 max-h-64 overflow-y-auto rounded-lg border border-surface-700 bg-surface-950 shadow-xl">
          {filtered.map((o) => (
            <button
              key={o.label}
              type="button"
              onClick={() => {
                onChange(o.label);
                setOpen(false);
              }}
              className="flex w-full items-baseline justify-between gap-2 text-left px-2.5 py-1.5 text-xs hover:bg-surface-800"
            >
              <span className="text-surface-100 truncate">{o.label}</span>
              <span className="text-surface-500 tabular-nums flex-shrink-0">
                {o.count} prod.{o.hint ? ` · ${o.hint}` : ""}
              </span>
            </button>
          ))}
          {q && !exact && (
            <button
              type="button"
              disabled={creating}
              onClick={() => {
                if (onCreate) void Promise.resolve(onCreate(value.trim())).then(() => setOpen(false));
                else {
                  onChange(value.trim());
                  setOpen(false);
                }
              }}
              className="flex w-full items-center gap-1 text-left px-2.5 py-1.5 text-xs font-medium text-brand-300 hover:bg-surface-800 border-t border-surface-800"
            >
              {creating ? <Loader2 className="w-3 h-3 animate-spin" /> : <Plus className="w-3 h-3" />}
              {onCreate ? `Crear «${value.trim()}»` : `Usar «${value.trim()}» (se crea al guardar)`}
            </button>
          )}
          {filtered.length === 0 && !q && (
            <p className="px-2.5 py-2 text-[11px] text-surface-500">Escribí para buscar en todos los proveedores.</p>
          )}
        </div>
      )}
    </div>
  );
}
