"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { myApi, type BrandDiscount, type DiscountClient } from "@/lib/api";
import { canManageDistributor } from "@/lib/distributor";
import { Loader2, Percent, Store, Tag } from "lucide-react";

function emptyDiscount(brandName: string): BrandDiscount {
  return { brandName, discountPercent: 0, appliesToAll: true, clients: [] };
}

/**
 * Descuento por marca: lista general de locales, o comercios concretos.
 * El Product Manager ve los locales para asignar; no entra a la cartera.
 */
export default function BrandDiscountsPanel({ compact = false }: { compact?: boolean }) {
  const manage = canManageDistributor();
  const [rows, setRows] = useState<BrandDiscount[]>([]);
  const [catalog, setCatalog] = useState<string[]>([]);
  const [stores, setStores] = useState<DiscountClient[]>([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [draftBrand, setDraftBrand] = useState("");
  const [draftPercent, setDraftPercent] = useState("");
  const [draftGeneral, setDraftGeneral] = useState(true);
  const [draftStores, setDraftStores] = useState<string[]>([]);

  const load = useCallback(async () => {
    try {
      const [discounts, brands, clients] = await Promise.all([
        myApi.brandDiscounts(),
        manage ? myApi.catalogBrands().catch(() => ({ data: [] as string[] })) : Promise.resolve({ data: [] as string[] }),
        myApi.discountClients().catch(() => ({ data: [] as DiscountClient[] })),
      ]);
      setRows(discounts.data ?? []);
      setCatalog(brands.data ?? []);
      setStores(clients.data ?? []);
    } catch {
      setMsg({ ok: false, text: "No se pudieron cargar los descuentos" });
    } finally {
      setLoading(false);
    }
  }, [manage]);

  useEffect(() => { void load(); }, [load]);

  const merged = useMemo(() => {
    const byName = new Map(rows.map((row) => [row.brandName, row]));
    const names = new Set([...rows.map((row) => row.brandName), ...catalog]);
    return [...names]
      .sort((a, b) => a.localeCompare(b, "es"))
      .map((brandName) => byName.get(brandName) ?? emptyDiscount(brandName));
  }, [rows, catalog]);

  function replace(row: BrandDiscount) {
    setRows((prev) => {
      const next = prev.filter((item) => item.brandName !== row.brandName);
      if (row.discountPercent > 0) next.push(row);
      return next;
    });
  }

  async function save(row: BrandDiscount) {
    setMsg(null);
    if (row.discountPercent > 0 && !row.appliesToAll && row.clients.length === 0) {
      setMsg({ ok: false, text: "Elegí al menos un local, o usá la lista general" });
      return;
    }
    try {
      const res = await myApi.upsertBrandDiscount({
        brandName: row.brandName,
        discountPercent: row.discountPercent,
        appliesToAll: row.appliesToAll,
        clientTenantIds: row.clients.map((client) => client.id),
      });
      replace(res.data.discountPercent > 0 ? res.data : emptyDiscount(row.brandName));
    } catch (err: unknown) {
      const text = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
      setMsg({ ok: false, text: text || "No se pudo guardar el descuento" });
    }
  }

  async function addBrand(e: React.FormEvent) {
    e.preventDefault();
    const brandName = draftBrand.trim();
    const discountPercent = Number(draftPercent);
    if (!brandName) return;
    if (Number.isNaN(discountPercent) || discountPercent < 0 || discountPercent > 100) return;
    await save({
      brandName,
      discountPercent,
      appliesToAll: draftGeneral,
      clients: stores.filter((store) => draftStores.includes(store.id)),
    });
    setDraftBrand("");
    setDraftPercent("");
    setDraftGeneral(true);
    setDraftStores([]);
  }

  if (loading) {
    return <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-brand-500" /></div>;
  }

  return (
    <section className={compact ? "" : "bg-surface-900 border border-surface-800 rounded-2xl p-5"}>
      <div className="flex items-center gap-2 mb-1">
        <Percent className="w-4 h-4 text-brand-400" />
        <h2 className="text-sm font-semibold text-white">Descuentos por marca</h2>
      </div>
      <p className="text-xs text-surface-500 mb-4">
        Van al local: lista general o comercios concretos. El comercio no ve el porcentaje; ve el precio que le queda.
      </p>

      {merged.length === 0 ? (
        <p className="text-xs text-surface-500 mb-4">
          {manage
            ? "Todavía no hay marcas en el catálogo. Podés cargar una a mano."
            : "Todavía no te asignaron marcas. El catálogo de búsqueda queda vacío hasta que el gerente lo haga."}
        </p>
      ) : (
        <div className="flex flex-col gap-3 mb-4">
          {merged.map((row) => (
            <BrandDiscountRow
              key={row.brandName}
              row={row}
              stores={stores}
              onChange={(next) => void save(next)}
            />
          ))}
        </div>
      )}

      {manage && (
        <form onSubmit={addBrand} className="flex flex-col gap-3 border-t border-surface-800 pt-4">
          <p className="text-xs font-semibold text-white">Cargar marca</p>
          <div className="flex flex-col sm:flex-row gap-2">
            <input
              value={draftBrand}
              onChange={(e) => setDraftBrand(e.target.value)}
              list="nodo-catalog-brands"
              placeholder="Marca"
              className="flex-1 bg-surface-800 border border-surface-700 rounded-lg px-3 py-2 text-sm text-white placeholder-surface-500 focus:outline-none focus:border-brand-500"
            />
            <datalist id="nodo-catalog-brands">
              {catalog.map((name) => (
                <option key={name} value={name} />
              ))}
            </datalist>
            <input
              type="number"
              min={0}
              max={100}
              step={0.5}
              value={draftPercent}
              onChange={(e) => setDraftPercent(e.target.value)}
              placeholder="%"
              className="w-24 bg-surface-800 border border-surface-700 rounded-lg px-3 py-2 text-sm text-white placeholder-surface-500 focus:outline-none focus:border-brand-500"
            />
          </div>
          <ScopePicker
            appliesToAll={draftGeneral}
            selectedIds={draftStores}
            stores={stores}
            onGeneral={(value) => {
              setDraftGeneral(value);
              if (value) setDraftStores([]);
            }}
            onToggle={(id) => {
              setDraftGeneral(false);
              setDraftStores((prev) => (prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]));
            }}
          />
          <button
            type="submit"
            className="self-start bg-brand-600 hover:bg-brand-500 text-white text-sm font-semibold rounded-lg px-4 py-2"
          >
            Guardar
          </button>
        </form>
      )}

      {msg && (
        <p className={`text-xs mt-3 ${msg.ok ? "text-emerald-400" : "text-red-400"}`}>{msg.text}</p>
      )}
    </section>
  );
}

function BrandDiscountRow({
  row,
  stores,
  onChange,
}: {
  row: BrandDiscount;
  stores: DiscountClient[];
  onChange: (row: BrandDiscount) => void;
}) {
  const [draft, setDraft] = useState(row);
  useEffect(() => { setDraft(row); }, [row]);

  function commit(next: BrandDiscount) {
    setDraft(next);
    if (next.discountPercent > 0 && !next.appliesToAll && next.clients.length === 0) return;
    onChange(next);
  }

  return (
    <div className="border border-surface-800 rounded-lg px-3 py-2.5">
      <div className="flex items-center gap-3">
        <Tag className="w-3.5 h-3.5 text-surface-500" />
        <p className="flex-1 text-sm text-surface-200">{draft.brandName}</p>
        <div className="flex items-center gap-1">
          <input
            type="number"
            min={0}
            max={100}
            step={0.5}
            defaultValue={draft.discountPercent || ""}
            key={`${draft.brandName}-${draft.discountPercent}`}
            onBlur={(e) => {
              const raw = e.target.value.trim();
              const value = raw === "" ? 0 : Number(raw);
              if (Number.isNaN(value) || value < 0 || value > 100) return;
              if (value === draft.discountPercent) return;
              commit({ ...draft, discountPercent: value });
            }}
            className="w-20 bg-surface-800 border border-surface-700 rounded-md px-2 py-1.5 text-xs text-white text-right"
          />
          <span className="text-[11px] text-surface-500">%</span>
        </div>
      </div>
      <div className="mt-2">
        <ScopePicker
          appliesToAll={draft.appliesToAll}
          selectedIds={draft.clients.map((client) => client.id)}
          stores={stores}
          onGeneral={(value) => {
            if (value) commit({ ...draft, appliesToAll: true, clients: [] });
            else commit({ ...draft, appliesToAll: false, clients: draft.clients });
          }}
          onToggle={(id) => {
            const selected = new Set(draft.clients.map((client) => client.id));
            if (selected.has(id)) selected.delete(id);
            else selected.add(id);
            commit({
              ...draft,
              appliesToAll: false,
              clients: stores.filter((store) => selected.has(store.id)),
            });
          }}
        />
      </div>
    </div>
  );
}

function ScopePicker({
  appliesToAll,
  selectedIds,
  stores,
  onGeneral,
  onToggle,
}: {
  appliesToAll: boolean;
  selectedIds: string[];
  stores: DiscountClient[];
  onGeneral: (value: boolean) => void;
  onToggle: (id: string) => void;
}) {
  return (
    <div>
      <div className="flex gap-2 mb-2">
        <button
          type="button"
          onClick={() => onGeneral(true)}
          className={`text-[11px] px-2 py-1 rounded-md border ${
            appliesToAll
              ? "border-brand-500/40 text-brand-300 bg-brand-600/10"
              : "border-surface-700 text-surface-500 hover:text-surface-300"
          }`}
        >
          Lista general
        </button>
        <button
          type="button"
          onClick={() => onGeneral(false)}
          className={`text-[11px] px-2 py-1 rounded-md border ${
            !appliesToAll
              ? "border-brand-500/40 text-brand-300 bg-brand-600/10"
              : "border-surface-700 text-surface-500 hover:text-surface-300"
          }`}
        >
          Locales
        </button>
      </div>
      {appliesToAll ? (
        <p className="text-[11px] text-surface-500">Aplica a todos los comercios vinculados.</p>
      ) : stores.length === 0 ? (
        <p className="text-[11px] text-surface-500">Todavía no hay comercios vinculados.</p>
      ) : (
        <div className="flex flex-col gap-1 max-h-40 overflow-y-auto">
          {stores.map((store) => {
            const on = selectedIds.includes(store.id);
            return (
              <label key={store.id} className="flex items-center gap-2 text-xs text-surface-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={on}
                  onChange={() => onToggle(store.id)}
                  className="rounded border-surface-600"
                />
                <Store className="w-3 h-3 text-surface-500" />
                {store.name}
              </label>
            );
          })}
        </div>
      )}
    </div>
  );
}
