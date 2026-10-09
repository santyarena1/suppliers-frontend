"use client";

import { useCallback, useEffect, useState } from "react";
import { Lock, Tag } from "lucide-react";
import { saleMarginsApi } from "@/lib/api";
import { getTenant } from "@/lib/auth";
import { useCan } from "@/lib/permissions";
import { useSellerSession } from "@/lib/sale-price";
import {
  formatMargin,
  rescaleSale,
  type ProviderSaleMargins,
  type SaleMarginBase,
  type SaleMarginCategory,
  type SaleMarginSource,
} from "@/lib/sale-margins";
import { useSubscription } from "@/lib/subscription";
import UpsellNotice from "@/components/subscription/UpsellNotice";
import CategoryProductsDrawer, { type Inherited } from "./CategoryProductsDrawer";
import CategoryTable from "./CategoryTable";
import MarginHistory from "./MarginHistory";
import MarginsHeader from "./MarginsHeader";
import { UndoToast } from "./shared";

type Notice = { message: string; undo?: () => void; tone?: "ok" | "error" };

/** Mensaje del servidor (p. ej. "configurá el distribuidor antes de cambiar la base"). */
function serverMessage(err: unknown): string | null {
  const data = (err as { response?: { data?: { message?: unknown } } })?.response?.data;
  const msg = data?.message;
  if (typeof msg === "string" && msg.trim()) return msg;
  if (Array.isArray(msg) && typeof msg[0] === "string") return msg[0];
  return null;
}

/** Lo que hereda una categoría sin margen propio. */
function inheritedOf(data: Pick<ProviderSaleMargins, "providerPercent" | "storePercent">): Inherited {
  if (data.providerPercent != null) return { value: data.providerPercent, source: "provider" };
  if (data.storePercent != null) return { value: data.storePercent, source: "store" };
  return { value: 0, source: "none" };
}

/**
 * Recalcula margen efectivo, origen y ejemplo de cada categoría y sus
 * subcategorías (cambio optimista). La subcategoría hereda de su categoría.
 */
function recompute(data: ProviderSaleMargins): ProviderSaleMargins {
  const inherited = inheritedOf(data);
  return {
    ...data,
    categories: data.categories.map((c) => {
      const effective = c.percent ?? inherited.value;
      const source: SaleMarginSource = c.percent != null ? "category" : inherited.source;
      const sample = c.sample ? { ...c.sample, sale: rescaleSale(c.sample.sale, c.effective, effective) } : c.sample;
      const subcategories = (c.subcategories ?? []).map((sub) => ({
        ...sub,
        effective: sub.percent ?? effective,
        source: (sub.percent != null ? "subcategory" : source) as SaleMarginSource,
      }));
      return { ...c, effective, source, sample, subcategories };
    }),
  };
}

/** Aplica `percent` a las categorías y subcategorías cuyas claves estén en `keys`. */
function withPercent(categories: SaleMarginCategory[], keys: Set<string>, percent: number | null): SaleMarginCategory[] {
  return categories.map((c) => ({
    ...c,
    ...(keys.has(c.key) ? { percent } : {}),
    subcategories: (c.subcategories ?? []).map((sub) => (keys.has(sub.key) ? { ...sub, percent } : sub)),
  }));
}

/** Margen propio actual de cada clave pedida (categoría o subcategoría). */
function currentPercents(categories: SaleMarginCategory[], keys: Set<string>): Map<string, number | null> {
  const out = new Map<string, number | null>();
  for (const c of categories) {
    if (keys.has(c.key)) out.set(c.key, c.percent);
    for (const sub of c.subcategories ?? []) if (keys.has(sub.key)) out.set(sub.key, sub.percent);
  }
  return out;
}

/** La categoría abierta en el panel de productos (y su categoría, si es una subcategoría). */
type OpenCategory = { row: SaleMarginCategory; parent: SaleMarginCategory | null };

function SkeletonRows() {
  return (
    <div className="flex flex-col gap-3" aria-busy>
      <div className="h-36 animate-pulse rounded-xl bg-surface-900" />
      <div className="h-64 animate-pulse rounded-xl bg-surface-900" />
    </div>
  );
}

/**
 * Márgenes de venta de un distribuidor (modo vendedor, Pro y Custom). Ver
 * docs/PLAN_MODO_VENDEDOR.md §5.
 */
