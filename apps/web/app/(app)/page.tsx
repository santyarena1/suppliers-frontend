"use client";

export const dynamic = "force-dynamic";

import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import PrefsPanel from "@/components/PrefsPanel";
import { ALL_PROVIDERS, credentialsApi, Provider } from "@/lib/api";
import { usePrefs } from "@/lib/prefs";
import { useCart } from "@/lib/cart";
import { getRecentSearches, getTopSearches, SearchEntry, trackSearch } from "@/lib/history";
import { PROVIDER_TEXT_COLOR } from "@/lib/providerColors";
import {
  Search, TrendingUp, Clock, ArrowRight, ShoppingCart, Key,
  Sparkles, Zap, Cpu, Monitor, HardDrive, Smartphone, Gamepad2,
  Wifi, Mouse, Battery, Building2, DollarSign, ChevronRight,
  Package, BarChart3
} from "lucide-react";

const CATEGORY_SHORTCUTS = [
  { label: "Procesadores", q: "procesador", icon: Cpu },
  { label: "Placas de video", q: "rtx", icon: Monitor },
  { label: "SSD", q: "ssd", icon: HardDrive },
  { label: "Memoria RAM", q: "ddr4", icon: BarChart3 },
  { label: "Monitores", q: "monitor", icon: Monitor },
  { label: "Notebooks", q: "notebook", icon: Smartphone },
  { label: "Periféricos", q: "teclado", icon: Mouse },
  { label: "Gaming", q: "gaming", icon: Gamepad2 },
  { label: "Routers", q: "router", icon: Wifi },
  { label: "UPS / Energía", q: "ups", icon: Battery },
];

const POPULAR_QUERIES = [
  "Ryzen 5 5600", "RTX 4060", "SSD 1TB NVMe",
  "Notebook Lenovo", "Monitor 27 144hz", "Teclado mecánico",
];

const HERO_SLIDES = [
  {
    title: "Comparativa en tiempo real",
    subtitle: "Consultá precios de 14 mayoristas en una sola búsqueda",
    gradient: "from-brand-700 via-brand-600 to-purple-600",
    accent: "Búsqueda unificada",
    icon: Search,
  },
  {
    title: "Cotizaciones para WhatsApp",
    subtitle: "Generá presupuestos listos para enviar a tus clientes",
    gradient: "from-emerald-700 via-emerald-600 to-teal-600",
    accent: "Carrito profesional",
    icon: ShoppingCart,
  },
  {
    title: "Conversión automática",
    subtitle: "USD ↔ ARS con tipo de dólar configurable",
    gradient: "from-amber-700 via-orange-600 to-red-600",
    accent: "Dólar Blue · Oficial · MEP",
    icon: DollarSign,
  },
];

