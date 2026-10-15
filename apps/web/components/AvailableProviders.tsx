"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FileSpreadsheet, KeyRound, Loader2, Search } from "lucide-react";
import ProviderBadge from "@/components/ProviderBadge";
import { suppliersApi, type VisibleProvider } from "@/lib/api";
import { connectsByList } from "@/lib/providerDot";

/**
 * Distribuidores de NODO con los que el comercio todavía no está conectado (de
 * los que alguien ya obtuvo el catálogo). No muestra productos: ofrece conectar
 * la cuenta o cargar la lista propia, y recién ahí ve sus precios.
 */
export default function AvailableProviders({ providers, onConnected }: { providers: VisibleProvider[]; onConnected: () => void }) {
  const router = useRouter();
  const [working, setWorking] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [all, setAll] = useState(false);
  const [q, setQ] = useState("");
  // Primero los que se conectan con la cuenta (con API), después los de lista; cada grupo por nombre.
  const sorted = useMemo(
    () =>
      [...providers].sort(
        (a, b) => Number(connectsByList(a.provider)) - Number(connectsByList(b.provider)) || a.name.localeCompare(b.name, "es")
      ),
    [providers]
  );
  const needle = q.trim().toLowerCase();
  const filtered = needle ? sorted.filter((p) => p.name.toLowerCase().includes(needle)) : sorted;
  const shown = all || needle ? filtered : filtered.slice(0, VISIBLE);
  if (providers.length === 0) return null;

  async function connectList(provider: string) {
    setWorking(provider);
    setError(null);
    try {
      await suppliersApi.connectListByProvider(provider);
      onConnected();
      router.push(`/proveedores/${encodeURIComponent(provider)}?tab=lists`);
    } catch (err) {
      setError((err as { response?: { data?: { message?: string } } })?.response?.data?.message ?? "No se pudo conectar");
      setWorking(null);
    }
  }

  return (
    <section aria-labelledby="available-providers">
      <div className="mb-3">
        <h2 id="available-providers" className="text-xs font-semibold uppercase tracking-widest text-surface-400">
          Distribuidores para conectar — {providers.length}
        </h2>
        <p className="mt-1 text-xs text-surface-500">
          Conectá tu cuenta o cargá tu lista de precios: ves tus precios y tu stock, no los de otro comercio.
        </p>
      </div>
      {providers.length > VISIBLE && (
        <label className="mb-3 flex max-w-sm items-center gap-2 rounded-lg border border-surface-800 bg-surface-900 px-3 py-1.5">
          <Search className="h-3.5 w-3.5 text-surface-500" aria-hidden />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar distribuidor"
            aria-label="Buscar distribuidor para conectar"
            className="flex-1 bg-transparent text-xs text-white placeholder:text-surface-600 focus:outline-none"
          />
        </label>
      )}
      {error && <p className="mb-3 rounded-md bg-red-500/10 px-3 py-2 text-xs text-red-300">{error}</p>}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {shown.map(({ provider, name }) =>
          connectsByList(provider) ? (
            <button
              key={provider}
              type="button"
              onClick={() => void connectList(provider)}
              disabled={working !== null}
              className="flex items-center justify-between gap-3 rounded-xl border border-surface-800 bg-surface-900 p-4 text-left transition-all hover:border-surface-600 disabled:opacity-60"
            >
              <ProviderBadge provider={provider} label={name} variant="inline" size="md" />
              <span className="flex flex-shrink-0 items-center gap-1 text-[10px] font-semibold text-sky-300">
                {working === provider ? <Loader2 className="h-3 w-3 animate-spin" /> : <FileSpreadsheet className="h-3 w-3" />} Cargar mi lista
              </span>
            </button>
          ) : (
            <Link
              key={provider}
              href={`/proveedores/${encodeURIComponent(provider)}?tab=credentials`}
              className="flex items-center justify-between gap-3 rounded-xl border border-surface-800 bg-surface-900 p-4 transition-all hover:border-surface-600"
            >
              <ProviderBadge provider={provider} label={name} variant="inline" size="md" />
              <span className="flex flex-shrink-0 items-center gap-1 text-[10px] font-semibold text-amber-300">
                <KeyRound className="h-3 w-3" /> Conectar mi cuenta
              </span>
            </Link>
          )
        )}
      </div>
      {needle && filtered.length === 0 && <p className="mt-2 text-xs text-surface-500">Ninguno se llama así. Si no está, agregalo con «Agregar proveedor».</p>}
      {!needle && filtered.length > VISIBLE && (
        <button type="button" onClick={() => setAll(!all)} className="mt-3 text-xs font-semibold text-brand-300 hover:text-brand-200">
          {all ? "Ver menos" : `Ver los ${filtered.length}`}
        </button>
      )}
    </section>
  );
}

const VISIBLE = 9;
