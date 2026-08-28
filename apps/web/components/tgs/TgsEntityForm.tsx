"use client";

import { useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { TgsButton, TgsInput, TgsSelect } from "@/components/tgs/TgsUi";
import { tgsErr } from "@/components/tgs/tgs-format";
import {
  emptyLine,
  LINE_FIELDS,
  linesFromItems,
  payloadFromLine,
  payloadFromValues,
  valuesFromRecord,
  type TgsDraftLine,
  type TgsField,
} from "@/lib/tgs-forms";

export default function TgsEntityForm({
  fields,
  initial,
  extra,
  withLines,
  linesHint,
  submitLabel,
  onSubmit,
}: {
  fields: TgsField[];
  initial?: Record<string, unknown> | null;
  extra?: Record<string, unknown>;
  withLines?: boolean;
  linesHint?: ReactNode;
  submitLabel: string;
  onSubmit: (body: Record<string, unknown>) => Promise<void>;
}) {
  const sections = useMemo(() => groupFields(fields), [fields]);
  const [values, setValues] = useState<Record<string, string | boolean>>(() => valuesFromRecord(fields, initial));
  const [lines, setLines] = useState<TgsDraftLine[]>(() => linesFromItems(initial?.items));
  const [saving, setSaving] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);

  function setField(name: string, value: string | boolean) {
    setValues((prev) => ({ ...prev, [name]: value }));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setAviso(null);
    const body = payloadFromValues(fields, values, extra);
    if (withLines) {
      const items = lines
        .filter((line) => line.descripcion?.trim() || line.producto_id?.trim())
        .map(payloadFromLine);
      if (!items.length) {
        setAviso("Agregá al menos un ítem");
        setSaving(false);
        return;
      }
      body.items = items;
    }
    try {
      await onSubmit(body);
    } catch (err) {
      setAviso(tgsErr(err, "No se pudo guardar en AcuStock"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} className="w-full flex flex-col gap-5">
      {sections.map((section) => (
        <fieldset key={section.title || "campos"} className="flex flex-col gap-3">
          {section.title && (
            <legend className="text-[10px] uppercase tracking-wide text-surface-500 px-0.5">{section.title}</legend>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {section.fields.map((field) => (
              <div key={field.name} className={field.type === "textarea" ? "sm:col-span-2 lg:col-span-3" : undefined}>
                <Field field={field} value={values[field.name]} onChange={setField} />
              </div>
            ))}
          </div>
        </fieldset>
      ))}
      {withLines && (
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-[10px] uppercase tracking-wide text-surface-500">Ítems</p>
            <div className="flex flex-wrap gap-2">
              {linesHint}
              <Link href="/sistema-tgs/stock/nuevo" className="text-[11px] text-brand-400 hover:text-brand-300">
                + Crear producto
              </Link>
            </div>
          </div>
          {lines.map((line, idx) => (
            <div key={idx} className="border border-surface-800 rounded-xl bg-surface-900/40 p-3 flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <p className="text-[11px] text-surface-500">Ítem {idx + 1}</p>
                <button
                  type="button"
                  className="text-surface-500 hover:text-red-400"
                  onClick={() => setLines((prev) => (prev.length === 1 ? [emptyLine()] : prev.filter((_, i) => i !== idx)))}
                  aria-label="Quitar ítem"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-2">
                {LINE_FIELDS.map((field) => (
                  <div key={field.name} className={field.name === "descripcion" ? "col-span-2 md:col-span-4 lg:col-span-3" : undefined}>
                    <LineField
                      field={field}
                      value={line[field.name]}
                      onChange={(value) =>
                        setLines((prev) => prev.map((row, i) => (i === idx ? { ...row, [field.name]: value } : row)))
                      }
                      required={Boolean(field.required && idx === 0)}
                    />
                  </div>
                ))}
              </div>
            </div>
          ))}
          <TgsButton type="button" tone="ghost" onClick={() => setLines((prev) => [...prev, emptyLine()])}>
            <Plus className="w-3.5 h-3.5" />
            Ítem
          </TgsButton>
        </div>
      )}
      {aviso && <p className="text-xs text-red-400">{aviso}</p>}
      <div className="flex justify-end">
        <TgsButton type="submit" disabled={saving}>
          {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
          {submitLabel}
        </TgsButton>
      </div>
    </form>
  );
}

function groupFields(fields: TgsField[]) {
  const order: string[] = [];
  const map = new Map<string, TgsField[]>();
  for (const field of fields) {
    const title = field.section ?? "";
    if (!map.has(title)) {
      map.set(title, []);
      order.push(title);
    }
    map.get(title)!.push(field);
  }
  return order.map((title) => ({ title, fields: map.get(title)! }));
}

function Field({
  field,
  value,
  onChange,
}: {
  field: TgsField;
  value: string | boolean | undefined;
  onChange: (name: string, value: string | boolean) => void;
}) {
  if (field.type === "checkbox") {
    return (
      <label className="flex items-center gap-2 text-sm text-surface-300 h-full min-h-9">
        <input
          type="checkbox"
          checked={Boolean(value)}
          onChange={(e) => onChange(field.name, e.target.checked)}
          className="rounded border-surface-600"
        />
        {field.label}
      </label>
    );
  }
  return (
    <label className="flex flex-col gap-1 text-xs text-surface-400">
      {field.label}
      <Control field={field} value={String(value ?? "")} onChange={(next) => onChange(field.name, next)} />
    </label>
  );
}

function LineField({
  field,
  value,
  onChange,
  required,
}: {
  field: TgsField;
  value: string | undefined;
  onChange: (value: string) => void;
  required?: boolean;
}) {
  if (field.type === "checkbox") {
    return (
      <label className="flex items-center gap-2 text-xs text-surface-300 h-full min-h-9">
        <input
          type="checkbox"
          checked={value === "true" || value === "1"}
          onChange={(e) => onChange(e.target.checked ? "true" : "")}
          className="rounded border-surface-600"
        />
        {field.label}
      </label>
    );
  }
  return (
    <label className="flex flex-col gap-1 text-[11px] text-surface-400">
      {field.label}
      <Control field={field} value={value ?? ""} onChange={onChange} required={required} compact />
    </label>
  );
}

function Control({
  field,
  value,
  onChange,
  required,
  compact,
}: {
  field: TgsField;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  compact?: boolean;
}) {
  const cls = compact ? "px-2 py-1.5 text-xs" : undefined;
  if (field.type === "textarea") {
    return (
      <textarea
        required={required ?? field.required}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={3}
        placeholder={field.placeholder}
        className="bg-surface-800 border border-surface-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-brand-500"
      />
    );
  }
  if (field.type === "select") {
    return (
      <TgsSelect
        required={required ?? field.required}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={cls}
      >
        <option value="">Elegir…</option>
        {field.options?.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </TgsSelect>
    );
  }
  const inputType = field.type === "datetime" ? "datetime-local" : field.type === "date" ? "date" : "text";
  return (
    <TgsInput
      type={inputType}
      required={required ?? field.required}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      inputMode={field.type === "number" ? "decimal" : undefined}
      placeholder={field.placeholder}
      className={cls}
    />
  );
}
