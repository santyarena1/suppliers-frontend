"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, X } from "lucide-react";

export type SearchFilterOption = {
  value: string;
  label: string;
  count?: number;
};

type Props = {
  label: string;
  options: SearchFilterOption[];
  selected: Set<string>;
  onToggle: (value: string) => void;
  onClear?: () => void;
  onSelectAll?: () => void;
  /** Si true, “ninguno seleccionado” se muestra como vacío; si hay onSelectAll, “todos” = sin filtro activo. */
  emptyText?: string;
  className?: string;
};

function compareLabel(a: string, b: string) {
  return a.localeCompare(b, "es", { sensitivity: "base" });
}

export default function SearchFilterDropdown({
  label,
  options,
  selected,
  onToggle,
  onClear,
  onSelectAll,
  emptyText = "Sin opciones",
  className = "",
}: Props) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const listId = useId();

  const sorted = useMemo(
    () => [...options].sort((a, b) => compareLabel(a.label, b.label)),
    [options]
  );

  const allSelected = sorted.length > 0 && sorted.every((o) => selected.has(o.value));
  const noneSelected = selected.size === 0;

  const summary = useMemo(() => {
    if (noneSelected) return label;
    if (allSelected && onSelectAll) return `Todos · ${label}`;
    if (selected.size === 1) {
      const only = sorted.find((o) => selected.has(o.value));
      return only?.label ?? label;
    }
    return `${selected.size} ${label.toLowerCase()}`;
  }, [allSelected, label, noneSelected, onSelectAll, selected, sorted]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const active = !noneSelected && !(allSelected && onSelectAll);

  return (
    <div ref={rootRef} className={`relative min-w-0 flex-1 ${className}`}>
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => setOpen((v) => !v)}
        className={`w-full flex items-center gap-2 rounded-lg border px-3 py-2 text-left text-xs transition-colors ${
          active
            ? "border-brand-500/60 bg-brand-600/10 text-brand-200"
            : "border-surface-700 bg-surface-900 text-surface-300 hover:border-surface-500 hover:text-surface-100"
        }`}
      >
        <span className="min-w-0 flex-1 truncate font-medium">{summary}</span>
        {active && onClear ? (
          <span
            role="button"
            tabIndex={0}
            title={`Limpiar ${label.toLowerCase()}`}
            className="flex-shrink-0 rounded p-0.5 text-surface-400 hover:bg-white/10 hover:text-white"
            onClick={(e) => {
              e.stopPropagation();
              onClear();
              setOpen(false);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                e.stopPropagation();
                onClear();
                setOpen(false);
              }
            }}
          >
            <X className="h-3.5 w-3.5" />
          </span>
        ) : (
          <ChevronDown className={`h-3.5 w-3.5 flex-shrink-0 text-surface-500 transition-transform ${open ? "rotate-180" : ""}`} />
        )}
      </button>

      {open && (
        <div
          id={listId}
          role="listbox"
          aria-multiselectable="true"
          className="absolute left-0 right-0 z-30 mt-1 max-h-64 overflow-hidden rounded-lg border border-surface-700 bg-surface-900 shadow-xl"
        >
          {(onSelectAll || onClear) && (
            <div className="flex items-center justify-between gap-2 border-b border-surface-800 px-2.5 py-1.5">
              {onSelectAll ? (
                <button
                  type="button"
                  onClick={() => onSelectAll()}
                  className="text-[11px] text-surface-400 hover:text-white"
                >
                  Todos
                </button>
              ) : (
                <span />
              )}
              {onClear ? (
                <button
                  type="button"
                  onClick={() => {
                    onClear();
                  }}
                  className="text-[11px] text-surface-400 hover:text-white"
                >
                  Ninguno
                </button>
              ) : null}
            </div>
          )}
          <ul className="max-h-52 overflow-y-auto py-1">
            {sorted.length === 0 ? (
              <li className="px-3 py-2 text-xs text-surface-500">{emptyText}</li>
            ) : (
              sorted.map((opt) => {
                const checked = selected.has(opt.value);
                return (
                  <li key={opt.value}>
                    <button
                      type="button"
                      role="option"
                      aria-selected={checked}
                      onClick={() => onToggle(opt.value)}
                      className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs transition-colors ${
                        checked
                          ? "bg-brand-600/10 text-brand-200"
                          : "text-surface-300 hover:bg-surface-800 hover:text-white"
                      }`}
                    >
                      <span
                        className={`flex h-3.5 w-3.5 flex-shrink-0 items-center justify-center rounded border ${
                          checked
                            ? "border-brand-400 bg-brand-500 text-white"
                            : "border-surface-600"
                        }`}
                      >
                        {checked ? <Check className="h-2.5 w-2.5" strokeWidth={3} /> : null}
                      </span>
                      <span className="min-w-0 flex-1 truncate">{opt.label}</span>
                      {typeof opt.count === "number" ? (
                        <span className="flex-shrink-0 tabular-nums text-[10px] text-surface-500">
                          {opt.count}
                        </span>
                      ) : null}
                    </button>
                  </li>
                );
              })
            )}
          </ul>
        </div>
      )}
    </div>
  );
}
