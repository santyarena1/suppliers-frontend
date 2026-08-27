"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import PrefsPanel from "@/components/PrefsPanel";
import { TENANT_LINK_STATUS_LABELS, myApi, type OwnClient, type OwnPortfolio, type TenantLinkStatus } from "@/lib/api";
import { formatUSD } from "@/lib/format";
import { Handshake, Loader2, MessageSquare } from "lucide-react";

function errMsg(err: unknown, fallback: string) {
  return (err as { response?: { data?: { message?: string } } })?.response?.data?.message ?? fallback;
}

function when(iso: string | null | undefined) {
  if (!iso) return "Sin pedidos";
  return new Date(iso).toLocaleDateString("es-AR");
}

/**
 * Cartera del distribuidor: los comercios vinculados. Un vendedor solo ve
 * las cuentas que le asignaron.
 */
export default function ClientesPage() {
  const [portfolio, setPortfolio] = useState<OwnPortfolio | null>(null);
  const [loading, setLoading] = useState(true);
  const [aviso, setAviso] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<"ALL" | TenantLinkStatus>("ALL");
  const [sellerId, setSellerId] = useState("ALL");
  const [onlyInactive, setOnlyInactive] = useState(false);
  const [onlyMyBrands, setOnlyMyBrands] = useState(true);

  const load = useCallback(async () => {
    try {
      const res = await myApi.clients();
      setPortfolio(res.data);
    } catch (err) {
      setAviso(errMsg(err, "No se pudo cargar la cartera"));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const clients = useMemo(() => {
    const list = portfolio?.clients ?? [];
    const needle = q.trim().toLowerCase();
    return list.filter((client) => {
      if (needle && !client.client.name.toLowerCase().includes(needle)) return false;
      if (status !== "ALL" && client.status !== status) return false;
      if (sellerId === "NONE" && client.accountManager) return false;
      if (sellerId !== "ALL" && sellerId !== "NONE" && client.accountManager?.id !== sellerId) return false;
      if (onlyInactive && !client.inactive) return false;
      if (portfolio?.isProductManager && onlyMyBrands && client.inBrandScope === false) return false;
      return true;
    });
  }, [portfolio, q, status, sellerId, onlyInactive, onlyMyBrands]);

  const inactiveCount = (portfolio?.clients ?? []).filter((client) => client.inactive).length;

  return (
    <>
      <header className="flex-shrink-0 border-b border-surface-800 bg-surface-950 px-4 sm:px-6 py-3 flex items-center justify-between">
        <div>
          <h1 className="text-base font-semibold text-white">Clientes</h1>
          <p className="text-xs text-surface-500 hidden sm:block">
            Comercios vinculados a tu organización
          </p>
        </div>
        <PrefsPanel />
      </header>

      <div className="flex-1 overflow-y-auto">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-5 flex flex-col gap-4">
          {aviso && <p className="text-xs rounded-md px-3 py-2 bg-red-500/10 text-red-400">{aviso}</p>}
          {loading ? (
            <div className="flex justify-center py-16">
              <Loader2 className="w-5 h-5 animate-spin text-brand-500" />
            </div>
          ) : (portfolio?.clients.length ?? 0) === 0 ? (
            <div className="border border-surface-800 rounded-xl p-8 text-center flex flex-col gap-2 items-center">
              <Handshake className="w-8 h-8 text-surface-600" />
              <p className="text-sm text-surface-300">Todavía no hay comercios vinculados.</p>
              <p className="text-xs text-surface-500">
                Generá un código en Códigos y entregáselo al comercio por fuera de NODO.
              </p>
              {portfolio?.canManage && (
                <Link href="/codigos" className="text-xs font-medium text-brand-400 hover:text-brand-300 mt-1">
                  Ir a códigos
                </Link>
              )}
            </div>
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <input
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="Buscar comercio"
                  className="flex-1 min-w-[160px] bg-surface-800 border border-surface-700 rounded-md px-2.5 py-1.5 text-sm text-white placeholder-surface-600 focus:outline-none focus:border-brand-500"
                />
                <select
                  value={status}
                  onChange={(e) => setStatus(e.target.value as "ALL" | TenantLinkStatus)}
                  className="bg-surface-800 border border-surface-700 rounded-md px-2.5 py-1.5 text-xs text-white"
                >
                  <option value="ALL">Todos los estados</option>
                  {Object.entries(TENANT_LINK_STATUS_LABELS).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
                {portfolio?.canAssignSeller && (
                  <select
                    value={sellerId}
                    onChange={(e) => setSellerId(e.target.value)}
                    className="bg-surface-800 border border-surface-700 rounded-md px-2.5 py-1.5 text-xs text-white"
                  >
                    <option value="ALL">Todos los vendedores</option>
                    <option value="NONE">Sin asignar</option>
                    {(portfolio?.sellers ?? []).map((seller) => (
                      <option key={seller.userId} value={seller.userId}>
                        {seller.username}
                      </option>
                    ))}
                  </select>
                )}
                <label className="flex items-center gap-1.5 text-xs text-surface-400">
                  <input
                    type="checkbox"
                    checked={onlyInactive}
                    onChange={(e) => setOnlyInactive(e.target.checked)}
                    className="accent-brand-600"
                  />
                  Sin pedido reciente{inactiveCount > 0 ? ` (${inactiveCount})` : ""}
                </label>
                {portfolio?.isProductManager && (
                  <label className="flex items-center gap-1.5 text-xs text-surface-400">
                    <input
                      type="checkbox"
                      checked={onlyMyBrands}
                      onChange={(e) => setOnlyMyBrands(e.target.checked)}
                      className="accent-brand-600"
                    />
                    Solo mis marcas{portfolio.managedBrands?.length ? ` (${portfolio.managedBrands.join(", ")})` : ""}
                  </label>
                )}
              </div>
              {clients.length === 0 ? (
                <p className="text-xs text-surface-500">Ningún comercio coincide con el filtro.</p>
              ) : (
                <div className="border border-surface-800 rounded-xl divide-y divide-surface-800 overflow-hidden">
                  {clients.map((client) => (
                    <ClientRow key={client.linkId} client={client} />
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </>
  );
}

function ClientRow({ client }: { client: OwnClient }) {
  return (
    <div className="flex flex-wrap items-center gap-3 px-4 py-3 hover:bg-surface-900/60 transition-colors">
      <Link href={`/clientes/${client.linkId}`} className="flex-1 min-w-[160px]">
        <p className="text-sm text-white">{client.client.name}</p>
        <p className="text-[11px] text-surface-500">
          {client.accountManager ? `Vendedor: ${client.accountManager.username}` : "Sin vendedor asignado"}
        </p>
      </Link>
      {client.inactive && (
        <span className="text-[10px] font-medium uppercase tracking-wide text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded-full px-2 py-0.5">
          Inactivo
        </span>
      )}
      <span className="text-[11px] text-surface-400">{TENANT_LINK_STATUS_LABELS[client.status]}</span>
      <span className="text-[11px] text-surface-400 tabular-nums">
        {client.discountPercent != null ? `${client.discountPercent}%` : "Sin dto."}
      </span>
      <span className="text-[11px] text-surface-500 tabular-nums">
        {client.ordersCount ?? 0} pedidos · {when(client.lastOrderAt)}
        {client.lastOrderTotal != null ? ` · ${formatUSD(client.lastOrderTotal)}` : ""}
      </span>
      {client.status !== "REVOKED" && (
        <Link
          href={`/mensajes?linkId=${client.linkId}`}
          className="w-10 h-10 flex items-center justify-center rounded-full text-surface-500 hover:text-brand-300 hover:bg-surface-800"
          aria-label="Abrir chat"
          title="Hablar"
        >
          <MessageSquare className="w-4 h-4" />
        </Link>
      )}
    </div>
  );
}
