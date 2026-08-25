"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import PrefsPanel from "@/components/PrefsPanel";
import { portfolioApi, type PortfolioSummary } from "@/lib/api";
import { Briefcase, Loader2 } from "lucide-react";

export default function CarteraPage() {
  const [data, setData] = useState<PortfolioSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void portfolioApi.clients()
      .then((res) => setData(res.data))
      .catch((err: unknown) => {
        const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
        setError(msg || "No se pudo cargar la cartera");
      })
      .finally(() => setLoading(false));
  }, []);

  const clients = data?.clients ?? [];

  return (
    <>
      <header className="flex-shrink-0 border-b border-surface-800 bg-surface-950 px-4 sm:px-6 py-3 flex items-center justify-between">
        <div>
          <h1 className="text-base font-semibold text-white">Cartera</h1>
          <p className="text-xs text-surface-500 hidden sm:block">
            Comercios vinculados con {data?.providerName ?? "tu organización"}
          </p>
        </div>
        <PrefsPanel />
      </header>
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 py-6">
          {loading ? (
            <div className="flex justify-center py-16"><Loader2 className="w-5 h-5 animate-spin text-brand-500" /></div>
          ) : error ? (
            <p className="text-sm text-red-400">{error}</p>
          ) : clients.length === 0 ? (
            <div className="text-center py-16">
              <Briefcase className="w-8 h-8 text-surface-600 mx-auto mb-3" />
              <p className="text-sm text-surface-300">Todavía no hay clientes en tu cartera.</p>
              <p className="text-xs text-surface-500 mt-1">Cuando un comercio canjee tu código, aparece acá.</p>
            </div>
          ) : (
            <div className="border border-surface-800 rounded-2xl divide-y divide-surface-800 overflow-hidden">
              {clients.map((client) => (
                <Link
                  key={client.linkId}
                  href={`/cartera/${client.linkId}`}
                  className="flex flex-wrap items-center gap-3 px-4 py-3 hover:bg-surface-800/60"
                >
                  <div className="flex-1 min-w-[160px]">
                    <p className="text-sm font-medium text-white">{client.commerce.name}</p>
                    <p className="text-[11px] text-surface-500">
                      {client.commerce.contactEmail || client.commerce.contactPhone || "Sin contacto cargado"}
                    </p>
                  </div>
                  <p className="text-xs text-surface-400">
                    {client.accountManager ? client.accountManager.username : "Sin vendedor"}
                  </p>
                  <p className="text-xs text-surface-400">
                    {client.discountPercent != null ? `${client.discountPercent}%` : "Sin descuento"}
                  </p>
                  <p className="text-xs text-surface-500">{client.orderSummary.total} pedidos</p>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