export default function HomePage() {
  const router = useRouter();
  const { currency, currentRate, dollarLabel, dollarType } = usePrefs();
  const { totalCount, items: cartItems } = useCart();

  const [query, setQuery] = useState("");
  const [recent, setRecent] = useState<SearchEntry[]>([]);
  const [top, setTop] = useState<SearchEntry[]>([]);
  const [heroIdx, setHeroIdx] = useState(0);
  const [configuredProviders, setConfiguredProviders] = useState<Set<Provider>>(new Set());

  useEffect(() => {
    setRecent(getRecentSearches(6));
    setTop(getTopSearches(6));
  }, []);

  useEffect(() => {
    credentialsApi.mine().then((res) => {
      setConfiguredProviders(new Set(res.data.map((c) => c.providerName)));
    }).catch(() => {});
  }, []);

  useEffect(() => {
    const t = setInterval(() => setHeroIdx((i) => (i + 1) % HERO_SLIDES.length), 6000);
    return () => clearInterval(t);
  }, []);

  function go(q: string) {
    trackSearch(q);
    router.push(`/search?q=${encodeURIComponent(q)}`);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (query.trim()) go(query.trim());
  }

  const hero = HERO_SLIDES[heroIdx];
  const HeroIcon = hero.icon;

  const cartProviders = useMemo(() => Array.from(new Set(cartItems.map((it) => it.provider))), [cartItems]);

  return (
    <>
          <header className="flex-shrink-0 border-b border-surface-800 bg-surface-950 px-4 sm:px-6 py-3 flex items-center justify-between">
            <div>
              <h1 className="text-base font-semibold text-white">Inicio</h1>
              <p className="text-xs text-surface-500 hidden sm:block">Buscador unificado de productos mayoristas</p>
            </div>
            <PrefsPanel />
          </header>

          <div className="flex-1 overflow-y-auto">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4 sm:py-6 flex flex-col gap-5 sm:gap-6">

              {/* HERO */}
              <section className={`relative overflow-hidden rounded-3xl border border-surface-800 bg-gradient-to-br ${hero.gradient} p-5 sm:p-8 lg:p-10 transition-all duration-700`}>
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,_rgba(255,255,255,0.15),_transparent_60%)] pointer-events-none" />
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_bottom_left,_rgba(0,0,0,0.3),_transparent_60%)] pointer-events-none" />

                <div className="relative grid lg:grid-cols-[1.3fr_1fr] gap-6 items-center">
                  <div>
                    <div className="inline-flex items-center gap-2 text-[11px] font-semibold uppercase tracking-widest text-white/85 bg-white/10 backdrop-blur-sm border border-white/20 rounded-full px-3 py-1 mb-4">
                      <Sparkles className="w-3 h-3" />
                      {hero.accent}
                    </div>
                    <h2 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-white text-balance leading-tight mb-3">
                      {hero.title}
                    </h2>
                    <p className="text-sm sm:text-base text-white/85 max-w-lg text-balance">{hero.subtitle}</p>

                    <form onSubmit={handleSubmit} className="mt-5 sm:mt-6 flex gap-2 max-w-xl">
                      <div className="relative flex-1">
                        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-surface-500 pointer-events-none" />
                        <input
                          type="text"
                          value={query}
                          onChange={(e) => setQuery(e.target.value)}
                          placeholder="¿Qué producto buscás?"
                          className="w-full bg-white/95 text-surface-900 placeholder:text-gray-500 rounded-xl pl-11 pr-4 py-3 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-white shadow-lg"
                        />
                      </div>
                      <button type="submit" className="bg-surface-900 hover:bg-black text-white font-semibold rounded-xl px-4 sm:px-5 py-3 transition-all shadow-lg text-sm whitespace-nowrap">
                        Buscar
                      </button>
                    </form>

                    <div className="flex gap-1.5 mt-5">
                      {HERO_SLIDES.map((_, i) => (
                        <button
                          key={i}
                          onClick={() => setHeroIdx(i)}
                          className={`h-1.5 rounded-full transition-all ${i === heroIdx ? "bg-white w-8" : "bg-white/40 w-1.5 hover:bg-white/60"}`}
                        />
                      ))}
                    </div>
                  </div>

                  <div className="hidden lg:flex items-center justify-center">
                    <div className="w-44 h-44 bg-white/10 backdrop-blur-sm border border-white/20 rounded-3xl flex items-center justify-center">
                      <HeroIcon className="w-20 h-20 text-white/80" strokeWidth={1.5} />
                    </div>
                  </div>
                </div>
              </section>

              {/* Stats */}
              <section className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                <StatCard label="Proveedores activos" value={configuredProviders.size} total={ALL_PROVIDERS.length} icon={Building2} href="/proveedores" accent="brand" />
                <StatCard label={`Dólar ${dollarLabel(dollarType)}`} value={currentRate ? `$${currentRate.venta.toLocaleString("es-AR")}` : "—"} icon={DollarSign} accent="emerald" detail={currency === "USD" ? "Mostrando en USD" : "Convertido a ARS"} />
                <StatCard label="Carrito" value={totalCount} detail={cartProviders.length > 0 ? `${cartProviders.length} proveedor${cartProviders.length !== 1 ? "es" : ""}` : "Vacío"} icon={ShoppingCart} href="/cart" accent="orange" />
                <StatCard label="Búsquedas guardadas" value={top.length} detail="Historial local" icon={Clock} accent="purple" />
              </section>

              {/* Categories */}
              <section>
                <SectionTitle icon={Zap} title="Buscar por categoría" />
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2.5">
                  {CATEGORY_SHORTCUTS.map(({ label, q, icon: Icon }) => (
                    <button
                      key={q}
                      onClick={() => go(q)}
                      className="group bg-surface-900 hover:bg-surface-800 border border-surface-800 hover:border-surface-600 rounded-xl p-3 flex items-center gap-2.5 transition-all text-left"
                    >
                      <div className="w-9 h-9 bg-surface-800 group-hover:bg-brand-600/20 rounded-lg flex items-center justify-center transition-colors flex-shrink-0">
                        <Icon className="w-4 h-4 text-surface-400 group-hover:text-brand-400 transition-colors" />
                      </div>
                      <span className="text-sm text-surface-200 group-hover:text-white font-medium transition-colors flex-1 truncate">
                        {label}
                      </span>
                      <ChevronRight className="w-3.5 h-3.5 text-surface-700 group-hover:text-surface-400 transition-colors flex-shrink-0" />
                    </button>
                  ))}
                </div>
              </section>

              {/* History */}
              <section className="grid lg:grid-cols-2 gap-4">
                <Panel icon={TrendingUp} title="Tus búsquedas más frecuentes" iconColor="text-orange-700 dark:text-orange-400">
                  {top.length === 0 ? (
                    <div className="flex flex-col gap-2 mt-1">
                      <p className="text-xs text-surface-500 mb-1">Aún no hay historial. Probá estas sugerencias:</p>
                      <div className="flex flex-wrap gap-1.5">
                        {POPULAR_QUERIES.map((q) => (
                          <button key={q} onClick={() => go(q)} className="text-xs text-surface-300 hover:text-white bg-surface-800 hover:bg-surface-700 border border-surface-700 rounded-full px-3 py-1 transition-all">
                            {q}
                          </button>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <ul className="flex flex-col">
                      {top.map((e, i) => (
                        <li key={e.query}>
                          <button onClick={() => go(e.query)} className="w-full flex items-center gap-3 py-2.5 px-2 hover:bg-surface-800 rounded-lg group text-left transition-colors border-b border-surface-800/50 last:border-0">
                            <span className="w-5 text-center text-sm font-bold text-surface-500">{i + 1}</span>
                            <Search className="w-3.5 h-3.5 text-surface-600 group-hover:text-brand-400" />
                            <span className="text-sm text-surface-200 group-hover:text-white flex-1 truncate">{e.query}</span>
                            <span className="text-[10px] text-surface-500 tabular-nums">{e.count}×</span>
                            <ArrowRight className="w-3.5 h-3.5 text-surface-700 group-hover:text-surface-400" />
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </Panel>

                <Panel icon={Clock} title="Últimas búsquedas" iconColor="text-brand-700 dark:text-brand-400">
                  {recent.length === 0 ? (
                    <p className="text-xs text-surface-500">Vas a ver acá las búsquedas que hagas recientemente.</p>
                  ) : (
                    <ul className="flex flex-col">
                      {recent.map((e) => (
                        <li key={e.query}>
                          <button onClick={() => go(e.query)} className="w-full flex items-center gap-3 py-2.5 px-2 hover:bg-surface-800 rounded-lg group text-left transition-colors border-b border-surface-800/50 last:border-0">
                            <Clock className="w-3.5 h-3.5 text-surface-600 group-hover:text-brand-400" />
                            <span className="text-sm text-surface-200 group-hover:text-white flex-1 truncate">{e.query}</span>
                            <span className="text-[10px] text-surface-500">{relativeTime(e.lastAt)}</span>
                            <ArrowRight className="w-3.5 h-3.5 text-surface-700 group-hover:text-surface-400" />
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </Panel>
              </section>

              {/* Providers */}
              <section>
                <SectionTitle icon={Building2} title="Proveedores disponibles" right={
                  <Link href="/proveedores" className="text-xs text-brand-400 hover:text-brand-300 font-medium flex items-center gap-1">
                    Administrar <ArrowRight className="w-3 h-3" />
                  </Link>
                } />
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-7 gap-2">
                  {ALL_PROVIDERS.map((p) => {
                    const configured = configuredProviders.has(p);
                    return (
                      <button
                        key={p}
                        onClick={() => router.push(configured ? `/proveedores/${p}` : `/proveedores/${p}?tab=credentials`)}
                        className={`relative bg-surface-900 border rounded-lg p-3 transition-all hover:scale-[1.02] text-left ${
                          configured ? "border-surface-700 hover:border-brand-500" : "border-surface-800 hover:border-surface-600 opacity-70"
                        }`}
                      >
                        <span className={`text-[11px] font-bold leading-tight block ${PROVIDER_TEXT_COLOR[p] || "text-surface-400"}`}>
                          {p.replace(/_/g, " ")}
                        </span>
                        <span className={`text-[9px] mt-1 flex items-center gap-1 ${configured ? "text-emerald-700 dark:text-emerald-400" : "text-surface-600"}`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${configured ? "bg-emerald-500 dark:bg-emerald-400" : "bg-surface-700"}`} />
                          {configured ? "Configurado" : "Sin credencial"}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </section>

              {/* CTAs */}
              <section className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3 mb-6">
                <CtaCard href="/proveedores" icon={Key} title="Cargar cuentas" description="Cada usuario conecta su usuario y contraseña de cada proveedor" color="brand" />
                <CtaCard href="/cart" icon={ShoppingCart} title="Ver carrito" description={`${totalCount} ${totalCount === 1 ? "unidad" : "unidades"} de ${cartProviders.length} proveedor${cartProviders.length !== 1 ? "es" : ""}`} color="emerald" />
                <CtaCard href="/search" icon={Package} title="Buscar productos" description="Consultá precios actualizados de los proveedores configurados" color="orange" />
              </section>
            </div>
          </div>
    </>
  );
}

function SectionTitle({ icon: Icon, title, right }: { icon: React.ElementType; title: string; right?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between mb-3">
      <h3 className="flex items-center gap-2 text-sm font-semibold text-white">
        <Icon className="w-4 h-4 text-brand-700 dark:text-brand-400" />
        {title}
      </h3>
      {right}
    </div>
  );
}

function Panel({ icon: Icon, title, iconColor = "text-brand-700 dark:text-brand-400", children }: {
  icon: React.ElementType; title: string; iconColor?: string; children: React.ReactNode;
}) {
  return (
    <div className="bg-surface-900 border border-surface-800 rounded-2xl p-5">
      <div className="flex items-center gap-2 mb-4">
        <div className="w-7 h-7 rounded-lg bg-surface-800 flex items-center justify-center">
          <Icon className={`w-3.5 h-3.5 ${iconColor}`} />
        </div>
        <h3 className="text-sm font-semibold text-white">{title}</h3>
      </div>
      {children}
    </div>
  );
}

function StatCard({ label, value, total, detail, icon: Icon, accent, href }: {
  label: string; value: number | string; total?: number; detail?: string; icon: React.ElementType; accent: string; href?: string;
}) {
  const accentColors: Record<string, string> = {
    brand: "text-brand-700 dark:text-brand-400 bg-brand-600/10",
    emerald: "text-emerald-700 dark:text-emerald-400 bg-emerald-600/10",
    orange: "text-orange-700 dark:text-orange-400 bg-orange-600/10",
    purple: "text-purple-700 dark:text-purple-400 bg-purple-600/10",
  };
  const inner = (
    <>
      <div className="flex items-center gap-2.5 mb-2">
        <div className={`w-7 h-7 rounded-lg flex items-center justify-center ${accentColors[accent]}`}>
          <Icon className="w-3.5 h-3.5" />
        </div>
        <span className="text-[10px] font-semibold text-surface-500 uppercase tracking-wider truncate">{label}</span>
      </div>
      <div className="flex items-baseline gap-1">
        <span className="text-xl sm:text-2xl font-bold text-white tabular-nums">{value}</span>
        {total != null && <span className="text-sm text-surface-500 tabular-nums">/ {total}</span>}
      </div>
      {detail && <p className="text-[11px] text-surface-500 mt-1 truncate">{detail}</p>}
    </>
  );
  const cls = `bg-surface-900 border border-surface-800 rounded-xl p-4 transition-all ${href ? "hover:border-surface-600 cursor-pointer" : ""}`;
  return href ? <Link href={href} className={cls}>{inner}</Link> : <div className={cls}>{inner}</div>;
}

function CtaCard({ href, icon: Icon, title, description, color }: {
  href: string; icon: React.ElementType; title: string; description: string; color: string;
}) {
  const colors: Record<string, string> = {
    brand: "from-brand-600/15 to-brand-800/5 border-brand-600/20 hover:border-brand-500/50 text-brand-700 dark:text-brand-400",
    emerald: "from-emerald-600/15 to-emerald-800/5 border-emerald-600/20 hover:border-emerald-500/50 text-emerald-700 dark:text-emerald-400",
    orange: "from-orange-600/15 to-orange-800/5 border-orange-600/20 hover:border-orange-500/50 text-orange-700 dark:text-orange-400",
  };
  return (
    <Link href={href} className={`bg-gradient-to-br ${colors[color]} border rounded-2xl p-5 transition-all group`}>
      <Icon className="w-6 h-6 mb-3" />
      <h4 className="text-sm font-semibold text-white mb-1.5">{title}</h4>
      <p className="text-xs text-surface-400 leading-relaxed mb-3">{description}</p>
      <span className="text-xs font-medium flex items-center gap-1 group-hover:gap-2 transition-all">
        Ir <ArrowRight className="w-3 h-3" />
      </span>
    </Link>
  );
}

function relativeTime(ts: number): string {
  const diff = Date.now() - ts;
  const m = Math.floor(diff / 60000);
  if (m < 1) return "ahora";
  if (m < 60) return `hace ${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `hace ${h}h`;
  const d = Math.floor(h / 24);
  if (d < 7) return `hace ${d}d`;
  return new Date(ts).toLocaleDateString("es-AR", { day: "2-digit", month: "short" });
}