export default function SaleMarginsPanel({ provider, providerName }: { provider: string; providerName: string }) {
  const { sellerMode } = useSellerSession();
  const { subscription, loading: subLoading } = useSubscription();
  const can = useCan("pricing.manage");
  const role = getTenant()?.role;
  // Hasta saber los permisos, el dueño y el admin editan; el servidor decide igual.
  const canEdit = can === true || (can === null && (role === "OWNER" || role === "ADMIN"));

  const [data, setData] = useState<ProviderSaleMargins | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [open, setOpen] = useState<OpenCategory | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [historyKey, setHistoryKey] = useState(0);

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await saleMarginsApi.provider(provider);
      setData(res.data);
    } catch {
      setError("No se pudieron cargar los márgenes de este distribuidor.");
    }
  }, [provider]);

  useEffect(() => {
    if (sellerMode) void load();
  }, [sellerMode, load]);

  /** Aplica en pantalla, guarda y ofrece deshacer. Si falla, vuelve atrás. */
  async function mutate(
    next: ProviderSaleMargins,
    save: () => Promise<ProviderSaleMargins | null>,
    message: string,
    undo?: () => Promise<ProviderSaleMargins | null>
  ) {
    const before = data;
    setData(recompute(next));
    setSaving(true);
    try {
      const fresh = await save();
      if (fresh) setData(fresh);
      setHistoryKey((k) => k + 1);
      setNotice({
        message,
        undo: undo
          ? () =>
              void undo()
                .then((back) => {
                  if (back) setData(back);
                  else if (before) setData(before);
                  setHistoryKey((k) => k + 1);
                })
                .catch(() => setNotice({ message: "No se pudo deshacer. Recargá para ver el estado real.", tone: "error" }))
          : undefined,
      });
    } catch (err) {
      if (before) setData(before);
      setNotice({ message: serverMessage(err) ?? "No se pudo guardar el margen. Probá de nuevo.", tone: "error" });
    } finally {
      setSaving(false);
    }
  }

  function setCategories(keys: string[], percent: number | null) {
    if (!data || keys.length === 0) return;
    const keySet = new Set(keys);
    const previous = currentPercents(data.categories, keySet);
    const subs = keys.filter((k) => k.includes(">")).length;
    const what =
      keys.length === 1
        ? subs === 1
          ? "1 subcategoría"
          : "1 categoría"
        : subs === keys.length
          ? `${keys.length} subcategorías`
          : subs > 0
            ? `${keys.length} categorías y subcategorías`
            : `${keys.length} categorías`;
    void mutate(
      { ...data, categories: withPercent(data.categories, keySet, percent) },
      async () => (await saleMarginsApi.setCategories(provider, keys, percent)).data ?? null,
      percent == null ? `${what} vuelven a heredar el margen.` : `${what} con ${formatMargin(percent)}.`,
      async () => {
        // Cada categoría vuelve a su margen anterior (agrupadas por valor).
        const groups = new Map<string, { percent: number | null; keys: string[] }>();
        for (const [key, p] of previous) {
          const id = p == null ? "null" : String(p);
          const g = groups.get(id) ?? { percent: p, keys: [] };
          g.keys.push(key);
          groups.set(id, g);
        }
        let last: ProviderSaleMargins | null = null;
        for (const g of groups.values()) last = (await saleMarginsApi.setCategories(provider, g.keys, g.percent)).data ?? null;
        return last;
      }
    );
  }

  function setProviderPercent(percent: number | null) {
    if (!data) return;
    const prev = data.providerPercent;
    void mutate(
      { ...data, providerPercent: percent },
      async () => (await saleMarginsApi.saveProvider(provider, { providerPercent: percent })).data ?? null,
      percent == null ? `${providerName} vuelve a heredar el margen del comercio.` : `${providerName}: margen general ${formatMargin(percent)}.`,
      async () => (await saleMarginsApi.saveProvider(provider, { providerPercent: prev })).data ?? null
    );
  }

  function setStorePercent(percent: number | null) {
    if (!data) return;
    const prev = data.storePercent;
    void mutate(
      { ...data, storePercent: percent },
      async () => {
        await saleMarginsApi.saveSettings(percent);
        return (await saleMarginsApi.provider(provider)).data ?? null;
      },
      percent == null ? "Se quitó el margen general del comercio." : `Margen general del comercio: ${formatMargin(percent)}.`,
      async () => {
        await saleMarginsApi.saveSettings(prev);
        return (await saleMarginsApi.provider(provider)).data ?? null;
      }
    );
  }

  function setBase(base: SaleMarginBase) {
    if (!data) return;
    const prev = data.base;
    void mutate(
      { ...data, base },
      async () => (await saleMarginsApi.saveProvider(provider, { base })).data ?? null,
      base === "FINAL" ? "El margen se calcula sobre el costo final." : "El margen se calcula sobre el costo neto.",
      async () => (await saleMarginsApi.saveProvider(provider, { base: prev })).data ?? null
    );
  }

  if (!subLoading && subscription && !sellerMode) {
    return (
      <div className="flex max-w-2xl flex-col gap-4">
        <Intro providerName={providerName} />
        <UpsellNotice capability="sellerMode" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex flex-col gap-4">
        <Intro providerName={providerName} />
        {error ? (
          <div className="rounded-xl border border-surface-800 px-4 py-8 text-center">
            <p className="text-sm text-surface-300">{error}</p>
            <button type="button" onClick={() => void load()} className="mt-3 text-sm font-medium text-brand-300 hover:text-brand-200">
              Reintentar
            </button>
          </div>
        ) : (
          <SkeletonRows />
        )}
      </div>
    );
  }

  const inherited = inheritedOf(data);
  // Lo que hereda un producto de la fila abierta: la subcategoría, si no su categoría, si no el distribuidor.
  const drawerInherited: Inherited | null = open
    ? open.row.percent != null
      ? { value: open.row.percent, source: open.parent ? "subcategory" : "category" }
      : open.parent?.percent != null
        ? { value: open.parent.percent, source: "category" }
        : inherited
    : null;
  // El panel muestra "Hardware › Placas de video" cuando es una subcategoría.
  const drawerCategory = open
    ? open.parent
      ? { ...open.row, label: `${open.parent.label} › ${open.row.label}` }
      : open.row
    : null;

  return (
    <div className="flex flex-col gap-4">
      <Intro providerName={providerName} />
      {!canEdit && (
        <p className="flex items-center gap-2 rounded-lg border border-surface-800 bg-surface-900/60 px-3 py-2 text-xs text-surface-400">
          <Lock className="h-3.5 w-3.5" />
          Podés ver los márgenes, pero cambiarlos lo hace el dueño o quien tenga permiso para manejar precios.
        </p>
      )}
      <MarginsHeader
        data={data}
        canEdit={canEdit}
        saving={saving}
        onBase={setBase}
        onProviderPercent={setProviderPercent}
        onStorePercent={setStorePercent}
      />
      <CategoryTable
        categories={data.categories}
        inheritedValue={inherited.value}
        canEdit={canEdit}
        saving={saving}
        onSet={setCategories}
        onOpen={(row, parent) => setOpen({ row, parent })}
      />
      <MarginHistory provider={provider} refreshKey={historyKey} />

      {drawerCategory && drawerInherited && (
        <CategoryProductsDrawer
          provider={provider}
          category={drawerCategory}
          inherited={drawerInherited}
          canEdit={canEdit}
          onClose={() => setOpen(null)}
          onNotice={(n) => {
            setNotice(n);
            setHistoryKey((k) => k + 1);
          }}
        />
      )}
      {notice && (
        <UndoToast message={notice.message} tone={notice.tone} onUndo={notice.undo} onClose={() => setNotice(null)} />
      )}
    </div>
  );
}

function Intro({ providerName }: { providerName: string }) {
  return (
    <div className="flex items-start gap-3">
      <span className="mt-0.5 flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-400">
        <Tag className="h-4 w-4" />
      </span>
      <div className="min-w-0">
        <h2 className="text-base font-semibold text-white">Márgenes de venta · {providerName}</h2>
        <p className="mt-0.5 max-w-2xl text-xs leading-relaxed text-surface-400">
          El costo de {providerName} no cambia: el margen arma el precio de venta que ve tu equipo de ventas. Gana el más
          específico: producto, subcategoría, categoría, este distribuidor y, por último, el general del comercio.
        </p>
      </div>
    </div>
  );
}
