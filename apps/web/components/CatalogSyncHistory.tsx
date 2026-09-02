"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  providersApi,
  type CatalogSyncChange,
  type CatalogSyncRun,
  type CatalogSyncRunDetail,
  type Provider,
  isLiveSyncRun,
} from "@/lib/api";
import { ChevronDown, ChevronRight, ExternalLink, History, Loader2, PackagePlus, RefreshCw } from "lucide-react";

const SOURCE_LABEL: Record<string, string> = {
  manual: "Manual",
  cron: "Automática",
  import: "Excel/CSV",
};

const FIELD_LABEL: Record<string, string> = {
  name: "Nombre",
  brand: "Marca",
  category: "Categoría",
  subcategory: "Subcategoría",
  sku: "SKU",
  price: "Precio",
  finalPrice: "Precio final",
  currency: "Moneda",
  ivaPercent: "IVA",
  stock: "Stock",
  stockStatus: "Estado de stock",
};

function fmtWhen(iso: string | null | undefined) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("es-AR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function fmtValue(value: unknown): string {
  if (value == null || value === "") return "—";
  if (typeof value === "number") return value.toLocaleString("es-AR");
  return String(value);
}

function statusLabel(run: CatalogSyncRun) {
  if (run.status === "RUNNING") return "En curso";
  if (run.status === "OK") return "Completada";
  return "Error";
}

function statusClass(run: CatalogSyncRun) {
  if (run.status === "RUNNING") return "text-sky-400";
  if (run.status === "OK") return "text-emerald-400";
  return "text-red-400";
}

