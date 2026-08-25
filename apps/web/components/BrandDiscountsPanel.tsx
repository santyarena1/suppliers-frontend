"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { myApi, type BrandDiscount } from "@/lib/api";
import { canManageDistributor } from "@/lib/distributor";
import { Loader2, Percent, Tag } from "lucide-react";

/**
 * Descuento por marca del catálogo del mayorista. El gerente ve todas; el
 * Product Manager, solo las suyas. Se aplica al precio que lee el comercio.
 */
export default function BrandDiscountsPanel({ compact = false }: { compact?: boolean }) {
  const manage = canManageDistributor();
  const [rows, setRows] = useState<BrandDiscount[]>([]);
  const [catalog, setCatalog] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [draftBrand, setDraftBrand] = useState("");
  const [draftPercent, setDraftPercent] = useState("");

  const load = useCallback(async () => {
    try {
      const [discounts, brands] = await Promise.all([
        myApi.brandDiscounts(),
        manage ? myApi.catalogBrands().catch(() => ({ data: [] as string[] })) : Promise.resolve({ data: [] as string[] }),
      ]);
      setRows(discounts.data ?? []);
      setCatalog(brands.data ?? []);
    } catch {
      setMsg({ ok: false, text: "No se pudieron cargar los descuentos" });
    } finally {
      setLoading(false);
    }
  }, [manage]);

  useEffect(() => { void load(); }, [load]);

  const merged = useMemo(() => {
    const byName = new Map(rows.map((row) => [row.brandName, row.discountPercent]));
    const names = new Set([...rows.map((row) => row.brandName), ...catalog]);
    return [...names]
      .sort((a, b) => a.localeCompare(b, "es"))
      .map((brandName) => ({ brandName, discountPercent: byName.get(brandName) ?? 0 }));
  }, [rows, catalog]);

  async function save(brandName: string, discountPercent: number) {
    setMsg(null);
    try {
      const res = await myApi.upsertBrandDiscount({ brandName, discountPercent });
      setRows((prev) => {
        const next = prev.filter((row) => row.brandName !== res.data.brandName);
        if (res.data.discountPercent > 0) next.push(res.data);
        return next;
      });
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
    await save(brandName, discountPercent);
    setDraftBrand("");
    setDraftPercent("");
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
        Se apila sobre el descuento de cuenta del comercio. El local no ve el porcentaje: ve el precio que le queda.
      </p>

      {merged.length === 0 ? (
        <p className="text-xs text-surface-500 mb-4">
          {manage
            ? "Todavía no hay marcas en el catálogo. Podés cargar una a mano."
            : "Todavía no te asignaron marcas. El catálogo de búsqueda queda vacío hasta que el gerente lo haga."}
        </p>
      ) : (
        <div className="border border-surface-800 rounded-lg divide-y divide-surface-800 mb-4">
          {merged.map((row) => (
            <div key={row.brandName} className="flex items-center gap-3 px-3 py-2">
              <Tag className="w-3.5 h-3.5 text-surface-500" />
              <p className="flex-1 text-sm text-surface-200">{row.brandName}</p>
              <div className="flex items-center gap-1">
                <input
                  type="number"
                  min={0}
                  max={100}
                  step={0.5}
                  defaultValue={row.discountPercent || ""}
                  key={`${row.brandName}-${row.discountPercent}`}
                  onBlur={(e) => {
                    const raw = e.target.value.trim();
                    const value = raw === "" ? 0 : Number(raw);
                    if (Number.isNaN(value) || value < 0 || value > 100) return;
                    if (value === row.discountPercent) return;
                    void save(row.brandName, value);
                  }}
                  className="w-20 bg-surface-800 border border-surface-700 rounded-md px-2 py-1.5 text-xs text-white text-right"
                />
                <span className="text-[11px] text-surface-500">%</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {manage && (
        <form onSubmit={addBrand} className="flex flex-col sm:flex-row gap-2">
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
