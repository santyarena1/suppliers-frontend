"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import PrefsPanel from "@/components/PrefsPanel";
import {
  brandApi,
  myApi,
  type BrandAction,
  type BrandLanding,
  type OwnOrg,
} from "@/lib/api";
import {
  ArrowRight,
  CircleDot,
  ClipboardList,
  FolderOpen,
  GraduationCap,
  Handshake,
  Loader2,
  Megaphone,
  MessageSquare,
  Newspaper,
  Palette,
  QrCode,
  Sparkles,
  Users,
} from "lucide-react";

function progressLabel(action: BrandAction) {
  const unit = action.kind === "PURCHASE_AMOUNT" ? "USD" : "u.";
  const current = action.kind === "PURCHASE_AMOUNT"
    ? action.progress.current.toFixed(0)
    : String(action.progress.current);
  const target = action.progress.target == null ? "—" : String(action.progress.target);
  return `${current} / ${target} ${unit}`;
}

export default function BrandHome() {
  const [org, setOrg] = useState<OwnOrg | null>(null);
  const [landing, setLanding] = useState<BrandLanding | null>(null);
  const [actions, setActions] = useState<BrandAction[]>([]);
  const [retailers, setRetailers] = useState(0);
  const [linkedDistros, setLinkedDistros] = useState(0);
  const [signalCount, setSignalCount] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([myApi.org(), brandApi.landing(), brandApi.actions(), brandApi.accounts(), brandApi.signals()])
      .then(([orgRes, landingRes, actionsRes, accountsRes, signalsRes]) => {
        setOrg(orgRes.data);
        setLanding(landingRes.data);
        setActions(actionsRes.data.actions);
        setRetailers(accountsRes.data.retailers.length);
        setLinkedDistros(accountsRes.data.linkedDistributors?.length ?? 0);
        setSignalCount(signalsRes.data.signals.length);
      })
      .finally(() => setLoading(false));
  }, []);

  const active = actions.filter((a) => a.status === "ACTIVE");
  const met = active.filter((a) => a.progress.met).length;

  return (
    <>
      <header className="flex-shrink-0 border-b border-surface-800 bg-surface-950 px-4 sm:px-6 py-3 flex items-center justify-between">
        <div>
          <h1 className="text-base font-semibold text-white">{org?.name ?? "Marca"}</h1>
          <p className="text-xs text-surface-500 hidden sm:block">
            Mapa de SKUs en distros, semáforos, materiales y el espacio que ven las cuentas vinculadas
          </p>
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
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <Stat label="SKUs en el mapa" value={String(signalCount)} />
                <Stat label="Comercios vinculados" value={String(retailers)} />
                <Stat label="Distros vinculados" value={String(linkedDistros)} />
                <Stat label="Acciones activas" value={String(active.length)} />
              </div>

              <div
                className="rounded-2xl border border-surface-800 p-5"
                style={{
                  background: landing?.primaryColor
                    ? `linear-gradient(135deg, ${landing.primaryColor}55, transparent)`
                    : undefined,
                }}
              >
                <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-widest text-white/80 mb-2">
                  <Sparkles className="w-3.5 h-3.5" />
                  Espacio in-app
                </div>
                <h2 className="text-xl font-bold text-white mb-1">{landing?.headline || org?.name}</h2>
                <p className="text-sm text-white/70 max-w-xl">
                  {landing?.about ||
                    "Elegí productos reales de los distros, armá el semáforo y el precio sugerido. El comercio vinculado entra acá, no a una landing afuera."}
                </p>
                <div className="flex flex-wrap gap-2 mt-4">
                  <Link
                    href="/marca/productos"
                    className="text-xs font-semibold bg-white text-surface-900 rounded-lg px-3 py-1.5 hover:bg-white/90"
                  >
                    Armar el mapa
                  </Link>
                  <Link
                    href="/marca/landing"
                    className="text-xs font-semibold border border-white/30 text-white rounded-lg px-3 py-1.5 hover:bg-white/10"
                  >
                    Editar espacio
                  </Link>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                <HomeLink href="/marca/productos" icon={CircleDot} title="Productos" subtitle="SKUs de distros, semáforo y precio sugerido" />
                <HomeLink href="/marca/materiales" icon={FolderOpen} title="Materiales" subtitle="Fichas, banners y catálogos para el canal" />
                <HomeLink href="/marca/capacitaciones" icon={GraduationCap} title="Capacitaciones" subtitle="Videos, cursos y argumentarios" />
                <HomeLink href="/marca/acciones" icon={ClipboardList} title="Acciones" subtitle="Unidades, USD o rebate con vigencia" />
                <HomeLink href="/marca/cuentas" icon={Handshake} title="Cuentas" subtitle="Comercios y distribuidores en alcance" />
                <HomeLink href="/mensajes" icon={MessageSquare} title="Mensajes" subtitle="Hablá con cada cuenta vinculada" />
                <HomeLink href="/noticias" icon={Newspaper} title="Noticias" subtitle="Novedades con foto y HTML propio" />
                <HomeLink href="/marca/landing" icon={Palette} title="Espacio" subtitle="Estética, HTML y huecos nativos" />
                {org?.canManagePortfolio && (
                  <HomeLink href="/codigos" icon={QrCode} title="Códigos" subtitle="El comercio o el distro canjea en /marcas" />
                )}
                <HomeLink href="/equipo" icon={Users} title="Equipo" subtitle="Marketing, comercial y dueños" />
                {org?.canManagePortfolio && (
                  <HomeLink
                    href="/publicidad"
                    icon={Megaphone}
                    title="Publicidad"
                    subtitle={org.advertisingEnabled ? "Espacios contratados" : "Pedile al admin de NODO que habilite la cuenta"}
                  />
                )}
              </div>

              {active.length > 0 && (
                <section className="border border-surface-800 rounded-xl overflow-hidden">
                  <div className="flex items-center justify-between px-4 py-3 border-b border-surface-800">
                    <h2 className="text-xs font-semibold text-white">En curso · {met} cumplidas</h2>
                    <Link href="/marca/acciones" className="text-[11px] text-brand-400 hover:text-brand-300">
                      Ver todas
                    </Link>
                  </div>
                  {active.slice(0, 6).map((action) => (
                    <div key={action.id} className="px-4 py-2.5 border-t border-surface-800 first:border-t-0">
                      <div className="flex items-center justify-between gap-3 mb-1.5">
                        <p className="text-sm text-surface-200 truncate">{action.title}</p>
                        <span className="text-[11px] text-surface-500 tabular-nums">{progressLabel(action)}</span>
                      </div>
                      <div className="h-1.5 rounded-full bg-surface-800 overflow-hidden">
                        <div
                          className={`h-full ${action.progress.met ? "bg-emerald-500" : "bg-brand-500"}`}
                          style={{ width: `${Math.round(action.progress.ratio * 100)}%` }}
                        />
                      </div>
                    </div>
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
    <div className="bg-surface-900 border border-surface-800 rounded-xl p-4">
      <p className="text-[10px] font-semibold text-surface-500 uppercase tracking-wider">{label}</p>
      <p className="text-2xl font-bold text-white tabular-nums mt-1">{value}</p>
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
  icon: React.ElementType;
  title: string;
  subtitle: string;
}) {
  return (
    <Link href={href} className="bg-surface-900 border border-surface-800 hover:border-surface-600 rounded-xl p-4 transition-all group">
      <Icon className="w-5 h-5 text-brand-400 mb-2" />
      <p className="text-sm font-semibold text-white">{title}</p>
      <p className="text-xs text-surface-500 mt-1">{subtitle}</p>
      <span className="text-[11px] text-brand-400 mt-3 inline-flex items-center gap-1 group-hover:gap-2 transition-all">
        Ir <ArrowRight className="w-3 h-3" />
      </span>
    </Link>
  );
}
