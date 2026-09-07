"use client";

export const dynamic = "force-dynamic";

import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import PrefsPanel from "@/components/PrefsPanel";
import DistributorHome from "@/components/org/DistributorHome";
import BrandHome from "@/components/org/BrandHome";
import { credentialsApi, Provider } from "@/lib/api";
import { getTenant } from "@/lib/auth";
import { useMyProviders } from "@/lib/myProviders";
import { usePrefs } from "@/lib/prefs";
import { useCart } from "@/lib/cart";
import { getRecentSearches, getTopSearches, SearchEntry, trackSearch } from "@/lib/history";
import { useProviderDisplay } from "@/lib/providerDisplay";
import {
  Search, ArrowUpRight, ShoppingCart, Key, Package, UserCog, Loader2,
} from "lucide-react";

/**
 * Módulo Inicio.
 *
 * El buscador es la página. Lo que antes eran cuatro tarjetas de dashboard baja
 * a una línea de estado, y el "8 de 14" se convierte en el rail de proveedores:
 * cada uno con su color, su estado de credencial y clickeable. Está toda la
 * información que había antes; solo cambia de forma.
 */

const CATEGORY_SHORTCUTS = [
  { label: "Procesadores", q: "procesador" },
  { label: "Placas de video", q: "rtx" },
  { label: "SSD", q: "ssd" },
  { label: "Memoria RAM", q: "ddr4" },
  { label: "Monitores", q: "monitor" },
  { label: "Notebooks", q: "notebook" },
  { label: "Periféricos", q: "teclado" },
  { label: "Gaming", q: "gaming" },
  { label: "Routers", q: "router" },
  { label: "UPS / Energía", q: "ups" },
];

const POPULAR_QUERIES = [
  "Ryzen 5 5600", "RTX 4060", "SSD 1TB NVMe",
  "Notebook Lenovo", "Monitor 27 144hz", "Teclado mecánico",
];

export default function HomePage() {
  const tenant = getTenant();
  if (tenant?.type === "DISTRIBUTOR") return <DistributorHome />;
  if (tenant?.type === "BRAND") return <BrandHome />;
  return <RetailerHome />;
}

