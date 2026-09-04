"use client";

import { useCallback, useEffect, useState } from "react";
import { GitMerge, Loader2, RefreshCw } from "lucide-react";
import { providerMergeApi, type ProviderMergeCandidate } from "@/lib/api";
import ProviderBadge from "@/components/ProviderBadge";

/**
 * Unificar un proveedor por lista duplicado (LIST_*) dentro del proveedor real:
 * fichas, ofertas, cargas, vínculos y pedidos pasan al destino; el duplicado se
 * borra si quedó vacío. Red de seguridad del superadmin.
 */
export default function ProviderMergePanel({ showToast }: { showToast: (msg: string, ok?: boolean) => void }) {
  const [rows, setRows] = useState<ProviderMergeCandidate[] | null>(null);
  const [target, setTarget] = useState<Record<string, string>>({});
  const [merging, setMerging] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await providerMergeApi.candidates();
      setRows(res.data);
    } catch {
      setRows([]);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function merge(row: ProviderMergeCandidate) {
    const into = target[row.providerKey];
    if (!into) return;
    const intoName = row.similar.find((s) => s.providerKey === into)?.name ?? into;
    if (!window.confirm(`¿Unificar "${row.name}" (${row.providerKey}) dentro de "${intoName}"? No se puede deshacer.`)) return;
    setMerging(row.providerKey);
    try {
      const res = await providerMergeApi.merge(row.providerKey, into);
      const moved = Object.values(res.data.moved).reduce((a, b) => a + b, 0);
      showToast(`Unificado: ${moved} filas movidas a ${intoName}`, true);
      await load();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
      showToast(msg || "No se pudo unificar", false);
    } finally {
      setMerging(null);
    }
  }

  return (
    <section className="border border-surface-800 rounded-xl p-5 flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="flex items-center gap-2 text-sm font-semibold text-white">
            <GitMerge className="w-4 h-4 text-brand-700 dark:text-brand-400" /> Unificar proveedores por lista
          </h3>
          <p className="text-xs text-surface-500 mt-1">
            Proveedores creados por lista que se parecen a otro ya existente. Al unificar, todo lo del duplicado pasa al real.
          </p>
        </div>
        <button type="button" onClick={() => void load()} className="text-surface-400 hover:text-white" title="Actualizar">
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>
      {rows === null ? (
        <div className="flex justify-center py-6"><Loader2 className="w-4 h-4 animate-spin text-brand-500" /></div>
      ) : rows.length === 0 ? (
        <p className="text-xs text-surface-500">No hay proveedores por lista.</p>
      ) : (
        <div className="flex flex-col divide-y divide-surface-800">
          {rows.map((row) => (
            <div key={row.providerKey} className="py-3 flex flex-wrap items-center gap-3">
              <div className="min-w-[220px] flex-1">
                <ProviderBadge provider={row.providerKey} label={row.name} variant="inline" size="sm" />
                <p className="text-[11px] text-surface-500 mt-0.5">
                  {row.providerKey} · {row.type === "BRAND" ? "marca" : "distribuidor"} · {row.clients} cliente{row.clients === 1 ? "" : "s"}
                  {row.managedByPlatform ? " · creado por un comercio" : ""}
                </p>
              </div>
              <select
                value={target[row.providerKey] ?? ""}
                onChange={(e) => setTarget({ ...target, [row.providerKey]: e.target.value })}
                className="bg-surface-800 border border-surface-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-brand-500 min-w-[220px]"
              >
                <option value="">{row.similar.length ? "Unificar dentro de…" : "Sin parecidos"}</option>
                {row.similar.map((s) => (
                  <option key={s.providerKey} value={s.providerKey}>{s.name} ({s.providerKey})</option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => merge(row)}
                disabled={!target[row.providerKey] || merging === row.providerKey}
                className="flex items-center gap-1.5 bg-brand-600 hover:bg-brand-500 disabled:opacity-40 text-white text-xs font-semibold rounded-lg px-3 py-2"
              >
                {merging === row.providerKey ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <GitMerge className="w-3.5 h-3.5" />} Unificar
              </button>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
