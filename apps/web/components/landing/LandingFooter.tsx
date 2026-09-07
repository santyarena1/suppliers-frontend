"use client";

import Image from "next/image";
import Link from "next/link";
import { Shell } from "./ui";
import { RAIL } from "./LandingNav";

export default function LandingFooter() {
  return (
    <footer className="relative pt-16 pb-12" style={{ borderTop: "1px solid var(--hair)" }}>
      <Shell>
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-8">
          <div>
            <div className="flex items-center gap-2.5">
              <Image
                src="/logo-icon.png"
                alt=""
                width={262}
                height={260}
                className="w-6 h-6 object-contain"
                unoptimized
              />
              <span
                className="lnd-display text-[0.95rem] tracking-[0.16em]"
                style={{ fontVariationSettings: '"wdth" 92, "wght" 700' }}
              >
                NODO
              </span>
            </div>
            <p className="lnd-body mt-4 text-[0.82rem] max-w-sm">
              El catálogo de todos tus distribuidores, en una búsqueda, un carrito y un historial.
            </p>
          </div>

          <nav className="flex flex-wrap items-center gap-x-7 gap-y-3" aria-label="Pie">
            {RAIL.map((s) => (
              <a key={s.id} href={`#${s.id}`} className="lnd-label hover:text-[var(--mist)] transition-colors">
                {s.label}
              </a>
            ))}
            <Link href="/login" className="lnd-label hover:text-[var(--mist)] transition-colors">
              Entrar
            </Link>
          </nav>
        </div>

        <hr className="lnd-rule my-8" />

        <p className="lnd-note">
          © {new Date().getFullYear()} NODO. Los productos, precios y fuentes que aparecen en esta
          página son ilustrativos.
        </p>
      </Shell>
    </footer>
  );
}
