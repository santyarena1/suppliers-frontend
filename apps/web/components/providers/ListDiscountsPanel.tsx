"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { invalidateMyProviders, retailSuppliersApi, type ListDiscountKind, type ListDiscounts } from "@/lib/api";
import { apiError } from "@/lib/storefront";

type RuleRow = { kind: ListDiscountKind; label: string; percent: string };

const KIND_LABEL: Record<ListDiscountKind, string> = { BRAND: "Marca", CATEGORY: "Categoría" };

/**
 * Descuentos sobre la lista de un proveedor por lista o un local: uno general y
 * los que quieras por marca o categoría. Gana el más específico (marca, después
 * categoría, después el general). Se aplican al leer: cambiarlos no toca la lista.
 */
export default function ListDiscountsPanel({ provider }: { provider: string }) {
  const [data, setData] = useState<ListDiscounts | null>(null);
  const [general, setGeneral] = useState("");
  const [rows, setRows] = useState<RuleRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  function fill(d: ListDiscounts) {
    setData(d);
    setGeneral(d.general == null ? "" : String(d.general));
    setRows(d.rules.map((r) => ({ kind: r.kind, label: r.label, percent: String(r.percent) })));
  }

  useEffect(() => {
    setLoading(true);
    retailSuppliersApi
      .discounts(provider)
      .then((res) => fill(res.data))
      .catch((err) => setError(apiError(err, "No se pudieron cargar los descuentos")))
      .finally(() => setLoading(false));
  }, [provider]);

  const options = useMemo(
    () => ({ BRAND: data?.brands ?? [], CATEGORY: data?.categories ?? [] }),
    [data]
  );

  function update(i: number, patch: Partial<RuleRow>) {
    setSaved(false);
    setRows((prev) => prev.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  }

  async function save() {
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const parsed = rows
        .filter((r) => r.label.trim() && r.percent.trim() !== "")
        .map((r) => ({ kind: r.kind, label: r.label.trim(), percent: toNumber(r.percent) }));
      if (parsed.some((r) => r.percent == null)) throw new Error("Revisá los porcentajes: tienen que ser números entre 0 y 90.");
      const g = general.trim() === "" ? null : toNumber(general);
      if (general.trim() !== "" && g == null) throw new Error("El descuento general tiene que ser un número entre 0 y 90.");
      const res = await retailSuppliersApi.setDiscounts(provider, {
        general: g,
        rules: parsed.map((r) => ({ ...r, percent: r.percent as number })),
      });
      fill(res.data);
      invalidateMyProviders();
      setSaved(true);
    } catch (err) {
      setError(apiError(err, "No se pudieron guardar los descuentos"));
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center py-10">
        <Loader2 className="w-5 h-5 animate-spin text-surface-500" />
      </div>
    );
  }
  if (!data) return <p className="text-sm text-surface-400 py-6">{error ?? "No hay descuentos para este proveedor."}</p>;

  return (
    <div className="max-w-2xl flex flex-col gap-5">
      <div>
        <h2 className="text-sm font-semibold text-white">Descuentos sobre su lista</h2>
        <p className="text-xs text-surface-400 mt-1">
          Tu costo es el precio de su lista menos el descuento. Si un producto entra en varias reglas, gana la de su
          marca; si no tiene, la de su categoría; si no, el general.
        </p>
      </div>

      <label className="flex items-center gap-3">
        <span className="text-sm text-surface-200 w-40">Descuento general</span>
        <PercentInput value={general} onChange={(v) => { setGeneral(v); setSaved(false); }} />
      </label>

      <div className="flex flex-col gap-2">
        <p className="text-sm text-surface-200">Por marca o categoría</p>
        {rows.length === 0 && <p className="text-xs text-surface-500">Sin reglas: se aplica solo el general.</p>}
        {rows.map((r, i) => (
          <div key={i} className="flex flex-wrap items-center gap-2">
            <select
              value={r.kind}
              onChange={(e) => update(i, { kind: e.target.value as ListDiscountKind })}
              className="bg-surface-800 border border-surface-700 rounded-lg px-2 py-2 text-sm text-white focus:outline-none focus:border-brand-500"
            >
              <option value="BRAND">{KIND_LABEL.BRAND}</option>
              <option value="CATEGORY">{KIND_LABEL.CATEGORY}</option>
            </select>
            <input
              value={r.label}
              onChange={(e) => update(i, { label: e.target.value })}
              list={`list-discount-${r.kind}`}
              placeholder={r.kind === "BRAND" ? "Ej.: Logitech" : "Ej.: Placas de video"}
              className="flex-1 min-w-[10rem] bg-surface-800 border border-surface-700 rounded-lg px-3 py-2 text-sm text-white placeholder-surface-500 focus:outline-none focus:border-brand-500"
            />
            <PercentInput value={r.percent} onChange={(v) => update(i, { percent: v })} />
            <button
              type="button"
              onClick={() => { setRows((prev) => prev.filter((_, j) => j !== i)); setSaved(false); }}
              aria-label="Quitar regla"
              className="p-2 text-surface-500 hover:text-red-400"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        ))}
        <datalist id="list-discount-BRAND">
          {options.BRAND.map((o) => <option key={o.label} value={o.label}>{`${o.products} productos`}</option>)}
        </datalist>
        <datalist id="list-discount-CATEGORY">
          {options.CATEGORY.map((o) => <option key={o.label} value={o.label}>{`${o.products} productos`}</option>)}
        </datalist>
        <button
          type="button"
          onClick={() => setRows((prev) => [...prev, { kind: "BRAND", label: "", percent: "" }])}
          className="self-start flex items-center gap-1.5 text-xs text-brand-400 hover:text-brand-300 mt-1"
        >
          <Plus className="w-3.5 h-3.5" /> Agregar regla
        </button>
      </div>

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => void save()}
          disabled={saving}
          className="flex items-center gap-1.5 text-sm font-medium bg-brand-600 hover:bg-brand-500 text-white rounded-lg px-4 py-2 disabled:opacity-50"
        >
          {saving && <Loader2 className="w-4 h-4 animate-spin" />} Guardar descuentos
        </button>
        {saved && <span className="text-xs text-emerald-400">Guardado. Los precios ya se ven con estos descuentos.</span>}
        {error && <span className="text-xs text-red-400">{error}</span>}
      </div>
    </div>
  );
}

function PercentInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex items-center gap-1">
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        inputMode="decimal"
        placeholder="0"
        className="w-20 bg-surface-800 border border-surface-700 rounded-lg px-3 py-2 text-sm text-white text-right placeholder-surface-500 focus:outline-none focus:border-brand-500"
      />
      <span className="text-sm text-surface-400">%</span>
    </div>
  );
}

function toNumber(v: string): number | null {
  const n = Number(v.replace(",", "."));
  return Number.isFinite(n) && n >= 0 && n <= 90 ? n : null;
}
