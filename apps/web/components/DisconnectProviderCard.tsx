"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Unplug, XCircle } from "lucide-react";
import { invalidateMyProviders, myApi, type Provider } from "@/lib/api";
import { providerLabel } from "@/components/ProviderBadge";

interface DisconnectProviderCardProps {
  provider: Provider;
  name?: string;
}

/**
 * Desconectarse de un proveedor: se borra la cuenta cargada, sus precios dejan de
 * mostrarse y se corta el vínculo. Pedidos y listas anteriores quedan en el historial.
 */
export default function DisconnectProviderCard({ provider, name }: DisconnectProviderCardProps) {
  const router = useRouter();
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const label = name || providerLabel(provider);

  async function disconnect() {
    const ok = window.confirm(
      `¿Desconectarte de ${label}?\n\nSe borra la cuenta cargada, sus productos dejan de aparecer en la búsqueda y se corta el vínculo. Tus pedidos anteriores quedan en el historial. Podés volver a conectarte cuando quieras.`
    );
    if (!ok) return;
    setWorking(true);
    setError(null);
    try {
      await myApi.disconnectProvider(provider);
      invalidateMyProviders();
      router.push("/proveedores");
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
      setError(msg || "No se pudo desconectar el proveedor");
      setWorking(false);
    }
  }

  return (
    <div className="border border-red-500/20 rounded-xl p-5 flex flex-col gap-3 mt-5">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-surface-100">Desconectar {label}</p>
          <p className="text-xs text-surface-500 mt-0.5">
            Borra tu cuenta cargada, saca sus productos de la búsqueda y corta el vínculo. El historial de pedidos queda.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void disconnect()}
          disabled={working}
          className="flex items-center gap-1.5 flex-shrink-0 bg-red-500/10 hover:bg-red-500/25 text-red-400 disabled:opacity-40 text-xs font-semibold rounded-lg px-3 py-2 transition-all active:scale-[0.98]"
        >
          {working ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Unplug className="w-3.5 h-3.5" />}
          {working ? "Desconectando…" : "Desconectar"}
        </button>
      </div>
      {error && (
        <div className="flex items-center gap-2 text-xs rounded-lg px-3.5 py-2.5 bg-red-500/8 border border-red-500/20 text-red-400">
          <XCircle className="w-4 h-4 flex-shrink-0" /> {error}
        </div>
      )}
    </div>
  );
}
