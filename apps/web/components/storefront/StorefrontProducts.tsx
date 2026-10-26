"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { isArsCurrency } from "@/lib/fx";
import { AlertTriangle, Check, FileSpreadsheet, ImageOff, Loader2, Pencil, Plus, Search, Sheet, SlidersHorizontal, Trash2, X } from "lucide-react";
import ListImportsPanel from "@/components/list-import/ListImportsPanel";
import ComboField from "@/components/storefront/ComboField";
import ImagePicker from "@/components/storefront/ImagePicker";
import StorefrontSheetCard from "@/components/storefront/StorefrontSheetCard";
import { warrantyOptions } from "@/components/storefront/warranty-options";
import { catalogApi, storefrontApi, type MyStorefront, type Provider, type StorefrontProduct, type StorefrontProductInput, type StorefrontSheet } from "@/lib/api";
import { proxyImg } from "@/lib/format";
import { apiError, money, PRODUCT_CONDITION_LABEL } from "@/lib/storefront";

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

type Option = { value: string; count?: number };
let catalogOptions: Promise<{ brands: Option[]; categories: Option[] }> | null = null;

/** Marcas y categorías vigentes en el catálogo que ve el comercio (se piden una vez). */
function loadCatalogOptions() {
  catalogOptions ??= Promise.all([catalogApi.brands().catch(() => ({ data: [] })), catalogApi.categories().catch(() => ({ data: [] }))])
    .then(([b, c]) => ({
      brands: (Array.isArray(b.data) ? b.data : []).map((x) => ({ value: x.brand, count: x.count })).filter((o) => o.value),
      categories: (Array.isArray(c.data) ? c.data : []).map((x) => ({ value: x.category, count: x.count })).filter((o) => o.value),
    }))
    .catch(() => {
      catalogOptions = null;
      return { brands: [], categories: [] };
    });
  return catalogOptions;
}

/** Une las opciones del catálogo con las que ya usa la tienda, sin repetir y de más a menos usadas. */
function mergeOptions(fromCatalog: Option[], own: (string | null)[]): Option[] {
  const map = new Map<string, Option>();
  const key = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
  for (const v of own) if (v) map.set(key(v), { value: v, count: (map.get(key(v))?.count ?? 0) + 1 });
  for (const o of fromCatalog) {
    const k = key(o.value);
    const prev = map.get(k);
    map.set(k, { value: prev?.value ?? o.value, count: (prev?.count ?? 0) + (o.count ?? 0) });
  }
  return [...map.values()].sort((a, b) => (b.count ?? 0) - (a.count ?? 0) || a.value.localeCompare(b.value, "es"));
}

