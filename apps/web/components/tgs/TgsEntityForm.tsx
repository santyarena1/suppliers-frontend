"use client";

import { useState } from "react";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { TgsButton, TgsInput, TgsSelect } from "@/components/tgs/TgsUi";
import { tgsErr } from "@/components/tgs/tgs-format";
import {
  emptyLine,
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
  submitLabel,
  onSubmit,
}: {
  fields: TgsField[];
  initial?: Record<string, unknown> | null;
  extra?: Record<string, unknown>;
  withLines?: boolean;
  submitLabel: string;
  onSubmit: (body: Record<string, unknown>) => Promise<void>;
}) {
  const [values, setValues] = useState<Record<string, string | boolean>>(() => valuesFromRecord(fields, initial));
  const [lines, setLines] = useState<TgsDraftLine[]>([emptyLine()]);
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
        .filter((line) => line.descripcion.trim() || line.producto_id.trim())
        .map((line) => ({
          ...(line.producto_id.trim() ? { producto_id: Number(line.producto_id) } : {}),
          descripcion: line.descripcion.trim(),
          cantidad: Number(line.cantidad.replace(",", ".")) || 1,
          precio_unitario: Number(line.precio_unitario.replace(",", ".")) || 0,
        }));
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
    <form onSubmit={submit} className="max-w-lg flex flex-col gap-3">
      {fields.map((field) => (
        <Field key={field.name} field={field} value={values[field.name]} onChange={setField} />
      ))}
      {withLines && (
        <div className="flex flex-col gap-2">
          <p className="text-[10px] uppercase tracking-wide text-surface-500">Ítems</p>
          {lines.map((line, idx) => (
            <div key={idx} className="grid grid-cols-12 gap-2 items-end">
              <label className="col-span-5 flex flex-col gap-1 text-xs text-surface-400">
                Producto
                <TgsInput
                  value={line.descripcion}
                  onChange={(e) => setLines((prev) => prev.map((row, i) => (i === idx ? { ...row, descripcion: e.target.value } : row)))}
                  required={idx === 0}
                />
              </label>
              <label className="col-span-2 flex flex-col gap-1 text-xs text-surface-400">
                Id
                <TgsInput
                  value={line.producto_id}
                  onChange={(e) => setLines((prev) => prev.map((row, i) => (i === idx ? { ...row, producto_id: e.target.value } : row)))}
                  inputMode="numeric"
                />
              </label>
              <label className="col-span-2 flex flex-col gap-1 text-xs text-surface-400">
                Cant
                <TgsInput
                  value={line.cantidad}
                  onChange={(e) => setLines((prev) => prev.map((row, i) => (i === idx ? { ...row, cantidad: e.target.value } : row)))}
                  inputMode="decimal"
                />
              </label>
              <label className="col-span-2 flex flex-col gap-1 text-xs text-surface-400">
                Precio
                <TgsInput
                  value={line.precio_unitario}
                  onChange={(e) =>
                    setLines((prev) => prev.map((row, i) => (i === idx ? { ...row, precio_unitario: e.target.value } : row)))
                  }
                  inputMode="decimal"
                />
              </label>
              <button
                type="button"
                className="col-span-1 h-9 text-surface-500 hover:text-red-400"
                onClick={() => setLines((prev) => (prev.length === 1 ? [emptyLine()] : prev.filter((_, i) => i !== idx)))}
                aria-label="Quitar ítem"
              >
                <Trash2 className="w-4 h-4 mx-auto" />
              </button>
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
      <label className="flex items-center gap-2 text-sm text-surface-300">
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
      {field.type === "textarea" ? (
        <textarea
          required={field.required}
          value={String(value ?? "")}
          onChange={(e) => onChange(field.name, e.target.value)}
          rows={3}
          className="bg-surface-800 border border-surface-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-brand-500"
        />
      ) : field.type === "select" ? (
        <TgsSelect
          required={field.required}
          value={String(value ?? "")}
          onChange={(e) => onChange(field.name, e.target.value)}
        >
          <option value="">Elegir…</option>
          {field.options?.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </TgsSelect>
      ) : (
        <TgsInput
          required={field.required}
          value={String(value ?? "")}
          onChange={(e) => onChange(field.name, e.target.value)}
          inputMode={field.type === "number" ? "decimal" : undefined}
          placeholder={field.placeholder}
        />
      )}
    </label>
  );
}
