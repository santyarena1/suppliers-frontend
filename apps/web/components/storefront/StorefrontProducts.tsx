"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, Check, FileSpreadsheet, Loader2, Pencil, Plus, Search, Trash2, X } from "lucide-react";
import ListImportsPanel from "@/components/list-import/ListImportsPanel";
import { storefrontApi, type Provider, type StorefrontProduct, type StorefrontProductInput } from "@/lib/api";
import { apiError, money } from "@/lib/storefront";

const IVA_OPTIONS = [21, 10.5, 27, 0];

const inputCls =
  "w-full rounded-lg border border-surface-700 bg-surface-950 px-3 py-2 text-sm text-white placeholder:text-surface-600 focus:border-brand-500 focus:outline-none";

/**
 * Número escrito a la argentina o no: "1.500,50", "1500,5", "12.50", "12.500".
 * Con coma, la coma es decimal. Sin coma, puntos que separan grupos de 3
 * dígitos son de miles; si no, el punto es decimal.
 */
function parseNum(value: string): number | null {
  let v = value.trim().replace(/\s/g, "").replace(/^(US)?\$/i, "");
  if (!v) return null;
  if (v.includes(",")) v = v.replace(/\./g, "").replace(",", ".");
  else if (/^\d{1,3}(\.\d{3})+$/.test(v)) v = v.replace(/\./g, "");
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/** Catálogo de la tienda: planilla, alta manual y edición rápida de precio y stock. */
export default function StorefrontProducts({ provider, onChanged }: { provider: Provider; onChanged: () => void }) {
  const [items, setItems] = useState<StorefrontProduct[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [mode, setMode] = useState<"list" | "add" | "excel">("list");
  const [aviso, setAviso] = useState<{ ok: boolean; text: string } | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await storefrontApi.products();
      setItems(res.data.items);
      setTotal(res.data.total);
    } catch (err) {
      setAviso({ ok: false, text: apiError(err, "No se pudieron cargar tus productos") });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return items;
    return items.filter((p) => [p.name, p.brand, p.sku, p.category].filter(Boolean).join(" ").toLowerCase().includes(needle));
  }, [items, q]);
  const manualCount = items.filter((p) => p.manual).length;

  async function refresh(text?: string) {
    await load();
    onChanged();
    if (text) setAviso({ ok: true, text });
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setMode(mode === "excel" ? "list" : "excel")}
          className={`inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold ${
            mode === "excel" ? "bg-surface-800 text-white" : "bg-brand-600 text-white hover:bg-brand-500"
          }`}
        >
          <FileSpreadsheet className="h-4 w-4" /> Subir planilla
        </button>
        <button
          type="button"
          onClick={() => setMode(mode === "add" ? "list" : "add")}
          className={`inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-semibold ${
            mode === "add" ? "border-surface-600 bg-surface-800 text-white" : "border-surface-700 text-surface-100 hover:border-surface-500"
          }`}
        >
          <Plus className="h-4 w-4" /> Cargar un producto
        </button>
        <span className="ml-auto text-xs text-surface-500">{total} productos publicados</span>
      </div>

      {aviso && (
        <p className={`rounded-md px-3 py-2 text-xs ${aviso.ok ? "bg-emerald-500/10 text-emerald-300" : "bg-red-500/10 text-red-300"}`}>{aviso.text}</p>
      )}

      {mode === "excel" && (
        <section className="flex flex-col gap-3 rounded-2xl border border-surface-800 bg-surface-900 p-5">
          <div>
            <h3 className="text-sm font-semibold text-white">Tu planilla, tal cual la tenés</h3>
            <p className="mt-1 text-xs leading-relaxed text-surface-400">
              Excel o CSV con código, nombre, marca, precio y stock. La primera vez NODO te propone qué columna es cada dato y lo
              confirmás; después lo recuerda. Las marcas que traigas (aunque sean propias) quedan como filtro en el buscador.
            </p>
            <p className="mt-2 flex items-start gap-2 rounded-lg border border-amber-500/25 bg-amber-500/5 px-3 py-2 text-xs text-amber-100">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" aria-hidden />
              La planilla es tu catálogo completo: lo que no venga deja de publicarse
              {manualCount > 0 ? `, incluidos los ${manualCount} productos que cargaste a mano` : ""}. Subirla también confirma tu
              stock.
            </p>
          </div>
          <ListImportsPanel provider={provider} uploadsAsBase basePath="/vender" hideCadence onApplied={() => void refresh("Planilla aplicada.")} />
        </section>
      )}

      {mode === "add" && (
        <ProductForm
          onCancel={() => setMode("list")}
          onSaved={async () => {
            setMode("list");
            await refresh("Producto publicado.");
          }}
        />
      )}

      <section className="rounded-2xl border border-surface-800 bg-surface-900">
        <div className="flex items-center gap-2 border-b border-surface-800 px-4 py-3">
          <Search className="h-4 w-4 text-surface-500" aria-hidden />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar en tu tienda"
            className="flex-1 bg-transparent text-sm text-white placeholder:text-surface-600 focus:outline-none"
          />
        </div>
        {loading ? (
          <div className="flex justify-center py-10">
            <Loader2 className="h-5 w-5 animate-spin text-brand-500" />
          </div>
        ) : items.length === 0 ? (
          <div className="px-6 py-10 text-center">
            <p className="text-sm font-semibold text-white">Todavía no publicaste productos</p>
            <p className="mt-1 text-xs text-surface-400">Subí tu planilla o cargá un producto para empezar.</p>
          </div>
        ) : filtered.length === 0 ? (
          <p className="px-6 py-8 text-center text-sm text-surface-400">Nada coincide con “{q}”.</p>
        ) : (
          <ul className="divide-y divide-surface-800">
            {filtered.map((p) => (
              <ProductRow key={p.externalId} product={p} onSaved={() => void refresh()} onError={(text) => setAviso({ ok: false, text })} />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function ProductRow({ product, onSaved, onError }: { product: StorefrontProduct; onSaved: () => void; onError: (t: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [price, setPrice] = useState("");
  const [stock, setStock] = useState("");
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  function startEdit() {
    setPrice(product.price != null ? String(product.price).replace(".", ",") : "");
    setStock(product.stock != null ? String(product.stock) : "");
    setEditing(true);
  }

  async function save() {
    const p = parseNum(price);
    const s = parseNum(stock);
    if (p == null || p <= 0) return onError("Poné un precio mayor a 0");
    if (s == null || s < 0 || !Number.isInteger(s)) return onError("El stock tiene que ser un número entero");
    setSaving(true);
    try {
      await storefrontApi.updateProduct(product.externalId, { price: p, stock: s });
      setEditing(false);
      onSaved();
    } catch (err) {
      onError(apiError(err, "No se pudo guardar"));
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    setSaving(true);
    try {
      await storefrontApi.removeProduct(product.externalId);
      onSaved();
    } catch (err) {
      onError(apiError(err, "No se pudo quitar"));
    } finally {
      setSaving(false);
      setConfirmDelete(false);
    }
  }

  return (
    <li className="flex flex-wrap items-center gap-3 px-4 py-3">
      <div className="min-w-0 flex-1 basis-60">
        <p className="truncate text-sm text-white" title={product.name}>
          {product.name}
        </p>
        <p className="truncate text-[11px] text-surface-500">
          {[product.brand, product.sku, product.category].filter(Boolean).join(" · ") || "Sin marca ni código"}
          {product.manual && <span className="ml-1.5 text-surface-400">· cargado a mano</span>}
        </p>
      </div>
      {editing ? (
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-1.5 text-[11px] text-surface-400">
            Neto {product.currency === "ARS" ? "$" : "US$"}
            <input value={price} onChange={(e) => setPrice(e.target.value)} inputMode="decimal" className={`${inputCls} w-28 py-1.5`} />
          </label>
          <label className="flex items-center gap-1.5 text-[11px] text-surface-400">
            Stock
            <input value={stock} onChange={(e) => setStock(e.target.value)} inputMode="numeric" className={`${inputCls} w-20 py-1.5`} />
          </label>
          <button
            type="button"
            onClick={() => void save()}
            disabled={saving}
            aria-label="Guardar"
            className="grid h-8 w-8 place-items-center rounded-lg bg-brand-600 text-white hover:bg-brand-500 disabled:opacity-50"
          >
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
          </button>
          <button
            type="button"
            onClick={() => setEditing(false)}
            aria-label="Cancelar"
            className="grid h-8 w-8 place-items-center rounded-lg border border-surface-700 text-surface-300 hover:text-white"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ) : (
        <div className="flex items-center gap-4">
          <div className="text-right">
            <p className="text-sm font-semibold tabular-nums text-white">{money(product.price, product.currency)}</p>
            <p className="text-[10px] text-surface-500">neto · IVA {product.ivaPercent ?? 21}%</p>
          </div>
          <div className="w-16 text-right">
            <p className={`text-sm font-semibold tabular-nums ${product.stock === 0 ? "text-amber-300" : "text-white"}`}>
              {product.stock ?? "—"}
            </p>
            <p className="text-[10px] text-surface-500">stock</p>
          </div>
          {confirmDelete ? (
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => void remove()}
                disabled={saving}
                className="rounded-lg bg-red-600/80 px-2.5 py-1.5 text-[11px] font-semibold text-white hover:bg-red-600 disabled:opacity-50"
              >
                Quitar
              </button>
              <button type="button" onClick={() => setConfirmDelete(false)} className="text-[11px] text-surface-400 hover:text-white">
                No
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={startEdit}
                aria-label={`Editar ${product.name}`}
                className="grid h-8 w-8 place-items-center rounded-lg text-surface-400 hover:bg-surface-800 hover:text-white"
              >
                <Pencil className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={() => setConfirmDelete(true)}
                aria-label={`Quitar ${product.name}`}
                className="grid h-8 w-8 place-items-center rounded-lg text-surface-400 hover:bg-surface-800 hover:text-red-300"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          )}
        </div>
      )}
    </li>
  );
}

function ProductForm({ onCancel, onSaved }: { onCancel: () => void; onSaved: () => Promise<void> }) {
  const [form, setForm] = useState({ name: "", brand: "", category: "", sku: "", price: "", currency: "USD", iva: "21", stock: "1" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (key: keyof typeof form) => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [key]: e.target.value }));

  async function submit() {
    setError(null);
    const price = parseNum(form.price);
    const stock = parseNum(form.stock);
    if (!form.name.trim()) return setError("Poné el nombre del producto");
    if (price == null || price <= 0) return setError("Poné el precio neto (sin IVA), mayor a 0");
    if (stock == null || stock < 0 || !Number.isInteger(stock)) return setError("El stock tiene que ser un número entero");
    const body: StorefrontProductInput = {
      name: form.name.trim(),
      brand: form.brand.trim() || null,
      category: form.category.trim() || null,
      sku: form.sku.trim() || null,
      price,
      currency: form.currency === "ARS" ? "ARS" : "USD",
      ivaPercent: Number(form.iva),
      stock,
    };
    setSaving(true);
    try {
      await storefrontApi.addProduct(body);
      await onSaved();
    } catch (err) {
      setError(apiError(err, "No se pudo publicar el producto"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="rounded-2xl border border-surface-800 bg-surface-900 p-5">
      <h3 className="text-sm font-semibold text-white">Cargar un producto</h3>
      <p className="mt-1 text-xs text-surface-400">Queda publicado al toque para los demás comercios.</p>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <label className="sm:col-span-2 flex flex-col gap-1 text-[11px] text-surface-400">
          Nombre
          <input value={form.name} onChange={set("name")} maxLength={300} placeholder="Placa de video ASUS Dual RTX 5060 8GB" className={inputCls} />
        </label>
        <label className="flex flex-col gap-1 text-[11px] text-surface-400">
          Marca (puede ser propia)
          <input value={form.brand} onChange={set("brand")} maxLength={120} placeholder="ASUS" className={inputCls} />
        </label>
        <label className="flex flex-col gap-1 text-[11px] text-surface-400">
          Categoría
          <input value={form.category} onChange={set("category")} maxLength={120} placeholder="Placas de video" className={inputCls} />
        </label>
        <label className="flex flex-col gap-1 text-[11px] text-surface-400">
          Código / part number (opcional)
          <input value={form.sku} onChange={set("sku")} maxLength={120} className={inputCls} />
        </label>
        <label className="flex flex-col gap-1 text-[11px] text-surface-400">
          Stock
          <input value={form.stock} onChange={set("stock")} inputMode="numeric" className={inputCls} />
        </label>
        <label className="flex flex-col gap-1 text-[11px] text-surface-400">
          Precio neto, sin IVA
          <div className="flex gap-2">
            <select value={form.currency} onChange={set("currency")} className={`${inputCls} w-24`}>
              <option value="USD">US$</option>
              <option value="ARS">$</option>
            </select>
            <input value={form.price} onChange={set("price")} inputMode="decimal" placeholder="0,00" className={inputCls} />
          </div>
        </label>
        <label className="flex flex-col gap-1 text-[11px] text-surface-400">
          IVA
          <select value={form.iva} onChange={set("iva")} className={inputCls}>
            {IVA_OPTIONS.map((v) => (
              <option key={v} value={String(v)}>
                {v.toLocaleString("es-AR")}%
              </option>
            ))}
          </select>
        </label>
      </div>
      {error && <p className="mt-3 rounded-md bg-red-500/10 px-3 py-2 text-xs text-red-300">{error}</p>}
      <div className="mt-4 flex gap-2">
        <button
          type="button"
          onClick={() => void submit()}
          disabled={saving}
          className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-500 disabled:opacity-50"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
          Publicar
        </button>
        <button type="button" onClick={onCancel} className="rounded-lg border border-surface-700 px-4 py-2 text-sm text-surface-300 hover:text-white">
          Cancelar
        </button>
      </div>
    </section>
  );
}
