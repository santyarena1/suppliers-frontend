"use client";

import Link from "next/link";
import Image from "next/image";
import { useEffect, useState } from "react";
import { Button, Shell } from "./ui";

export const RAIL = [
  { id: "buscar", n: "01", label: "Búsqueda" },
  { id: "costo", n: "02", label: "Costo" },
  { id: "comprar", n: "03", label: "Compra" },
  { id: "empezar", n: "04", label: "Empezar" },
  { id: "planes", n: "05", label: "Planes" },
];

export function LandingNav() {
  const [lifted, setLifted] = useState(false);

  useEffect(() => {
    const onScroll = () => setLifted(window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header className="fixed inset-x-0 top-0 z-50 pt-4 sm:pt-6">
      <Shell>
        <div
          className="flex items-center justify-between gap-6 rounded-lg px-4 sm:px-5 py-3 transition-[background-color,border-color,backdrop-filter] duration-300"
          style={{
            backgroundColor: lifted ? "rgb(11 13 26 / 0.82)" : "transparent",
            border: `1px solid ${lifted ? "rgb(191 210 255 / 0.14)" : "transparent"}`,
            backdropFilter: lifted ? "blur(14px)" : "none",
          }}
        >
          <Link href="/landing" className="flex items-center gap-2.5" aria-label="NODO, inicio">
            <Image src="/logo-icon.png" alt="" width={262} height={260} className="w-6 h-6 object-contain" unoptimized priority />
            <span
              className="lnd-display text-[0.95rem] tracking-[0.16em]"
              style={{ fontVariationSettings: '"wdth" 92, "wght" 700' }}
            >
              NODO
            </span>
          </Link>

          <nav className="hidden lg:flex items-center gap-8" aria-label="Secciones">
            {RAIL.map((s) => (
              <a key={s.id} href={`#${s.id}`} className="lnd-label hover:text-[var(--mist)] transition-colors">
                {s.label}
              </a>
            ))}
          </nav>

          <div className="flex items-center gap-3">
            <Link href="/login" className="lnd-label hover:text-[var(--mist)] transition-colors hidden sm:block">
              Entrar
            </Link>
            <Button href="#cuenta" className="!py-2.5 !px-4">
              Crear cuenta
            </Button>
          </div>
        </div>
      </Shell>
    </header>
  );
}

export function SectionRail() {
  const [active, setActive] = useState<string>("buscar");

  useEffect(() => {
    const sections = RAIL.map((s) => document.getElementById(s.id)).filter(
      (el): el is HTMLElement => Boolean(el)
    );
    if (sections.length === 0) return;
    const io = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
        if (visible) setActive(visible.target.id);
      },
      { rootMargin: "-35% 0px -50% 0px", threshold: [0.05, 0.3, 0.6] }
    );
    sections.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);

  return (
    <div className="lnd-rail" aria-hidden="true">
      {RAIL.map((s) => (
        <a key={s.id} href={`#${s.id}`} data-on={active === s.id} tabIndex={-1}>
          <span className="lnd-rail__tick" />
          <span className="lnd-mono text-[0.62rem] tracking-[0.18em]">{s.n}</span>
          <span className="lnd-label text-[0.58rem]">{s.label}</span>
        </a>
      ))}
    </div>
  );
}