export default function CatalogSyncHistory({
  provider,
  refreshKey,
  live = false,
  onSelectRun,
}: {
  provider: Provider;
  refreshKey?: string | number;
  live?: boolean;
  onSelectRun?: (run: CatalogSyncRun) => void;
}) {
  const [runs, setRuns] = useState<CatalogSyncRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [openId, setOpenId] = useState<string | null>(null);
  const [detail, setDetail] = useState<CatalogSyncRunDetail | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [filter, setFilter] = useState<"all" | "created" | "updated">("all");

  const load = useCallback(async () => {
    try {
      const res = await providersApi.syncRuns(provider, 20);
      setRuns(Array.isArray(res.data) ? res.data : []);
    } catch {
      setRuns([]);
    } finally {
      setLoading(false);
    }
  }, [provider]);

  useEffect(() => {
    setLoading(true);
    setOpenId(null);
    setDetail(null);
    void load();
  }, [load, refreshKey]);

  useEffect(() => {
    if (!live && !runs.some(isLiveSyncRun)) return;
    const id = setInterval(() => void load(), 1500);
    return () => clearInterval(id);
  }, [live, runs, load]);

  useEffect(() => {
    if (!openId) return;
    const open = runs.find((r) => r.id === openId);
    if (!open || !isLiveSyncRun(open)) return;
    const id = setInterval(async () => {
      try {
        const res = await providersApi.syncRun(provider, openId);
        setDetail(res.data);
      } catch {
        /* la corrida puede no tener cambios todavía */
      }
    }, 2000);
    return () => clearInterval(id);
  }, [openId, runs, provider]);

  async function toggle(run: CatalogSyncRun) {
    if (openId === run.id) {
      setOpenId(null);
      return;
    }
    setOpenId(run.id);
    setFilter("all");
    onSelectRun?.(run);
    if (detail?.id === run.id) return;
    setLoadingDetail(true);
    try {
      const res = await providersApi.syncRun(provider, run.id);
      setDetail(res.data);
    } catch {
      setDetail(null);
    } finally {
      setLoadingDetail(false);
    }
  }

  const changes = (detail?.id === openId ? detail?.changes : []) ?? [];
  const visible = changes.filter((c) => (filter === "all" ? true : c.action === filter));

  return (
    <div className="border border-surface-800 rounded-xl p-5 flex flex-col gap-3">
      <div className="flex items-center gap-2 text-sm font-semibold text-white">
        <History className="w-4 h-4 text-brand-700 dark:text-brand-400" />
        Últimas sincronizaciones
      </div>
      <p className="text-xs text-surface-500">
        Entrá a una corrida para ver qué productos se crearon o cambiaron (precio, stock, marca, categoría).
      </p>
      {loading ? (
        <div className="flex items-center gap-2 text-xs text-surface-500 py-2">
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
          Cargando historial…
        </div>
      ) : runs.length === 0 ? (
        <p className="text-xs text-surface-500 py-1">Todavía no hubo ninguna sincronización.</p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {runs.map((run) => {
            const open = openId === run.id;
            return (
              <li key={run.id} className="border border-surface-800 rounded-lg overflow-hidden">
                <button
                  type="button"
                  onClick={() => void toggle(run)}
                  className="w-full flex items-center gap-2 px-3 py-2.5 text-left hover:bg-surface-800/60"
                >
                  {open ? (
                    <ChevronDown className="w-3.5 h-3.5 text-surface-500 flex-shrink-0" />
                  ) : (
                    <ChevronRight className="w-3.5 h-3.5 text-surface-500 flex-shrink-0" />
                  )}
                  <span className={`text-[11px] font-semibold flex-shrink-0 ${statusClass(run)}`}>
                    {statusLabel(run)}
                  </span>
                  <span className="text-[11px] text-surface-400 flex-shrink-0">
                    {SOURCE_LABEL[run.source] ?? run.source}
                  </span>
                  <span className="text-[11px] text-surface-300 tabular-nums truncate">
                    {run.processed.toLocaleString("es-AR")} · {run.created.toLocaleString("es-AR")} nuevos ·{" "}
                    {run.updated.toLocaleString("es-AR")} actualizados
                  </span>
                  <span className="ml-auto text-[10px] text-surface-500 flex-shrink-0">
                    {fmtWhen(run.finishedAt ?? run.startedAt)}
                  </span>
                </button>
                {open && (
                  <div className="border-t border-surface-800 px-3 py-3 flex flex-col gap-2 bg-surface-950/50">
                    {run.errorMessage && (
                      <p className="text-[11px] text-red-400">{run.errorMessage}</p>
                    )}
                    {isLiveSyncRun(run) && (
                      <p className="text-[11px] text-sky-400">Esta corrida todavía está en curso.</p>
                    )}
                    {run.missingAffected > 0 || run.zeroStockAffected > 0 ? (
                      <p className="text-[11px] text-surface-500">
                        {run.missingAffected > 0
                          ? `${run.missingAffected.toLocaleString("es-AR")} faltantes afectados`
                          : null}
                        {run.missingAffected > 0 && run.zeroStockAffected > 0 ? " · " : null}
                        {run.zeroStockAffected > 0
                          ? `${run.zeroStockAffected.toLocaleString("es-AR")} con stock cero afectados`
                          : null}
                      </p>
                    ) : null}
                    {loadingDetail && detail?.id !== run.id ? (
                      <div className="flex items-center gap-2 text-xs text-surface-500 py-2">
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        Cargando cambios…
                      </div>
                    ) : changes.length === 0 ? (
                      <p className="text-[11px] text-surface-500">
                        {run.status === "RUNNING"
                          ? "Los cambios aparecen a medida que se procesan."
                          : "No hubo altas ni cambios de precio, stock o ficha."}
                      </p>
                    ) : (
                      <>
                        <div className="flex items-center gap-1.5">
                          {(["all", "created", "updated"] as const).map((key) => (
                            <button
                              key={key}
                              type="button"
                              onClick={() => setFilter(key)}
                              className={`text-[10px] font-medium rounded-md px-2 py-1 ${
                                filter === key
                                  ? "bg-surface-700 text-white"
                                  : "text-surface-400 hover:text-white"
                              }`}
                            >
                              {key === "all"
                                ? `Todos (${changes.length})`
                                : key === "created"
                                  ? `Nuevos (${changes.filter((c) => c.action === "created").length})`
                                  : `Actualizados (${changes.filter((c) => c.action === "updated").length})`}
                            </button>
                          ))}
                        </div>
                        {run.changesTruncated && (
                          <p className="text-[10px] text-amber-400/90">
                            Se muestran los primeros {run.changesStored.toLocaleString("es-AR")} cambios de esta corrida.
                          </p>
                        )}
                        <ul className="flex flex-col gap-1 max-h-80 overflow-y-auto">
                          {visible.map((change) => (
                            <ChangeRow key={change.id} provider={provider} change={change} />
                          ))}
                        </ul>
                      </>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function ChangeRow({ provider, change }: { provider: Provider; change: CatalogSyncChange }) {
  const created = change.action === "created";
  return (
    <li className="rounded-md border border-surface-800 px-2.5 py-2 flex flex-col gap-1">
      <div className="flex items-start gap-2">
        {created ? (
          <PackagePlus className="w-3.5 h-3.5 text-emerald-400 mt-0.5 flex-shrink-0" />
        ) : (
          <RefreshCw className="w-3.5 h-3.5 text-sky-400 mt-0.5 flex-shrink-0" />
        )}
        <div className="min-w-0 flex-1">
          <Link
            href={`/product/${encodeURIComponent(provider)}/${encodeURIComponent(change.externalId)}`}
            className="text-[12px] text-white hover:underline inline-flex items-center gap-1 min-w-0"
          >
            <span className="truncate">{change.name}</span>
            <ExternalLink className="w-3 h-3 text-surface-500 flex-shrink-0" />
          </Link>
          <p className="text-[10px] text-surface-500 font-mono truncate">{change.externalId}</p>
        </div>
        <span className="text-[10px] font-semibold text-surface-400 flex-shrink-0">
          {created ? "Nuevo" : "Actualizado"}
        </span>
      </div>
      {!created && Array.isArray(change.changedFields) && change.changedFields.length > 0 && (
        <ul className="pl-6 flex flex-col gap-0.5">
          {change.changedFields.map((field) => (
            <li key={field} className="text-[11px] text-surface-400">
              <span className="text-surface-300">{FIELD_LABEL[field] ?? field}:</span>{" "}
              <span className="line-through text-surface-500">{fmtValue(change.before?.[field])}</span>
              {" → "}
              <span className="text-white">{fmtValue(change.after?.[field])}</span>
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}
