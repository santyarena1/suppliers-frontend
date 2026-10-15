"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, Plus } from "lucide-react";

const norm = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();

/**
 * Desplegable con buscador: elegís una de las opciones que ya existen (marcas o
 * categorías vigentes en NODO) o creás una nueva escribiéndola. Si escribís una
 * que ya existe con otras mayúsculas o acentos, se usa la existente.
 */
export default function ComboField({
  label,
  value,
  onChange,
  options,
  placeholder,
  maxLength = 120,
  newLabel = "Crear",
}: {
  label: string;
  value: string;
  onChange: (next: string) => void;
  options: { value: string; count?: number }[];
  placeholder?: string;
  maxLength?: number;
  newLabel?: string;
}) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState(value);
  const [cursor, setCursor] = useState(0);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => setQuery(value), [value]);
  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const q = norm(query);
  const filtered = useMemo(() => {
    const list = q ? options.filter((o) => norm(o.value).includes(q)) : options;
    return list.slice(0, 50);
  }, [options, q]);
  const exact = options.find((o) => norm(o.value) === q);
  const canCreate = Boolean(q) && !exact;
  const rows: { value: string; count?: number; create?: boolean }[] = [
    ...filtered,
    ...(canCreate ? [{ value: query.trim(), create: true }] : []),
  ];

  function pick(next: string) {
    // Una que ya existe escrita distinto: se usa como está en NODO (así no se duplican marcas).
    const known = options.find((o) => norm(o.value) === norm(next));
    const final = (known?.value ?? next).replace(/\s+/g, " ").trim().slice(0, maxLength);
    onChange(final);
    setQuery(final);
    setOpen(false);
  }

  return (
    <div ref={box} className="relative flex flex-col gap-1 text-[11px] text-surface-400">
      <label htmlFor={id}>{label}</label>
      <div className="relative">
        <input
          id={id}
          role="combobox"
          aria-expanded={open}
          aria-controls={`${id}-list`}
          aria-autocomplete="list"
          autoComplete="off"
          value={query}
          maxLength={maxLength}
          placeholder={placeholder}
          onFocus={() => setOpen(true)}
          onChange={(e) => {
            setQuery(e.target.value);
            onChange(e.target.value);
            setOpen(true);
            setCursor(0);
          }}
          onBlur={() => {
            // Al salir, si coincide con una existente, queda la existente.
            if (exact && exact.value !== query) pick(exact.value);
          }}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setOpen(true);
              setCursor((c) => Math.min(rows.length - 1, c + 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setCursor((c) => Math.max(0, c - 1));
            } else if (e.key === "Enter" && open && rows[cursor]) {
              e.preventDefault();
              pick(rows[cursor].value);
            } else if (e.key === "Escape") {
              setOpen(false);
            }
          }}
          className="w-full rounded-lg border border-surface-700 bg-surface-950 px-3 py-2 pr-8 text-sm text-white placeholder:text-surface-600 focus:border-brand-500 focus:outline-none"
        />
        <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-surface-500" aria-hidden />
      </div>
      {open && rows.length > 0 && (
        <ul
          id={`${id}-list`}
          role="listbox"
          className="absolute left-0 right-0 top-full z-30 mt-1 max-h-60 overflow-y-auto rounded-lg border border-surface-700 bg-surface-900 py-1 shadow-xl"
        >
          {rows.map((r, i) => (
            <li
              key={`${r.create ? "+" : ""}${r.value}`}
              role="option"
              aria-selected={i === cursor}
              onMouseDown={(e) => {
                e.preventDefault();
                pick(r.value);
              }}
              onMouseEnter={() => setCursor(i)}
              className={`flex cursor-pointer items-center gap-2 px-3 py-1.5 text-xs ${i === cursor ? "bg-surface-800 text-white" : "text-surface-200"}`}
            >
              {r.create ? (
                <>
                  <Plus className="h-3.5 w-3.5 text-brand-300" aria-hidden />
                  <span>
                    {newLabel} «<b>{r.value}</b>»
                  </span>
                </>
              ) : (
                <>
                  {norm(r.value) === norm(value) ? <Check className="h-3.5 w-3.5 text-brand-300" aria-hidden /> : <span className="w-3.5" />}
                  <span className="flex-1 truncate">{r.value}</span>
                  {r.count != null && <span className="text-[10px] text-surface-500">{r.count}</span>}
                </>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
