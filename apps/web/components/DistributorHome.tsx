"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import PrefsPanel from "@/components/PrefsPanel";
import BrandDiscountsPanel from "@/components/BrandDiscountsPanel";
import { chatApi, portfolioApi, type PortfolioClient, type PortfolioSummary } from "@/lib/api";
import { canManageDistributor, canSeePortfolio, isProductManager } from "@/lib/distributor";
import { Briefcase, Loader2, MessageSquare, QrCode, Search, ShoppingBag } from "lucide-react";

export default function DistributorHome() {
  if (isProductManager()) return <ProductManagerHome />;
  return <PortfolioHome />;
}

function ProductManagerHome() {
  return (
    <>
      <header className="flex-shrink-0 border-b border-surface-800 bg-surface-950 px-4 sm:px-6 py-3 flex items-center justify-between">
        <div>
          <h1 className="text-base font-semibold text-white">Inicio</h1>
          <p className="text-xs text-surface-500">Tus marcas dentro de este catálogo</p>
        </div>
        <PrefsPanel />
      </header>
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-6 flex flex-col gap-5">
          <Link
            href="/search"
            className="flex items-center gap-3 bg-surface-900 border border-surface-800 hover:border-brand-500/40 rounded-2xl px-4 py-3 transition-colors"
          >
            <Search className="w-5 h-5 text-brand-400" />
            <div>
              <p className="text-sm font-medium text-white">Buscar en tus marcas</p>
              <p className="text-xs text-surface-500">Solo el catálogo de este distribuidor, sin carrito ni otras integraciones.</p>
            </div>
          </Link>
          <BrandDiscountsPanel />
        </div>
      </div>
    </>
  );
}

function PortfolioHome() {
  const [summary, setSummary] = useState<PortfolioSummary | null>(null);
  const [chats, setChats] = useState(0);
  const [loading, setLoading] = useState(true);
  const manage = canManageDistributor();
  const see = canSeePortfolio();

  useEffect(() => {
    if (!see) {
      setLoading(false);
      return;
    }
    void Promise.all([portfolioApi.clients(), chatApi.list()])
      .then(([clients, threads]) => {
        setSummary(clients.data);
        setChats(threads.data.length);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [see]);

  const clients = summary?.clients ?? [];
  const pending = clients.reduce((n, c) => n + c.orderSummary.pendingApproval, 0);

  return (
    <>
      <header className="flex-shrink-0 border-b border-surface-800 bg-surface-950 px-4 sm:px-6 py-3 flex items-center justify-between">
        <div>
          <h1 className="text-base font-semibold text-white">Inicio</h1>
          <p className="text-xs text-surface-500 hidden sm:block">Cartera de {summary?.providerName ?? "tu organización"}</p>
        </div>
        <PrefsPanel />
      </header>
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6 flex flex-col gap-5">
          {loading ? (
            <div className="flex justify-center py-16"><Loader2 className="w-5 h-5 animate-spin text-brand-500" /></div>
          ) : (
            <>
              <div className="grid sm:grid-cols-4 gap-3">
                <HomeCard href="/search" icon={Search} label="Catálogo" value="Buscar" />
                <HomeCard href="/cartera" icon={Briefcase} label="Clientes" value={String(clients.length)} />
                <HomeCard href="/pedidos-clientes" icon={ShoppingBag} label="Pedidos esperando" value={String(pending)} />
                <HomeCard href="/chat" icon={MessageSquare} label="Conversaciones" value={String(chats)} />
              </div>
              {manage && (
                <Link
                  href="/codigos"
                  className="flex items-center gap-3 bg-surface-900 border border-surface-800 hover:border-brand-500/40 rounded-2xl px-4 py-3 transition-colors"
                >
                  <QrCode className="w-5 h-5 text-brand-400" />
                  <div>
                    <p className="text-sm font-medium text-white">Códigos de vinculación</p>
                    <p className="text-xs text-surface-500">Generá un código o un QR para que el comercio se conecte.</p>
                  </div>
                </Link>
              )}
              <RecentClients clients={clients.slice(0, 6)} />
            </>
          )}
        </div>
      </div>
    </>
  );
}

function HomeCard({ href, icon: Icon, label, value }: { href: string; icon: typeof Briefcase; label: string; value: string }) {
  return (
    <Link href={href} className="bg-surface-900 border border-surface-800 hover:border-brand-500/40 rounded-2xl p-4 transition-colors">
      <Icon className="w-4 h-4 text-brand-400 mb-2" />
      <p className="text-2xl font-semibold text-white">{value}</p>
      <p className="text-xs text-surface-500 mt-1">{label}</p>
    </Link>
  );
}

function RecentClients({ clients }: { clients: PortfolioClient[] }) {
  if (clients.length === 0) {
    return (
      <p className="text-sm text-surface-400">Todavía no hay comercios vinculados. Generá un código y pasáselo al local.</p>
    );
  }
  return (
    <section>
      <h2 className="text-sm font-semibold text-white mb-3">Clientes</h2>
      <div className="border border-surface-800 rounded-2xl divide-y divide-surface-800 overflow-hidden">
        {clients.map((client) => (
          <Link key={client.linkId} href={`/cartera/${client.linkId}`} className="flex items-center justify-between px-4 py-3 hover:bg-surface-800/60">
            <div>
              <p className="text-sm text-white">{client.commerce.name}</p>
              <p className="text-[11px] text-surface-500">
                {client.accountManager ? `Vendedor: ${client.accountManager.username}` : "Sin vendedor asignado"}
                {client.discountPercent != null ? ` · ${client.discountPercent}%` : ""}
              </p>
            </div>
            <span className="text-xs text-surface-500">{client.orderSummary.total} pedidos</span>
          </Link>
        ))}
      </div>
    </section>
  );
}
