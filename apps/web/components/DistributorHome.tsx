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
  const [clients, setClients] = useState<PortfolioClient[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void portfolioApi.clients()
      .then((res) => setClients(res.data.clients ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  return (
    <>
      <header className="flex-shrink-0 border-b border-surface-800 bg-surface-950 px-4 sm:px-6 py-3 flex items-center justify-between">
        <div>
          <h1 className="text-base font-semibold text-white">Inicio</h1>
          <p className="text-xs text-surface-500">Marcas, descuentos y cartera de todos los vendedores</p>
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
          <Link
            href="/cartera"
            className="flex items-center gap-3 bg-surface-900 border border-surface-800 hover:border-brand-500/40 rounded-2xl px-4 py-3 transition-colors"
          >
            <Briefcase className="w-5 h-5 text-brand-400" />
            <div>
              <p className="text-sm font-medium text-white">Clientes</p>
              <p className="text-xs text-surface-500">Todos los comercios y qué vendedor tiene cada uno. Solo lectura.</p>
            </div>
          </Link>
          {loading ? (
            <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-brand-500" /></div>
          ) : (
            <RecentClients clients={clients} />
          )}
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
      <p className="text-sm text-surface-400">Todavía no hay comercios vinculados.</p>
    );
  }
  const groups = new Map<string, { label: string; clients: PortfolioClient[] }>();
  for (const client of clients) {
    const key = client.accountManager?.id ?? "sin-vendedor";
    const label = client.accountManager
      ? `Vendedor: ${client.accountManager.username}`
      : "Sin vendedor asignado";
    const group = groups.get(key) ?? { label, clients: [] };
    group.clients.push(client);
    groups.set(key, group);
  }
  const ordered = [...groups.entries()].sort((a, b) => {
    if (a[0] === "sin-vendedor") return 1;
    if (b[0] === "sin-vendedor") return -1;
    return a[1].label.localeCompare(b[1].label, "es");
  });
  return (
    <section>
      <h2 className="text-sm font-semibold text-white mb-3">Clientes</h2>
      <div className="flex flex-col gap-4">
        {ordered.map(([key, group]) => (
          <div key={key}>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-surface-500 mb-1.5">{group.label}</p>
            <div className="border border-surface-800 rounded-2xl divide-y divide-surface-800 overflow-hidden">
              {group.clients.map((client) => (
                <Link key={client.linkId} href={`/cartera/${client.linkId}`} className="flex items-center justify-between px-4 py-3 hover:bg-surface-800/60">
                  <p className="text-sm text-white">{client.commerce.name}</p>
                  <span className="text-xs text-surface-500">{client.orderSummary.total} pedidos</span>
                </Link>
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
