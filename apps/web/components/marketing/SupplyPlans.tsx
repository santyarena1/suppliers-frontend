import Link from "next/link";
import { ArrowRight, Check, Factory, Warehouse } from "lucide-react";
import { SUPPLY } from "@/lib/marketing-supply";
import { Reveal } from "./Reveal";

const ICONS = { distribuidores: Warehouse, marcas: Factory } as const;

/**
 * Planes para quien vende: distribuidores y marcas. Sin precio publicado; cada
 * tarjeta lleva a su página con todo lo que puede hacer.
 */
export function SupplyPlans() {
  return (
    <div className="mt-20">
      <Reveal>
        <h3 className="nl-h3 text-white">¿Sos distribuidor o marca?</h3>
        <p className="nl-body mt-2 max-w-[60ch]">
          NODO también es para los que venden. Cada uno entra con su propio espacio; el plan lo armamos con vos según tu
          canal.
        </p>
      </Reveal>
      <div className="mt-8 grid gap-5 md:grid-cols-2">
        {(["distribuidores", "marcas"] as const).map((kind, i) => {
          const a = SUPPLY[kind];
          const Icon = ICONS[kind];
          return (
            <Reveal key={kind} delay={i * 90}>
              <article className="flex h-full flex-col rounded-[var(--r)] border border-[var(--line)] bg-[var(--bg-2)] p-7 sm:p-8">
                <div className="flex items-center gap-3">
                  <span className="flex h-10 w-10 items-center justify-center rounded-[10px] bg-[var(--accent-soft)]">
                    <Icon className="h-5 w-5 text-[var(--accent-2)]" aria-hidden />
                  </span>
                  <h4 className="text-xl font-semibold text-white">{a.name}</h4>
                </div>
                <p className="mt-4 text-[0.975rem] leading-relaxed text-[var(--fg-2)]">{a.lead}</p>
                <ul className="mt-6 flex flex-1 flex-col gap-3">
                  {a.highlights.map((h) => (
                    <li key={h} className="flex items-start gap-3 text-[0.95rem] leading-snug text-[var(--fg)]">
                      <Check className="mt-0.5 h-4 w-4 flex-shrink-0 text-[var(--accent-2)]" aria-hidden /> {h}
                    </li>
                  ))}
                </ul>
                <div className="mt-8 flex flex-wrap items-center gap-3">
                  <Link href={a.href} className="nl-btn nl-btn--primary">
                    Ver todo lo que podés hacer <ArrowRight className="h-4 w-4" aria-hidden />
                  </Link>
                  <Link href={`${a.href}#contacto`} className="text-sm text-[var(--fg-2)] underline underline-offset-4 hover:text-white">
                    Pedir precio a medida
                  </Link>
                </div>
              </article>
            </Reveal>
          );
        })}
      </div>
    </div>
  );
}
