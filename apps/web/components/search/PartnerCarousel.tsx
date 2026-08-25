"use client";

import { useMyProviders } from "@/lib/myProviders";
import ProviderBadge from "@/components/ProviderBadge";

/**
 * Solo los proveedores del comercio: la tira de logos no puede delatar quién más
 * existe en NODO.
 */
export default function PartnerCarousel() {
  const { providers: mine, loading } = useMyProviders();
  const partners = mine.filter((p) => p.linked);

  if (loading) {
    return (
      <section className="mb-8 py-8 border-y border-surface-800 bg-surface-900/50 rounded-2xl">
        <p className="text-center text-[11px] font-semibold uppercase tracking-widest text-surface-600">
          Cargando proveedores…
        </p>
      </section>
    );
  }

  if (partners.length === 0) return null;

  const items = [...partners, ...partners];

  return (
    <section className="mb-8 py-5 border-y border-surface-800 bg-surface-900/50 rounded-2xl">
      <p className="text-center text-[11px] font-semibold uppercase tracking-widest text-surface-500 mb-5 px-4">
        Proveedores que consultás en un solo lugar
      </p>
      <div className="relative overflow-hidden">
        <div className="flex animate-marquee gap-12 items-center">
          {items.map((p, i) => (
            <div
              key={`${p.provider}-${i}`}
              className="flex-shrink-0 px-2 opacity-90 hover:opacity-100 transition-opacity"
            >
              <ProviderBadge
                provider={p.provider}
                label={p.name}
                variant="stacked"
                size="lg"
                className="min-w-[88px]"
              />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
