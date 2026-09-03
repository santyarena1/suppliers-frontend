"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import PrefsPanel from "@/components/PrefsPanel";
import LatestNewsStrip from "@/components/news/LatestNewsStrip";
import { myApi, type OwnClient, type OwnOrg } from "@/lib/api";
import { formatUSD } from "@/lib/format";
import { ArrowRight, Bell, Building2, ClipboardList, Handshake, Loader2, Megaphone, MessageSquare, Newspaper, QrCode, Users } from "lucide-react";

export default function DistributorHome() {
  const [org, setOrg] = useState<OwnOrg | null>(null);
  const [clients, setClients] = useState<OwnClient[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([myApi.org(), myApi.clients()])
      .then(([orgRes, clientsRes]) => {
        setOrg(orgRes.data);
        setClients(clientsRes.data.clients);
      })
      .finally(() => setLoading(false));
  }, []);

  const activos = clients.filter((client) => client.status === "ACTIVE").length;
  const inactivos = clients.filter((client) => client.inactive);

  return (
    <>
      <header className="flex-shrink-0 border-b border-surface-800 bg-surface-950 px-4 sm:px-6 py-3 flex items-center justify-between">
        <div>
          <h1 className="text-base font-semibold text-white">{org?.name ?? "Distribuidor"}</h1>
          <p className="text-xs text-surface-500 hidden sm:block">Cartera de comercios vinculados</p>
        </div>
        <PrefsPanel />
      </header>
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 py-6 flex flex-col gap-5">
          {loading ? (
            <div className="flex justify-center py-16">
              <Loader2 className="w-5 h-5 animate-spin text-brand-500" />
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <Stat label="Clientes" value={String(clients.length)} />
                <Stat label="Activos" value={String(activos)} />
                <Stat
                  label="Sin pedido reciente"
                  value={String(inactivos.length)}
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                <HomeLink href="/clientes" icon={Handshake} title="Clientes" subtitle="Cartera y vendedores" />
                <HomeLink href="/pedidos" icon={ClipboardList} title="Pedidos" subtitle="Lo que pidieron tus comercios" />
                <HomeLink href="/mensajes" icon={MessageSquare} title="Mensajes" subtitle="El hilo de cada cuenta" />
                <HomeLink href="/marcas" icon={Building2} title="Marcas" subtitle="Las marcas con las que estás vinculado" />
                <HomeLink href="/avisos" icon={Bell} title="Avisos" subtitle="Lo que te mandan las marcas" />
                <HomeLink href="/noticias" icon={Newspaper} title="Noticias" subtitle="Novedades de tu red y las tuyas" />
                {org?.canManagePortfolio && (
                  <HomeLink href="/codigos" icon={QrCode} title="Códigos" subtitle="Vincular un comercio nuevo" />
                )}
                <HomeLink href="/equipo" icon={Users} title="Equipo" subtitle="Vendedores y roles" />
                {org?.canManagePortfolio && (
                  <HomeLink
                    href="/publicidad"
                    icon={Megaphone}
                    title="Publicidad"
                    subtitle={org.advertisingEnabled ? "Espacios, costo y visitas" : "Pedile al admin de NODO que habilite tu cuenta"}
                  />
                )}
              </div>
              <LatestNewsStrip />
              {inactivos.length > 0 && (
                <section className="border border-amber-500/20 bg-amber-500/5 rounded-xl overflow-hidden">
                  <div className="flex items-center justify-between px-4 py-3 border-b border-amber-500/15">
                    <h2 className="text-xs font-semibold text-amber-300">Sin pedido en 30 días</h2>
                    <Link href="/clientes" className="text-[11px] text-brand-400 hover:text-brand-300">
                      Ver cartera
                    </Link>
                  </div>
                  {inactivos.slice(0, 6).map((client) => (
                    <Link
                      key={client.linkId}
                      href={`/clientes/${client.linkId}`}
                      className="flex items-center gap-3 px-4 py-2.5 hover:bg-surface-900/60 border-t border-amber-500/10 first:border-t-0"
                    >
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-surface-200 truncate">{client.client.name}</p>
                        <p className="text-[11px] text-surface-500">
                          {client.accountManager?.username ?? "Sin vendedor"} · {client.ordersCount ?? 0} pedidos
                        </p>
                      </div>
                      <ArrowRight className="w-3.5 h-3.5 text-surface-600" />
                    </Link>
                  ))}
                </section>
              )}
              {clients.slice(0, 6).length > 0 && (
                <section className="border border-surface-800 rounded-xl overflow-hidden">
                  <div className="flex items-center justify-between px-4 py-3 border-b border-surface-800">
                    <h2 className="text-xs font-semibold text-white">Actividad reciente</h2>
                    <Link href="/clientes" className="text-[11px] text-brand-400 hover:text-brand-300">
                      Ver todos
                    </Link>
                  </div>
                  {clients.slice(0, 6).map((client) => (
                    <Link
                      key={client.linkId}
                      href={`/clientes/${client.linkId}`}
                      className="flex items-center gap-3 px-4 py-2.5 hover:bg-surface-900/60 border-t border-surface-800 first:border-t-0"
                    >
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-surface-200 truncate">{client.client.name}</p>
                        <p className="text-[11px] text-surface-500">
                          {client.accountManager?.username ?? "Sin vendedor"} · {client.ordersCount ?? 0} pedidos
                        </p>
                      </div>
                      <span className="text-[11px] text-surface-500 tabular-nums">
                        {client.lastOrderTotal != null ? formatUSD(client.lastOrderTotal) : ""}
                      </span>
                      <ArrowRight className="w-3.5 h-3.5 text-surface-600" />
                    </Link>
                  ))}
                </section>
              )}
            </>
          )}
        </div>
      </div>
    </>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="border border-surface-800 rounded-xl px-4 py-3">
      <p className="text-[11px] text-surface-500 uppercase tracking-wider">{label}</p>
      <p className="text-lg font-semibold text-white mt-1">{value}</p>
    </div>
  );
}

function HomeLink({
  href,
  icon: Icon,
  title,
  subtitle,
}: {
  href: string;
  icon: typeof Handshake;
  title: string;
  subtitle: string;
}) {
  return (
    <Link
      href={href}
      className="border border-surface-800 hover:border-surface-600 rounded-xl px-4 py-3 flex items-center gap-3 transition-colors"
    >
      <Icon className="w-4 h-4 text-brand-400" />
      <div>
        <p className="text-sm text-white">{title}</p>
        <p className="text-[11px] text-surface-500">{subtitle}</p>
      </div>
    </Link>
  );
}
