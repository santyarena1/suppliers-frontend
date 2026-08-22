"use client";

import { useEffect, useState } from "react";
import { catalogApi, type ProviderDisplay } from "@/lib/api";
import { ALL_PROVIDERS } from "@/lib/api";
import { PROVIDER_TEXT_COLOR } from "@/lib/providerColors";

export default function PartnerCarousel() {
  const [partners, setPartners] = useState<ProviderDisplay[]>([]);

  useEffect(() => {
    catalogApi.providerDisplay()
      .then((res) => {
        const visible = res.data.filter((p) => p.visible && (p.logoUrl || true));
        const ordered = ALL_PROVIDERS
          .map((id) => visible.find((p) => p.provider === id))
          .filter((p): p is ProviderDisplay => !!p);
        setPartners(ordered.length > 0 ? ordered : visible);
      })
      .catch(() => setPartners([]));
  }, []);

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
                  alt={p.provider}
                  className="h-8 w-auto max-w-[120px] object-contain object-left grayscale hover:grayscale-0 transition-all"
                />
              ) : (
                <span className={`text-sm font-bold whitespace-nowrap ${PROVIDER_TEXT_COLOR[p.provider] || "text-surface-400"}`}>
                  {p.provider.replace(/_/g, " ")}
                </span>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
