"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2, Merge, Unlink } from "lucide-react";
import { ordersApi, type OpsAliasKind, type PurchaseRankRow } from "@/lib/api";
import { formatUSD } from "@/lib/format";

const KIND_COPY: Record<OpsAliasKind, { noun: string; one: string }> = {
  ADDRESS: { noun: "direcciones", one: "dirección" },
  PAYMENT: { noun: "formas de pago", one: "forma de pago" },
  DELIVERY: { noun: "modos de entrega", one: "modo de entrega" },
  WAREHOUSE: { noun: "sucursales", one: "sucursal" },
};

function pct(n: number) {
  return `${n.toLocaleString("es-AR", { maximumFractionDigits: 1 })}%`;
}

function qty(n: number) {
  return n.toLocaleString("es-AR");
}

type Suggestion = { kind: OpsAliasKind; keys: string[]; labels: string[]; reason: string };

export function UnifyNamedTable({
  kind,
  rows,
  suggestions = [],
  extraHeader,
  extra,
  onReload,
}: {
  kind: OpsAliasKind;
  rows: PurchaseRankRow[];
  suggestions?: Suggestion[];
  extraHeader?: string;
  extra?: (row: PurchaseRankRow) => string;
  onReload: () => Promise<void> | void;
}) {
  const copy = KIND_COPY[kind];
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [label, setLabel] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const mine = suggestions.filter((s) => s.kind === kind);
  const selectedRows = useMemo(() => rows.filter((r) => picked.has(r.key)), [rows, picked]);

  useEffect(() => {
    if (selectedRows.length < 2) return;
    setLabel((cur) => cur || [...selectedRows].sort((a, b) => b.label.length - a.label.length)[0]?.label || "");
  }, [selectedRows]);

  function toggle(key: string) {
    setError(null);
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function pickSuggestion(s: Suggestion) {
    const keys = new Set(s.keys);
    const match = rows.filter((r) => keys.has(r.key) || r.variants?.some((v) => keys.has(v.key)));
    setPicked(new Set(match.map((r) => r.key)));
    setLabel(s.labels.slice().sort((a, b) => b.length - a.length)[0] ?? "");
    setError(null);
  }

  async function run(fn: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await fn();
      setPicked(new Set());
      setLabel("");
      await onReload();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string | string[] } } })?.response?.data?.message;
      setError(Array.isArray(msg) ? msg[0] : msg || "No se pudo guardar la unificación");
    } finally {
      setBusy(false);
    }
  }

  const canUnify = selectedRows.length >= 2;
  const selectedGroup = selectedRows.length === 1 && selectedRows[0].groupId ? selectedRows[0] : null;

  return (
    <div>
      <p className="text-[11px] text-surface-500 mb-2 leading-relaxed">
        Marcá las {copy.noun} que son la misma aunque el distribuidor las haya escrito distinto. Al unificarlas
        cuentan como una {copy.one} real en este comercio.
      </p>
      {mine.length > 0 && (
        <div className="mb-3 flex flex-col gap-1.5">
          <p className="text-[10px] uppercase tracking-wider text-amber-400/80">Se parecen</p>
          {mine.map((s) => (
            <button
              key={s.keys.join("|")}
              type="button"
              onClick={() => pickSuggestion(s)}
              className="text-left text-[11px] border border-amber-500/30 bg-amber-500/10 rounded-lg px-3 py-2 text-amber-100 hover:bg-amber-500/20"
            >
              {s.labels.join(" · ")}
              <span className="block text-amber-200/70">{s.reason} — tocá para seleccionarlas</span>
            </button>
          ))}
        </div>
      )}
      {picked.size > 0 && (
        <div className="mb-3 border border-surface-700 bg-surface-950 rounded-xl p-3 flex flex-col gap-2">
          <p className="text-[11px] text-surface-300">
            {qty(picked.size)} seleccionadas
            {selectedGroup ? " · este grupo ya está unificado" : ""}
          </p>
          {canUnify && (
            <div className="flex flex-col sm:flex-row gap-2">
              <input
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder={`Nombre real de ${copy.one}`}
                className="flex-1 bg-surface-900 border border-surface-700 rounded-lg px-3 py-1.5 text-xs text-white"
              />
              <button
                type="button"
                disabled={busy || !label.trim()}
                onClick={() =>
                  run(() =>
                    ordersApi.unifyAlias({
                      kind,
                      keys: selectedRows.map((r) => r.key),
                      label: label.trim() || selectedRows[0].label,
                    })
                  )
                }
                className="inline-flex items-center justify-center gap-1.5 bg-brand-600 hover:bg-brand-500 disabled:opacity-50 text-white text-xs font-medium rounded-lg px-3 py-1.5"
              >
                {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Merge className="w-3.5 h-3.5" />}
                Unificar
              </button>
            </div>
          )}
          {selectedGroup?.groupId && (
            <div className="flex flex-col sm:flex-row gap-2">
              <input
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder={selectedGroup.label}
                className="flex-1 bg-surface-900 border border-surface-700 rounded-lg px-3 py-1.5 text-xs text-white"
              />
              <button
                type="button"
                disabled={busy || !label.trim()}
                onClick={() => run(() => ordersApi.renameAlias(selectedGroup.groupId!, label.trim()))}
                className="text-xs border border-surface-600 rounded-lg px-3 py-1.5 text-surface-200 hover:bg-surface-800"
              >
                Renombrar
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => run(() => ordersApi.deleteAlias(selectedGroup.groupId!))}
                className="inline-flex items-center justify-center gap-1.5 text-xs border border-red-500/40 text-red-200 rounded-lg px-3 py-1.5 hover:bg-red-500/10"
              >
                <Unlink className="w-3.5 h-3.5" />
                Separar
              </button>
            </div>
          )}
          <button type="button" onClick={() => setPicked(new Set())} className="self-start text-[11px] text-surface-500 hover:text-surface-300">
            Cancelar selección
          </button>
        </div>
      )}
      {error && <p className="text-[11px] text-red-300 mb-2">{error}</p>}
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="text-surface-500">
            <tr className="border-b border-surface-800">
              <th className="w-8 py-2" />
              <th className="text-left font-medium py-2">Detalle</th>
              <th className="text-right font-medium py-2">Share</th>
              <th className="text-right font-medium py-2">Pedidos</th>
              <th className="text-right font-medium py-2">Importe</th>
              {extraHeader && <th className="text-right font-medium py-2">{extraHeader}</th>}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const variants = row.variants ?? [];
              const showVariants = open === row.key && variants.length > 1;
              return (
                <tr key={row.key} className="border-b border-surface-800/60 align-top">
                  <td className="py-1.5 pr-1">
                    <input
                      type="checkbox"
                      checked={picked.has(row.key)}
                      onChange={() => toggle(row.key)}
                      className="accent-brand-500"
                      aria-label={`Seleccionar ${row.label}`}
                    />
                  </td>
                  <td className="py-1.5 text-surface-200 pr-3">
                    <div className="flex flex-col gap-0.5">
                      <span className={row.unified ? "text-white" : ""}>{row.label}</span>
                      {row.unified && (
                        <button
                          type="button"
                          onClick={() => setOpen((v) => (v === row.key ? null : row.key))}
                          className="self-start text-[10px] text-brand-300 hover:text-brand-200"
                        >
                          {variants.length} formas de escribirlo{showVariants ? " ▴" : " ▾"}
                        </button>
                      )}
                      {showVariants && row.groupId && (
                        <ul className="mt-1 space-y-1 text-[11px] text-surface-400">
                          {variants.map((v) => (
                            <li key={v.key} className="flex items-center justify-between gap-2">
                              <span>{v.label} · {v.orders} ped.</span>
                              <button
                                type="button"
                                disabled={busy}
                                onClick={() => run(() => ordersApi.splitAlias(row.groupId!, [v.key]))}
                                className="text-red-300/80 hover:text-red-200"
                              >
                                Sacar
                              </button>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  </td>
                  <td className="py-1.5 text-right tabular-nums text-surface-400">{pct(row.share)}</td>
                  <td className="py-1.5 text-right tabular-nums">{row.orders}</td>
                  <td className="py-1.5 text-right tabular-nums text-white">{formatUSD(row.spendUsd)}</td>
                  {extraHeader && extra && (
                    <td className="py-1.5 text-right tabular-nums text-amber-200">{extra(row)}</td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
