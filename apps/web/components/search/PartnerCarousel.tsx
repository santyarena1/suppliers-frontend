"use client";

import { useEffect, useState } from "react";
import { catalogApi, type ProviderDisplay } from "@/lib/api";
import { useMyProviders } from "@/lib/myProviders";
import { PROVIDER_TEXT_COLOR } from "@/lib/providerColors";

/**
 * Solo los proveedores del comercio: la tira de logos no puede delatar quién más
 * existe en NODO.
 */
export default function PartnerCarousel() {
  const { providers: mine } = useMyProviders();
  const [display, setDisplay] = useState<ProviderDisplay[]>([]);

  useEffect(() => {
    catalogApi.providerDisplay()
      .then((res) => setDisplay(res.data.filter((p) => p.visible)))
      .catch(() => setDisplay([]));
  }, []);

  const partners = mine
    .filter(({ provider }) => display.some((d) => d.provider === provider))
    .map(({ provider, name }) => ({
      provider,
      name,
      logoUrl: display.find((d) => d.provider === provider)?.logoUrl ?? null,
    }));

  if (partners.length === 0) return null;

  const items = [...partners, ...partners];

  return (
    <section className="mb-8 py-4 border-y border-surface-800 bg-surface-900/50 rounded-2xl">
      <p className="text-center text-[11px] font-semibold uppercase tracking-widest text-surface-500 mb-4 px-4">
        Proveedores que consultás en un solo lugar
      </p>
      <div className="relative overflow-hidden">
        <div className="flex animate-marquee gap-10 items-center">
          {items.map((p, i) => (
            <div
              key={`${p.provider}-${i}`}
              className="flex items-center gap-2 flex-shrink-0 px-2 opacity-80 hover:opacity-100 transition-opacity"
            >
              {p.logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={p.logoUrl}
                  alt={p.name}
                  className="h-8 w-auto max-w-[120px] object-contain object-left grayscale hover:grayscale-0 transition-all"
                />
              ) : (
                <span className={`text-sm font-bold whitespace-nowrap ${PROVIDER_TEXT_COLOR[p.provider] || "text-surface-400"}`}>
                  {p.name}
                </span>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
