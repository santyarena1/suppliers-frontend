import type { ReactNode } from "react";
import Link from "next/link";
import { Bell, Building2, MessageSquare, Search } from "lucide-react";
import { assetUrl } from "@/lib/assets";
import { CONTAINER } from "./Section";

export interface HeroStat {
  value: number;
  label: string;
}

/**
 * Portada de la marca: franja con su color, logo, título y descripción, y a la
 * derecha los números clave. Sin collage de fotos: la identidad la da el color
 * y, si la marca cargó una imagen de portada, va de fondo muy tenue.
 */
export function BrandHero({
  name,
  accent,
  logoUrl,
  heroUrl,
  headline,
  about,
  badge,
  connectedAt,
  stats,
  searchHref,
  chatHref,
  noticesHref,
  cta,
}: {
  name: string;
  accent: string;
  logoUrl: string | null;
  heroUrl: string | null;
  headline: string | null;
  about: string | null;
  badge?: ReactNode;
  connectedAt?: string;
  stats: HeroStat[];
  searchHref?: string;
  chatHref?: string;
  noticesHref?: string;
  /** Llamado propio de quien mira (p. ej. "Vincular con la marca" en el link público). */
  cta?: ReactNode;
}) {
  const connected = connectedAt
    ? new Date(connectedAt).toLocaleDateString("es-AR", { day: "numeric", month: "long", year: "numeric" })
    : null;
  return (
    <header className="relative overflow-hidden border-b border-white/[0.06] bg-surface-950">
      {heroUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={assetUrl(heroUrl)} alt="" className="absolute inset-0 h-full w-full object-cover opacity-20" />
      )}
      <div
        aria-hidden
        className="absolute inset-0"
        style={{
          background: `radial-gradient(110% 90% at 0% 0%, ${accent}40, transparent 58%), radial-gradient(70% 70% at 100% 100%, ${accent}1f, transparent 60%)`,
        }}
      />
      <div
        aria-hidden
        className="absolute inset-0 opacity-[0.35] [background-image:linear-gradient(rgba(255,255,255,0.05)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.05)_1px,transparent_1px)] [background-size:44px_44px] [mask-image:radial-gradient(ellipse_at_top_left,black,transparent_70%)]"
      />

      <div className={`${CONTAINER} relative grid gap-8 py-10 sm:py-14 lg:grid-cols-[1.5fr_1fr] lg:items-end`}>
        <div className="min-w-0">
          <div className="flex items-center gap-3">
            <div className="flex h-14 w-14 flex-shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-white ring-1 ring-white/20 shadow-lg shadow-black/30">
              {logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={assetUrl(logoUrl)} alt={name} className="h-full w-full object-contain p-2" />
              ) : (
                <Building2 className="h-6 w-6 text-surface-700" />
              )}
            </div>
            <div className="min-w-0">
              <p className="text-sm font-medium text-white">{name}</p>
              <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-surface-400">
                {badge}
                {connected && <span>Vinculada desde el {connected}</span>}
              </div>
            </div>
          </div>

          <h1 className="mt-6 max-w-2xl text-3xl font-semibold tracking-tight text-white text-balance sm:text-4xl">
            {headline || name}
          </h1>
          {about && <p className="mt-3 max-w-xl text-base leading-relaxed text-surface-300 text-pretty">{about}</p>}

          {(searchHref || chatHref || noticesHref) && (
            <div className="mt-6 flex flex-wrap gap-2">
              {searchHref && (
                <Link
                  href={searchHref}
                  className="inline-flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-[filter,transform] hover:brightness-110 active:translate-y-px"
                  style={{ background: accent }}
                >
                  <Search className="h-4 w-4" /> Comprar en mis distribuidores
                </Link>
              )}
              {chatHref && (
                <Link
                  href={chatHref}
                  className="inline-flex items-center gap-2 rounded-lg bg-white/[0.06] px-4 py-2.5 text-sm font-medium text-white ring-1 ring-white/10 transition-colors hover:bg-white/10"
                >
                  <MessageSquare className="h-4 w-4" /> Hablar con {name}
                </Link>
              )}
              {noticesHref && (
                <Link
                  href={noticesHref}
                  className="inline-flex items-center gap-2 rounded-lg px-3 py-2.5 text-sm font-medium text-surface-300 transition-colors hover:text-white"
                >
                  <Bell className="h-4 w-4" /> Notificaciones
                </Link>
              )}
            </div>
          )}
          {cta && <div className="mt-6">{cta}</div>}
        </div>

        {stats.length > 0 && (
          <dl className="grid grid-cols-3 overflow-hidden rounded-xl bg-white/[0.08] ring-1 ring-white/10 [&>div+div]:border-l [&>div+div]:border-white/10">
            {stats.map((s) => (
              <div key={s.label} className="bg-surface-950/70 px-4 py-4 backdrop-blur">
                <dt className="text-xs text-surface-400">{s.label}</dt>
                <dd className="mt-1 text-2xl font-semibold tabular-nums text-white">{s.value}</dd>
              </div>
            ))}
          </dl>
        )}
      </div>
    </header>
  );
}