/** Catálogo de la tienda: planilla, alta manual, ficha completa y edición rápida de precio y stock. */
export default function StorefrontProducts({
  provider,
  sellsOffline,
  defaultWarranty,
  sheet,
  productCount,
  inStockCount,
  onStoreChange,
  onChanged,
}: {
  provider: Provider;
  sellsOffline: boolean;
  defaultWarranty: string | null;
  sheet: StorefrontSheet | null;
  productCount: number;
  inStockCount: number;
  onStoreChange: (next: MyStorefront) => void;
  onChanged: () => void;
}) {
  const [importsKey, setImportsKey] = useState(0);
  const [items, setItems] = useState<StorefrontProduct[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [mode, setMode] = useState<"list" | "add" | "excel">(sheet ? "excel" : "list");
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
  const [catalog, setCatalog] = useState<{ brands: Option[]; categories: Option[] }>({ brands: [], categories: [] });
  useEffect(() => {
    void loadCatalogOptions().then(setCatalog);
  }, []);
  const options = useMemo(
    () => ({
      brands: mergeOptions(catalog.brands, items.map((p) => p.brand)),
      categories: mergeOptions(catalog.categories, items.map((p) => p.category)),
      warranties: warrantyOptions([...items.map((p) => p.warranty), defaultWarranty]),
    }),
    [catalog, items, defaultWarranty]
  );
  const withoutPhotos = items.filter((p) => p.images.length === 0).length;

  async function refresh(text?: string) {
    await load();
    onChanged();
    if (text) setAviso({ ok: true, text });
  }

  return (
    <div className="flex flex-col gap-4">
      {productCount === 0 && !sheet && mode === "list" ? (
        <ProductSourcePicker onPick={setMode} />
      ) : (
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setMode(mode === "excel" ? "list" : "excel")}
          className={`inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold ${
            mode === "excel" ? "bg-surface-800 text-white" : "bg-brand-600 text-white hover:bg-brand-500"
          }`}
        >
          <FileSpreadsheet className="h-4 w-4" /> Planilla o Google Sheets
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
        <span className="ml-auto text-xs text-surface-500">
          {total} publicados
          {productCount > 0 && (
            <span className={inStockCount === 0 ? "font-semibold text-amber-300" : ""}> · {inStockCount} con stock</span>
          )}
          {withoutPhotos > 0 && total > 0 ? ` · ${withoutPhotos} sin foto` : ""}
        </span>
      </div>
      )}

      {productCount > 0 && (
        <p className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[11px] leading-relaxed text-surface-500">
          <AlertTriangle className="h-3 w-3 text-surface-500" aria-hidden />
          Lo que tiene stock 0 queda cargado pero no lo ven los compradores.
          {sellsOffline ? " Si vendés algo en el local, bajá el stock acá o subí la planilla de nuevo." : ""}
          <Link href="/vender/listas/perfil" className="text-brand-300 underline-offset-2 hover:underline">
            ¿Sin precio o sin stock? Revisá qué columna es cada dato
          </Link>
        </p>
      )}

      {aviso && (
        <p className={`rounded-md px-3 py-2 text-xs ${aviso.ok ? "bg-emerald-500/10 text-emerald-300" : "bg-red-500/10 text-red-300"}`}>{aviso.text}</p>
      )}

      {mode === "excel" && (
        <StorefrontSheetCard sheet={sheet} onChange={onStoreChange} onImported={() => setImportsKey((k) => k + 1)} />
      )}

      {mode === "excel" && (
        <section className="flex flex-col gap-3 rounded-2xl border border-surface-800 bg-surface-900 p-5">
          <div>
            <h3 className="text-sm font-semibold text-white">Tu planilla, tal cual la tenés</h3>
            <p className="mt-1 text-xs leading-relaxed text-surface-400">
              Excel o CSV con código, nombre, marca, precio y stock. También puede traer descripción, garantía y un link de foto
              por producto. La primera vez NODO te propone qué columna es cada dato y lo confirmás; después lo recuerda. Las
              marcas que traigas (aunque sean propias) quedan como filtro en el buscador.
            </p>
            <p className="mt-2 flex items-start gap-2 rounded-lg border border-amber-500/25 bg-amber-500/5 px-3 py-2 text-xs text-amber-100">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" aria-hidden />
              <span>
                La planilla es tu catálogo completo: lo que no venga deja de publicarse
                {manualCount > 0 ? `, incluidos los ${manualCount} productos que cargaste a mano` : ""}. Las fotos que subiste en NODO
                se guardan: si el producto vuelve en otra planilla, vuelven con él. Subirla también confirma tu stock.
              </span>
            </p>
          </div>
          <ListImportsPanel
            key={importsKey}
            provider={provider}
            uploadsAsBase
            basePath="/vender"
            hideCadence
            onApplied={() => void refresh("Planilla aplicada.")}
          />
        </section>
      )}

      {mode === "add" && (
        <ProductForm
          defaultWarranty={defaultWarranty}
          options={options}
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
              <ProductRow
                key={p.externalId}
                product={p}
                defaultWarranty={defaultWarranty}
                options={options}
                onSaved={(text) => void refresh(text)}
                onError={(text) => setAviso({ ok: false, text })}
              />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

/** Tienda sin productos: las tres formas de cargarlos, cada una con lo que implica. Tocar una la abre. */
function ProductSourcePicker({ onPick }: { onPick: (mode: "excel" | "add") => void }) {
  const sources = [
    {
      key: "sheets",
      icon: Sheet,
      title: "Google Sheets",
      text: "Pegás el link de tu planilla y NODO la lee cada 15 minutos: lo que cambies ahí se actualiza solo.",
      tag: "Recomendado",
      mode: "excel" as const,
    },
    {
      key: "excel",
      icon: FileSpreadsheet,
      title: "Excel o CSV",
      text: "Lo subís cada vez que cambia. Cada archivo es tu catálogo entero: lo que no venga deja de publicarse.",
      tag: null,
      mode: "excel" as const,
    },
    {
      key: "manual",
      icon: Plus,
      title: "De a uno",
      text: "Para pocos productos o algo suelto. Si después cargás una planilla, lo cargado a mano deja de publicarse.",
      tag: null,
      mode: "add" as const,
    },
  ];
  return (
    <section className="rounded-2xl border border-surface-800 bg-surface-900 p-4 sm:p-5">
      <h2 className="text-sm font-semibold text-white">¿Cómo cargás tus productos?</h2>
      <p className="mt-0.5 text-xs text-surface-400">Elegí una. Con precio y stock; lo que tiene stock 0 no lo ven los compradores.</p>
      <div className="mt-3 grid gap-2 sm:grid-cols-3">
        {sources.map((s) => (
          <button
            key={s.key}
            type="button"
            onClick={() => onPick(s.mode)}
            className="group flex flex-col rounded-xl border border-surface-700 bg-surface-950/40 p-4 text-left transition-colors hover:border-brand-500/60 hover:bg-brand-500/[0.06]"
          >
            <span className="flex items-center gap-2">
              <span className="grid h-8 w-8 place-items-center rounded-lg bg-brand-600/15 text-brand-300">
                <s.icon className="h-4 w-4" aria-hidden />
              </span>
              <span className="text-sm font-semibold text-white">{s.title}</span>
              {s.tag && <span className="ml-auto rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-semibold text-emerald-300">{s.tag}</span>}
            </span>
            <span className="mt-2 text-xs leading-relaxed text-surface-400">{s.text}</span>
            <span className="mt-3 text-xs font-semibold text-brand-300 group-hover:text-brand-200">Empezar →</span>
          </button>
        ))}
      </div>
    </section>
  );
}

function ProductRow({
  product,
  defaultWarranty,
  options,
  onSaved,
  onError,
}: {
  product: StorefrontProduct;
  defaultWarranty: string | null;
  options: { brands: Option[]; categories: Option[]; warranties: Option[] };
  onSaved: (text?: string) => void;
  onError: (t: string) => void;
}) {
  const [editing, setEditing] = useState<"quick" | "full" | null>(null);
  const [price, setPrice] = useState("");
  const [stock, setStock] = useState("");
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  function startQuick() {
    setPrice(product.price != null ? String(product.price).replace(".", ",") : "");
    setStock(product.stock != null ? String(product.stock) : "");
    setEditing("quick");
  }

  async function saveQuick() {
    const p = parseNum(price);
    const s = parseNum(stock);
    if (p == null || p <= 0) return onError("Poné un precio mayor a 0");
    if (s == null || s < 0 || !Number.isInteger(s)) return onError("El stock tiene que ser un número entero");
    setSaving(true);
    try {
      await storefrontApi.updateProduct(product.externalId, { price: p, stock: s });
      setEditing(null);
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
    <li className="px-4 py-3">
      <div className="flex flex-wrap items-center gap-3">
        <div className="h-11 w-11 flex-shrink-0 overflow-hidden rounded-lg border border-surface-800 bg-white">
          {product.imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={proxyImg(product.imageUrl, { trim: false })} alt="" className="h-full w-full object-contain" />
          ) : (
            <div className="grid h-full w-full place-items-center bg-surface-950 text-surface-600">
              <ImageOff className="h-4 w-4" aria-hidden />
            </div>
          )}
        </div>
        <div className="min-w-0 flex-1 basis-52">
          <p className="truncate text-sm text-white" title={product.name}>
            {product.name}
          </p>
          <p className="truncate text-[11px] text-surface-500">
            {[product.condition ? PRODUCT_CONDITION_LABEL[product.condition] : null, product.brand, product.sku, product.category]
              .filter(Boolean)
              .join(" · ") || "Sin marca ni código"}
            {product.manual && <span className="ml-1.5 text-surface-400">· cargado a mano</span>}
          </p>
        </div>
        {editing === "quick" ? (
          <div className="flex flex-wrap items-center gap-2">
            <label className="flex items-center gap-1.5 text-[11px] text-surface-400">
              Neto {isArsCurrency(product.currency) ? "$" : "US$"}
              <input value={price} onChange={(e) => setPrice(e.target.value)} inputMode="decimal" className={`${inputCls} w-28 py-1.5`} />
            </label>
            <label className="flex items-center gap-1.5 text-[11px] text-surface-400">
              Stock
              <input value={stock} onChange={(e) => setStock(e.target.value)} inputMode="numeric" className={`${inputCls} w-20 py-1.5`} autoFocus />
            </label>
            <button
              type="button"
              onClick={() => void saveQuick()}
              disabled={saving}
              aria-label="Guardar"
              className="grid h-8 w-8 place-items-center rounded-lg bg-brand-600 text-white hover:bg-brand-500 disabled:opacity-50"
            >
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
            </button>
            <button
              type="button"
              onClick={() => setEditing(null)}
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
            <div className="w-14 text-right">
              <p className={`text-sm font-semibold tabular-nums ${product.stock === 0 ? "text-amber-300" : "text-white"}`}>{product.stock ?? "—"}</p>
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
                  onClick={startQuick}
                  aria-label={`Precio y stock de ${product.name}`}
                  title="Precio y stock"
                  className="grid h-8 w-8 place-items-center rounded-lg text-surface-400 hover:bg-surface-800 hover:text-white"
                >
                  <Pencil className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => setEditing(editing === "full" ? null : "full")}
                  aria-label={`Ficha completa de ${product.name}`}
                  title="Fotos, descripción, garantía y estado"
                  className={`grid h-8 w-8 place-items-center rounded-lg hover:bg-surface-800 hover:text-white ${editing === "full" ? "bg-surface-800 text-white" : "text-surface-400"}`}
                >
                  <SlidersHorizontal className="h-3.5 w-3.5" />
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
      </div>
      {editing === "full" && (
        <div className="mt-3">
          <ProductForm
            product={product}
            defaultWarranty={defaultWarranty}
            options={options}
            onCancel={() => setEditing(null)}
            onSaved={async () => {
              setEditing(null);
              onSaved("Producto actualizado.");
            }}
          />
        </div>
      )}
    </li>
  );
}

/** Alta de un producto, o la ficha completa de uno publicado (`product`). */
function ProductForm({
  product,
  defaultWarranty,
  options,
  onCancel,
  onSaved,
}: {
  product?: StorefrontProduct;
  defaultWarranty: string | null;
  options: { brands: Option[]; categories: Option[]; warranties: Option[] };
  onCancel: () => void;
  onSaved: () => Promise<void>;
}) {
  const editing = Boolean(product);
  const [form, setForm] = useState({
    name: product?.name ?? "",
    brand: product?.brand ?? "",
    category: product?.category ?? "",
    sku: product?.sku ?? "",
    price: product?.price != null ? String(product.price).replace(".", ",") : "",
    currency: isArsCurrency(product?.currency) ? "ARS" : "USD",
    iva: String(product?.ivaPercent ?? 21),
    stock: product?.stock != null ? String(product.stock) : "1",
    condition: product?.condition ?? "",
    warranty: product?.warranty ?? "",
    description: product?.description ?? "",
  });
  const [images, setImages] = useState<string[]>(product?.images ?? []);
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
      condition: form.condition || null,
      warranty: form.warranty.trim() || null,
      description: form.description.trim() || null,
      images,
    };
    setSaving(true);
    try {
      if (product) await storefrontApi.updateProduct(product.externalId, body);
      else await storefrontApi.addProduct(body);
      await onSaved();
    } catch (err) {
      setError(apiError(err, editing ? "No se pudo guardar" : "No se pudo publicar el producto"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="rounded-2xl border border-surface-800 bg-surface-900 p-5">
      <h3 className="text-sm font-semibold text-white">{editing ? "Ficha del producto" : "Cargar un producto"}</h3>
      <p className="mt-1 text-xs text-surface-400">
        {editing ? "Lo que cambies lo ven al toque los comercios que siguen tu tienda." : "Queda publicado al toque para los comercios que siguen tu tienda."}
      </p>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <ImagePicker
            value={images}
            onChange={setImages}
            searchQuery={[form.brand, form.name].filter((s) => s && s.trim()).join(" ")}
            autoImage={product?.autoImage ? product.imageUrl : null}
            hint={
              product?.autoImage && images.includes(product.imageUrl ?? "")
                ? "La foto marcada «NODO» la encontró NODO sola. Podés dejarla, cambiarla o sumar las tuyas."
                : "Hasta 8 fotos. Se achican solas antes de subir (quedan livianas y sin datos del teléfono)."
            }
          />
        </div>
        <label className="sm:col-span-2 flex flex-col gap-1 text-[11px] text-surface-400">
          Nombre
          <input value={form.name} onChange={set("name")} maxLength={300} placeholder="Placa de video ASUS Dual RTX 5060 8GB" className={inputCls} />
        </label>
        <ComboField
          label="Marca (elegí una o creá la tuya)"
          value={form.brand}
          onChange={(v) => setForm((f) => ({ ...f, brand: v }))}
          options={options.brands}
          placeholder="ASUS"
          newLabel="Crear marca"
        />
        <ComboField
          label="Categoría (elegí una o creá otra)"
          value={form.category}
          onChange={(v) => setForm((f) => ({ ...f, category: v }))}
          options={options.categories}
          placeholder="Placas de video"
          newLabel="Crear categoría"
        />
        <label className="flex flex-col gap-1 text-[11px] text-surface-400">
          Código / part number (opcional)
          <input value={form.sku} onChange={set("sku")} maxLength={120} className={inputCls} />
        </label>
        <label className="flex flex-col gap-1 text-[11px] text-surface-400">
          Estado
          <select value={form.condition} onChange={set("condition")} className={inputCls}>
            <option value="">Sin especificar</option>
            {Object.entries(PRODUCT_CONDITION_LABEL).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
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
        <div className="grid grid-cols-2 gap-3">
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
          <label className="flex flex-col gap-1 text-[11px] text-surface-400">
            Stock
            <input value={form.stock} onChange={set("stock")} inputMode="numeric" className={inputCls} />
          </label>
        </div>
        <div className="sm:col-span-2">
          <ComboField
            label="Garantía de este producto (elegí una o creá otra)"
            value={form.warranty}
            onChange={(v) => setForm((f) => ({ ...f, warranty: v }))}
            options={options.warranties}
            maxLength={300}
            placeholder={defaultWarranty ? `Si la dejás vacía: ${defaultWarranty}` : "6 meses oficial"}
            newLabel="Crear garantía"
          />
        </div>
        <label className="sm:col-span-2 flex flex-col gap-1 text-[11px] text-surface-400">
          Descripción
          <textarea
            value={form.description}
            onChange={set("description")}
            rows={4}
            maxLength={4000}
            placeholder="Estado, qué incluye, detalles que el comprador tiene que saber."
            className={inputCls}
          />
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
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : editing ? <Check className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
          {editing ? "Guardar" : "Publicar"}
        </button>
        <button type="button" onClick={onCancel} className="rounded-lg border border-surface-700 px-4 py-2 text-sm text-surface-300 hover:text-white">
          Cancelar
        </button>
      </div>
    </section>
  );
}
