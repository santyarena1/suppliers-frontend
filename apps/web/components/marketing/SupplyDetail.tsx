import Link from "next/link";
import { ArrowLeft, ArrowRight, Check } from "lucide-react";
import type { SupplyAudience } from "@/lib/marketing-supply";
import { Footer } from "./Footer";
import { Nav } from "./Nav";
import { PageField } from "./PageField";
import { Reveal } from "./Reveal";

/**
 * Página de detalle para distribuidores o marcas: qué gana, una vista de la
 * pantalla principal y todo lo que puede hacer, agrupado como en el menú de la app.
 */
export function SupplyDetail({ audience, preview }: { audience: SupplyAudience; preview: React.ReactNode }) {
  const other = audience.kind === "marcas" ? { href: "/landing/distribuidores", label: "NODO para distribuidores" } : { href: "/landing/marcas", label: "NODO para marcas" };
  return (
    <div className="nl">
      <PageField />
      <Nav />
      <main className="relative z-[1]">
        <section className="nl-section">
          <div className="nl-shell grid items-center gap-12 lg:grid-cols-[1fr_1.05fr] lg:gap-16">
            <Reveal>
              <Link href="/landing#planes" className="inline-flex items-center gap-1.5 text-sm text-[var(--fg-3)] hover:text-white">
                <ArrowLeft className="h-4 w-4" aria-hidden /> Volver a NODO
              </Link>
              <p className="nl-kicker mt-8">{audience.name}</p>
              <h1 className="nl-h1 mt-3">{audience.title}</h1>
              <p className="nl-lead mt-6">{audience.intro}</p>
              <div className="mt-9 flex flex-wrap items-center gap-3">
                <a href="/landing#probar" className="nl-btn nl-btn--primary">
                  Crear cuenta <ArrowRight className="h-4 w-4" aria-hidden />
                </a>
                <span className="text-sm text-[var(--fg-3)]">Creás la cuenta y te habilitamos el espacio.</span>
              </div>
            </Reveal>
            <Reveal delay={120}>{preview}</Reveal>
          </div>
        </section>

        <section className="nl-section nl-divider">
          <div className="nl-shell">
            <Reveal>
              <h2 className="nl-h2 max-w-3xl">Todo lo que podés hacer</h2>
              <p className="nl-lead mt-5">Cada bloque es una pantalla de tu espacio en NODO.</p>
            </Reveal>
            <div className="mt-12 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {audience.groups.map((g, i) => (
                <Reveal key={g.title} delay={(i % 3) * 70}>
                  <article className="flex h-full flex-col rounded-[var(--r)] border border-[var(--line)] bg-[var(--bg-2)] p-6">
                    <span className="font-mono text-xs tabular-nums text-[var(--accent-2)]">{String(i + 1).padStart(2, "0")}</span>
                    <h3 className="nl-h3 mt-3 text-white">{g.title}</h3>
                    <p className="mt-2 text-[0.95rem] leading-relaxed text-[var(--fg-2)]">{g.text}</p>
                    <ul className="mt-5 flex flex-col gap-2.5">
                      {g.items.map((it) => (
                        <li key={it} className="flex items-start gap-2.5 text-sm leading-snug text-[var(--fg)]">
                          <Check className="mt-0.5 h-4 w-4 flex-shrink-0 text-[var(--accent-2)]" aria-hidden /> {it}
                        </li>
                      ))}
                    </ul>
                  </article>
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        <section className="nl-section nl-divider">
          <div className="nl-shell">
            <Reveal>
              <div className="nl-surface flex flex-col items-start gap-6 p-7 sm:p-10 md:flex-row md:items-center md:justify-between">
                <div>
                  <h2 className="nl-h2">Sumate a NODO</h2>
                  <p className="nl-body mt-3 max-w-[52ch]">
                    El plan para {audience.kind} lo armamos con vos, según tu canal. Creás la cuenta y te habilitamos el
                    espacio.
                  </p>
                </div>
                <div className="flex flex-col items-start gap-3">
                  <a href="/landing#probar" className="nl-btn nl-btn--primary">
                    Crear cuenta <ArrowRight className="h-4 w-4" aria-hidden />
                  </a>
                  <Link href={other.href} className="text-sm text-[var(--fg-2)] underline underline-offset-4 hover:text-white">
                    Ver {other.label}
                  </Link>
                </div>
              </div>
            </Reveal>
          </div>
        </section>
      </main>
      <div className="relative z-[1]">
        <Footer />
      </div>
      <div className="lnd-grain" aria-hidden />
    </div>
  );
}
