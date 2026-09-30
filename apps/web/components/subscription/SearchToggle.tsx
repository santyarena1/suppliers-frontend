"use client";

import { useState } from "react";
import Link from "next/link";
import { Loader2, Search, X } from "lucide-react";
import { myApi, type Provider } from "@/lib/api";
import { planErrorOf, searchLimitMessage } from "@/lib/plans";

function errMsg(err: unknown, fallback: string) {
  return (err as { response?: { data?: { message?: string } } })?.response?.data?.message ?? fallback;
}

/**
 * "Incluir en búsqueda" ON/OFF de un proveedor. Apagarlo no desconecta nada:
 * credenciales, lista y vínculo quedan igual. Con NODO Base, prender un 6º abre
 * el aviso del tope con la opción de pasar a Pro.
 */
export default function SearchToggle({
  provider,
  name,
  inSearch,
  onChanged,
}: {
  provider: Provider;
  name: string;
  inSearch: boolean;
  onChanged: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [limit, setLimit] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function toggle() {
    setBusy(true);
    setError(null);
    try {
      await myApi.setIncludeInSearch(provider, !inSearch);
      onChanged();
    } catch (err) {
      const plan = planErrorOf(err);
      if (plan?.code === "PLAN_SEARCH_LIMIT") {
        const max = Number(plan.details?.maxSearchProviders) || undefined;
        setLimit(plan.message || searchLimitMessage(max));
      } else {
        setError(errMsg(err, "No se pudo cambiar"));
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-1.5 text-[11px] text-surface-400">
          <Search className="h-3 w-3" /> Incluir en búsqueda
        </span>
        <button
          type="button"
          role="switch"
          aria-checked={inSearch}
          aria-label={`Incluir ${name} en la búsqueda`}
          onClick={toggle}
          disabled={busy}
          className={`relative inline-flex h-5 w-9 flex-shrink-0 items-center rounded-full transition-colors disabled:opacity-60 ${
            inSearch ? "bg-brand-600" : "bg-surface-700"
          }`}
        >
          {busy ? (
            <Loader2 className="mx-auto h-3 w-3 animate-spin text-white" />
          ) : (
            <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${inSearch ? "translate-x-4" : "translate-x-0.5"}`} />
          )}
        </button>
      </div>
      {error && <p className="text-[11px] text-red-400">{error}</p>}
      {limit && <SearchLimitDialog message={limit} onClose={() => setLimit(null)} />}
    </>
  );
}

export function SearchLimitDialog({ message, onClose }: { message: string; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="search-limit-title"
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md rounded-2xl border border-surface-700 bg-surface-900 p-5 shadow-xl"
      >
        <div className="flex items-start justify-between gap-3">
          <h2 id="search-limit-title" className="text-base font-semibold text-white">
            Llegaste al tope de tu plan
          </h2>
          <button type="button" onClick={onClose} aria-label="Cerrar" className="text-surface-400 hover:text-white">
            <X className="h-4 w-4" />
          </button>
        </div>
        <p className="mt-3 text-sm text-surface-300">{message}</p>
        <p className="mt-2 text-xs text-surface-500">Tus distribuidores siguen conectados: solo cambia en cuáles buscás a la vez.</p>
        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-surface-700 px-3 py-1.5 text-sm text-surface-200 hover:bg-surface-800"
          >
            Entendido
          </button>
          <Link href="/suscripcion" className="rounded-xl bg-brand-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-brand-500">
            Pasar a NODO Pro
          </Link>
        </div>
      </div>
    </div>
  );
}