function RetailerHome() {
  const router = useRouter();
  const { currency, currentRate, dollarLabel, dollarType } = usePrefs();
  const { totalCount, items: cartItems } = useCart();
  const tenant = getTenant();
  const canTeam = tenant?.role === "OWNER" || tenant?.role === "ADMIN";
  const display = useProviderDisplay();

  const [query, setQuery] = useState("");
  const [recent, setRecent] = useState<SearchEntry[]>([]);
  const [top, setTop] = useState<SearchEntry[]>([]);
  const [configuredProviders, setConfiguredProviders] = useState<Set<Provider>>(new Set());
  const [loadingCredentials, setLoadingCredentials] = useState(true);
  const { providers: myProviders, loading: loadingProviders } = useMyProviders();

  useEffect(() => {
    setRecent(getRecentSearches(6));
    setTop(getTopSearches(6));
  }, []);

  useEffect(() => {
    let alive = true;
    setLoadingCredentials(true);
    credentialsApi.mine()
      .then((res) => {
        if (!alive) return;
        setConfiguredProviders(new Set(res.data.map((c) => c.providerName)));
      })
      .catch(() => {})
      .finally(() => {
        if (alive) setLoadingCredentials(false);
      });
    return () => { alive = false; };
  }, []);

  function go(q: string) {
    trackSearch(q);
    router.push(`/search?q=${encodeURIComponent(q)}`);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (query.trim()) go(query.trim());
  }

  const cartProviders = useMemo(
    () => Array.from(new Set(cartItems.map((it) => it.provider))),
    [cartItems],
  );
  const configuredCount = myProviders.filter((p) => configuredProviders.has(p.provider)).length;
  const missingCount = loadingCredentials ? 0 : myProviders.length - configuredCount;

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
        <div className="hm max-w-7xl mx-auto px-4 sm:px-6 py-6 sm:py-10">
          <div className="hm__mesh" aria-hidden="true" />

          <h2 className="hm__q">Buscá una vez. Te responden todos.</h2>

          <form onSubmit={handleSubmit} className="hm__field">
            <div className="hm__input">
              <Search className="w-4 h-4 flex-shrink-0" style={{ color: "var(--hm-faint)" }} />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Nombre, part number, EAN o código del distribuidor"
                aria-label="Buscar producto"
              />
            </div>
            <button type="submit" className="hm__go">
              Buscar
            </button>
          </form>

          {/* El estado de tu operación, en una línea */}
          <p className="hm__state hm-mono">
            <span>
              <Link href="/proveedores">
                <b>{loadingCredentials ? "…" : configuredCount}</b> de {myProviders.length} proveedores
                configurados
              </Link>
            </span>
            <span>
              dólar {dollarLabel(dollarType)}{" "}
              <b>{currentRate ? currentRate.venta.toLocaleString("es-AR") : "—"}</b>
              {currency === "USD" ? " · mostrando en USD" : ""}
            </span>
            <span>
              <Link href="/cart">
                carrito <b>{totalCount}</b>
                {cartProviders.length > 0
                  ? ` · ${cartProviders.length} proveedor${cartProviders.length !== 1 ? "es" : ""}`
                  : " · vacío"}
              </Link>
            </span>
            <span>
              <b>{top.length}</b> búsquedas guardadas
            </span>
            {missingCount > 0 && (
              <span className="is-warn">
                <Link href="/proveedores">
                  {missingCount} sin credencial
                </Link>
              </span>
            )}
          </p>

          <div className="hm__sug">
            <span>Categorías</span>
            {CATEGORY_SHORTCUTS.map(({ label, q }) => (
              <button key={q} type="button" className="hm__chip" onClick={() => go(q)}>
                {label}
              </button>
            ))}
          </div>

          {/* Proveedores: el estado de cada uno, tocable */}
          <div className="hm__sec">
            <h3>Tus proveedores</h3>
            <Link href="/proveedores">
              Administrar <ArrowUpRight className="w-3 h-3" />
            </Link>
          </div>

          {loadingProviders ? (
            <p className="hm__empty flex items-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin" />
              Cargando proveedores…
            </p>
          ) : myProviders.length === 0 ? (
            <p className="hm__empty">
              Todavía no estás conectado con ningún proveedor.{" "}
              <Link href="/proveedores">Canjeá el código que te dieron</Link> para empezar.
            </p>
          ) : (
            <div className="hm__rail">
              {myProviders.map(({ provider: p, name }) => {
                const configured = configuredProviders.has(p);
                const credUnknown = loadingCredentials;
                const color = display.textColor(p);
                return (
                  <button
                    key={p}
                    type="button"
                    className="hm__prov"
                    data-state={credUnknown || configured ? "on" : "off"}
                    style={color ? ({ ["--pv"]: color } as React.CSSProperties) : undefined}
                    onClick={() =>
                      router.push(
                        credUnknown || configured
                          ? `/proveedores/${p}`
                          : `/proveedores/${p}?tab=credentials`,
                      )
                    }
                  >
                    <span className="hm__prov-name">{name}</span>
                    <span className="hm__prov-note hm-mono">
                      {credUnknown ? "…" : configured ? "Configurado" : "Sin credencial"}
                    </span>
                  </button>
                );
              })}
            </div>
          )}

          {/* Historial */}
          <div className="hm__sec">
            <h3>Tu historial</h3>
          </div>

          <div className="hm__cols">
            <div>
              <p className="hm__collabel">Más buscadas</p>
              {top.length === 0 ? (
                <div className="hm__sug" style={{ marginTop: 0 }}>
                  {POPULAR_QUERIES.map((q) => (
                    <button key={q} type="button" className="hm__chip" onClick={() => go(q)}>
                      {q}
                    </button>
                  ))}
                </div>
              ) : (
                <div className="hm__list">
                  {top.map((e, i) => (
                    <button key={e.query} type="button" className="hm__row" onClick={() => go(e.query)}>
                      <span className="hm__rank hm-mono">{i + 1}</span>
                      <span className="q">{e.query}</span>
                      <span className="hm__when hm-mono">{e.count}×</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div>
              <p className="hm__collabel">Recientes</p>
              {recent.length === 0 ? (
                <p className="hm__empty" style={{ marginTop: 0 }}>
                  Vas a ver acá las búsquedas que hagas recientemente.
                </p>
              ) : (
                <div className="hm__list">
                  {recent.map((e) => (
                    <button key={e.query} type="button" className="hm__row" onClick={() => go(e.query)}>
                      <span className="q">{e.query}</span>
                      <span className="hm__when hm-mono">{relativeTime(e.lastAt)}</span>
                      <ArrowUpRight className="w-3.5 h-3.5 flex-shrink-0" style={{ color: "var(--hm-faint)" }} />
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Accesos */}
          <div className="hm__sec">
            <h3>Accesos</h3>
          </div>
          <div className="hm__ctas">
            <Cta
              href="/proveedores"
              icon={Key}
              title="Cargar cuentas"
              description="Conectá el usuario y la contraseña de tu organización en cada proveedor"
            />
            <Cta
              href="/cart"
              icon={ShoppingCart}
              title="Ver carrito"
              description={`${totalCount} ${totalCount === 1 ? "unidad" : "unidades"} de ${cartProviders.length} proveedor${cartProviders.length !== 1 ? "es" : ""}`}
            />
            <Cta
              href="/search"
              icon={Package}
              title="Buscar productos"
              description="Consultá precios actualizados de los proveedores configurados"
            />
            {canTeam && (
              <Cta
                href="/equipo"
                icon={UserCog}
                title="Equipo"
                description="Agregá compradores y vendedores de tu local, sin pasar por administración"
              />
            )}
          </div>
        </div>
      </div>
    </>
  );
}

function Cta({
  href,
  icon: Icon,
  title,
  description,
}: {
  href: string;
  icon: React.ElementType;
  title: string;
  description: string;
}) {
  return (
    <Link href={href} className="hm__cta">
      <Icon className="w-4 h-4 hm__cta-ico" />
      <span className="hm__cta-body">
        <b>{title}</b>
        <span>{description}</span>
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
